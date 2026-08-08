import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { rateLimitSupplierOnboard } from '@/lib/middleware/rateLimiter';
import { generatePluginCode } from '@/lib/suppliers/onboarding/generatePluginCode';
import type { AISuggestion } from '@/lib/suppliers/onboarding/types';
import {
  GitHubConfigError,
  GitHubApiError,
  getDefaultBranchRef,
  getFileContent,
  createBranch,
  commitFiles,
  openPullRequest,
  patchSupplierRegistry,
  patchDetectSupplierStub,
  type CommitFileInput,
} from '@/lib/github/repoWriter';

interface SourceFile {
  fileName: string;
  isPdf: boolean;
  encoding: 'utf-8' | 'base64';
  content: string;
}

interface OnboardRequestBody {
  supplierConfig: AISuggestion;
  columnMappings: Record<string, string>;
  files: SourceFile[];
  imageFilenames?: string[];
}

interface OnboardResponse {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  branch?: string;
  error?: string;
}

const ID_PATTERN = /^[a-z][a-z0-9]{1,40}$/;
const SUPPLIERS_INDEX_PATH = 'lib/suppliers/index.ts';
const DETECT_SUPPLIER_PATH = 'pages/api/detect-supplier.ts';

/** Sanitize an uploaded filename so it's safe to use as a git path segment. */
function sanitizeFilename(name: string): string {
  return name.replace(/[\\/]/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'bestand';
}

function validate(body: OnboardRequestBody): string | null {
  if (!body?.supplierConfig) return 'Geen leverancier-configuratie meegegeven.';
  const { id, displayName, brandName } = body.supplierConfig;
  if (!id || !ID_PATTERN.test(id)) return 'Ongeldig leverancier-ID (verwacht lowercase letters/cijfers, bv. "acme").';
  if (!displayName?.trim()) return 'Weergavenaam is verplicht.';
  if (!brandName?.trim()) return 'Merknaam is verplicht.';
  if (!Array.isArray(body.files) || body.files.length === 0) return 'Geen voorbeeldbestanden meegegeven.';
  return null;
}

async function handler(req: NextApiRequestWithSession, res: NextApiResponse<OnboardResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const allowed = await rateLimitSupplierOnboard(req, res);
  if (!allowed) return; // response already sent

  const body = req.body as OnboardRequestBody;
  const validationError = validate(body);
  if (validationError) {
    return res.status(400).json({ success: false, error: validationError });
  }

  const { supplierConfig, columnMappings, files, imageFilenames } = body;
  const { id, displayName } = supplierConfig;

  try {
    // 1. Resolve default branch + check for an id collision against the live registry.
    const { branch: baseBranch, sha: baseSha } = await getDefaultBranchRef();

    const indexFile = await getFileContent(SUPPLIERS_INDEX_PATH, baseBranch);
    if (!indexFile) {
      return res.status(500).json({ success: false, error: `Kon ${SUPPLIERS_INDEX_PATH} niet lezen op GitHub.` });
    }
    if (indexFile.content.includes(`from './${id}'`)) {
      return res.status(409).json({ success: false, error: `Leverancier-ID "${id}" bestaat al in ${SUPPLIERS_INDEX_PATH}.` });
    }

    const detectFile = await getFileContent(DETECT_SUPPLIER_PATH, baseBranch);
    if (!detectFile) {
      return res.status(500).json({ success: false, error: `Kon ${DETECT_SUPPLIER_PATH} niet lezen op GitHub.` });
    }

    // 2. Generate the first-draft plugin code (same generator as the manual wizard).
    const { code: pluginCode, filePath: pluginFilePath } = generatePluginCode({
      config: supplierConfig,
      columnMappings,
      uploadedFiles: files.map(f => ({ fileName: f.fileName, isPdf: f.isPdf })),
      imageFilenames,
    });

    const patchedIndex = patchSupplierRegistry(indexFile.content, id, displayName);
    const patchedDetect = patchDetectSupplierStub(detectFile.content, id, displayName);

    const commitFilesInput: CommitFileInput[] = [
      { path: pluginFilePath, content: pluginCode, encoding: 'utf-8' },
      { path: SUPPLIERS_INDEX_PATH, content: patchedIndex, encoding: 'utf-8' },
      { path: DETECT_SUPPLIER_PATH, content: patchedDetect, encoding: 'utf-8' },
      ...files.map(f => ({
        path: `lib/suppliers/${id}/samples/${sanitizeFilename(f.fileName)}`,
        content: f.content,
        encoding: f.encoding,
      })),
    ];

    if (imageFilenames && imageFilenames.length > 0) {
      commitFilesInput.push({
        path: `lib/suppliers/${id}/samples/image-filenames.txt`,
        content: imageFilenames.join('\n'),
        encoding: 'utf-8',
      });
    }

    // 3. Branch name must start with "supplier/" — the GitHub Actions workflow
    // (.github/workflows/supplier-onboarding-agent.yml) only triggers on that prefix.
    const branchName = `supplier/${id}-${Date.now()}`;
    await createBranch(branchName, baseSha);
    await commitFiles(branchName, baseSha, commitFilesInput, `Nieuwe leverancier: ${displayName} (auto-onboarding concept)`);

    const prBody = [
      `Automatisch aangemaakt via **Slim uploaden** \u2192 "Nieuwe leverancier toevoegen" voor **${displayName}**.`,
      '',
      '### Inhoud van deze PR',
      `- Concept-parser: \`${pluginFilePath}\` (gegenereerd, bevat mogelijk TODO's)`,
      `- Sample-bestanden: \`lib/suppliers/${id}/samples/\``,
      `- Registratie toegevoegd in \`${SUPPLIERS_INDEX_PATH}\``,
      `- Stub-detectieregel toegevoegd in \`${DETECT_SUPPLIER_PATH}\` (TODO: verfijnen)`,
      '',
      '### Status',
      '- [ ] De "Supplier Onboarding Agent" GitHub Actions-run (Claude Code) verfijnt de parser, voegt tests toe en draait `npm run verify` — zie het "Checks" tabblad hierboven',
      '- [ ] Handmatige review',
      '- [ ] Merge (dit gaat pas dan live via Vercel)',
      '',
      '_Deze PR merget niet vanzelf \u2014 controleer de wijzigingen voordat je op Merge klikt._',
    ].join('\n');

    const pr = await openPullRequest({
      branch: branchName,
      base: baseBranch,
      title: `Nieuwe leverancier: ${displayName}`,
      body: prBody,
    });

    // Note: no explicit "start agent" call here. Opening this PR fires GitHub's
    // `pull_request: opened` event, which the repo's onboarding workflow picks
    // up automatically (see .github/workflows/supplier-onboarding-agent.yml).
    return res.status(200).json({
      success: true,
      prUrl: pr.htmlUrl,
      prNumber: pr.number,
      branch: branchName,
    });
  } catch (error) {
    if (error instanceof GitHubConfigError) {
      return res.status(500).json({ success: false, error: error.message });
    }
    if (error instanceof GitHubApiError) {
      return res.status(502).json({ success: false, error: `${error.message}: ${error.body}` });
    }
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
}

export default withAuth(handler);
