/**
 * Minimal GitHub REST/Git Data API client used to automatically open a
 * "new supplier" onboarding PR (branch + sample files + concept parser).
 *
 * Uses plain `fetch` (same pattern as lib calls to OpenAI elsewhere in this
 * codebase) instead of an SDK like @octokit/rest to avoid a new dependency
 * for what is a handful of well-defined REST calls.
 */

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'BartJoris';
const GITHUB_REPO = process.env.GITHUB_REPO || 'live-babetteconcept';

export class GitHubConfigError extends Error {}
export class GitHubApiError extends Error {
  constructor(message: string, public status: number, public body: string) {
    super(message);
  }
}

export interface CommitFileInput {
  path: string;
  content: string;
  /** 'utf-8' for text files, 'base64' for binary (e.g. PDF samples). */
  encoding: 'utf-8' | 'base64';
}

export interface OpenPullRequestInput {
  branch: string;
  base: string;
  title: string;
  body: string;
}

export interface OpenPullRequestResult {
  htmlUrl: string;
  number: number;
}

function getToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new GitHubConfigError(
      'GITHUB_TOKEN ontbreekt. Maak een fine-grained Personal Access Token aan (Contents + Pull requests: Read & write) en zet deze in de environment variables.'
    );
  }
  return token;
}

async function githubRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GitHubApiError(`GitHub API ${options.method || 'GET'} ${path} faalde (${res.status})`, res.status, body);
  }

  return res.json() as Promise<T>;
}

function repoPath(path: string): string {
  return `/repos/${GITHUB_OWNER}/${GITHUB_REPO}${path}`;
}

/** Resolve the repo's default branch name and the sha it currently points at. */
export async function getDefaultBranchRef(): Promise<{ branch: string; sha: string }> {
  const repo = await githubRequest<{ default_branch: string }>(repoPath(''));
  const branch = repo.default_branch;
  const ref = await githubRequest<{ object: { sha: string } }>(
    repoPath(`/git/ref/heads/${encodeURIComponent(branch)}`)
  );
  return { branch, sha: ref.object.sha };
}

/** Read a file's current text content + blob sha from a given ref (branch/sha). Returns null if it doesn't exist. */
export async function getFileContent(path: string, ref: string): Promise<{ content: string; sha: string } | null> {
  try {
    const data = await githubRequest<{ content: string; encoding: string; sha: string }>(
      repoPath(`/contents/${path}?ref=${encodeURIComponent(ref)}`)
    );
    const content = data.encoding === 'base64'
      ? Buffer.from(data.content, 'base64').toString('utf-8')
      : data.content;
    return { content, sha: data.sha };
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) return null;
    throw error;
  }
}

export async function createBranch(branchName: string, fromSha: string): Promise<void> {
  await githubRequest(repoPath('/git/refs'), {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: fromSha }),
  });
}

async function createBlob(content: string, encoding: 'utf-8' | 'base64'): Promise<string> {
  const data = await githubRequest<{ sha: string }>(repoPath('/git/blobs'), {
    method: 'POST',
    body: JSON.stringify({ content, encoding }),
  });
  return data.sha;
}

async function getCommitTreeSha(commitSha: string): Promise<string> {
  const commit = await githubRequest<{ tree: { sha: string } }>(repoPath(`/git/commits/${commitSha}`));
  return commit.tree.sha;
}

/**
 * Commit one or more files to a branch in a single commit, via the Git Data API
 * (blobs -> tree -> commit -> update ref). `baseCommitSha` is the commit the
 * branch currently points at (e.g. the sha returned by createBranch's fromSha).
 */
export async function commitFiles(
  branch: string,
  baseCommitSha: string,
  files: CommitFileInput[],
  message: string
): Promise<string> {
  const baseTreeSha = await getCommitTreeSha(baseCommitSha);

  const blobs = await Promise.all(
    files.map(async f => ({ path: f.path, sha: await createBlob(f.content, f.encoding) }))
  );

  const tree = await githubRequest<{ sha: string }>(repoPath('/git/trees'), {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: blobs.map(b => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })),
    }),
  });

  const commit = await githubRequest<{ sha: string }>(repoPath('/git/commits'), {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [baseCommitSha] }),
  });

  await githubRequest(repoPath(`/git/refs/heads/${encodeURIComponent(branch)}`), {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return commit.sha;
}

export async function openPullRequest(input: OpenPullRequestInput): Promise<OpenPullRequestResult> {
  const pr = await githubRequest<{ html_url: string; number: number }>(repoPath('/pulls'), {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      head: input.branch,
      base: input.base,
    }),
  });
  return { htmlUrl: pr.html_url, number: pr.number };
}

export async function getPullRequest(prNumber: number): Promise<{
  state: 'open' | 'closed';
  merged: boolean;
  mergeable: boolean | null;
}> {
  const pr = await githubRequest<{ state: 'open' | 'closed'; merged: boolean; mergeable: boolean | null }>(
    repoPath(`/pulls/${prNumber}`)
  );
  return { state: pr.state, merged: pr.merged, mergeable: pr.mergeable };
}

export interface WorkflowRunSummary {
  status: 'queued' | 'in_progress' | 'completed' | string;
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null | string;
  htmlUrl: string;
}

/**
 * Find the most recent workflow run for a branch (used to poll the "Supplier
 * Onboarding Agent" GitHub Actions run triggered when the onboarding PR opens).
 * Returns null if no run has started yet (e.g. GitHub hasn't picked it up yet).
 */
export async function getLatestWorkflowRunForBranch(branch: string): Promise<WorkflowRunSummary | null> {
  // The run itself executes against the default branch (workflow_dispatch's
  // `ref`), so we can't filter the /actions/runs list by the PR branch name -
  // instead fetch the workflow's own recent runs and match on the "branch"
  // input we passed to dispatchWorkflow().
  const data = await githubRequest<{
    workflow_runs: Array<{ status: string; conclusion: string | null; html_url: string; display_title?: string }>;
  }>(
    repoPath(`/actions/workflows/supplier-onboarding-agent.yml/runs?event=workflow_dispatch&per_page=10`)
  );
  const run = data.workflow_runs.find(r => r.display_title?.includes(branch));
  if (!run) return null;
  return { status: run.status, conclusion: run.conclusion, htmlUrl: run.html_url };
}

/**
 * Trigger a `workflow_dispatch` run for the given workflow file. Used instead
 * of relying on the `pull_request: opened` event so that the self-hosted
 * runner (see .github/workflows/supplier-onboarding-agent.yml) can only ever
 * be started by our own backend's GITHUB_TOKEN - a fork opening a PR against
 * this (public) repo cannot cause this call, and therefore cannot trigger a
 * run on our runner. `ref` must be a branch on which the workflow file
 * exists (the default branch), not the target PR branch; the PR branch is
 * passed via `inputs.branch` instead.
 */
export async function dispatchWorkflow(
  workflowFile: string,
  ref: string,
  inputs: Record<string, string>
): Promise<void> {
  await githubRequest(repoPath(`/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`), {
    method: 'POST',
    body: JSON.stringify({ ref, inputs }),
  });
}

export function getRepoHttpsUrl(): string {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
}

/**
 * Insert `import x from './x';` (appended after the last import) and an entry
 * in the `allPlugins` array of lib/suppliers/index.ts. Deliberately simple
 * (append rather than alphabetically re-sort) to minimize the chance of a
 * regex-based edit corrupting a file shared by ~30 other suppliers.
 */
export function patchSupplierRegistry(indexTsContent: string, id: string, displayName: string): string {
  if (indexTsContent.includes(`from './${id}'`)) {
    // Already registered (shouldn't happen given the earlier collision check).
    return indexTsContent;
  }

  const importLine = `import ${id} from './${id}';`;
  const lastImportMatch = [...indexTsContent.matchAll(/^import .+;$/gm)].pop();
  let updated = indexTsContent;

  if (lastImportMatch) {
    const insertAt = lastImportMatch.index! + lastImportMatch[0].length;
    updated = `${updated.slice(0, insertAt)}\n${importLine}${updated.slice(insertAt)}`;
  } else {
    updated = `${importLine}\n${updated}`;
  }

  const arrayEntry = `  ${id},${' '.repeat(Math.max(1, 16 - id.length))}// ${displayName} (auto-onboarding)\n];`;
  updated = updated.replace(/\n\];/, `\n${arrayEntry}`);

  return updated;
}

/**
 * Insert a stub detection rule (low-confidence, filename-based) into the
 * SUPPLIER_RULES array of pages/api/detect-supplier.ts. The "Supplier Onboarding
 * Agent" GitHub Actions workflow is expected to refine this using the real
 * sample headers committed alongside it.
 */
export function patchDetectSupplierStub(detectTsContent: string, id: string, displayName: string): string {
  if (detectTsContent.includes(`supplierId: '${id}'`)) {
    return detectTsContent;
  }

  const stub = `
  // ── ${displayName} (auto-onboarding stub — TODO: agent verfijnt dit) ──
  {
    supplierId: '${id}',
    supplierName: '${displayName.replace(/'/g, "\\'")}',
    csvRules: [{
      fileInputId: 'main_csv',
      fileInputLabel: '${displayName.replace(/'/g, "\\'")} CSV',
      detect: (_headers, _text, fileName) => {
        // TODO(agent): vervang door echte header/inhoud-detectie op basis van
        // lib/suppliers/${id}/samples/*.
        return fileName.toLowerCase().includes('${id}') ? 0.6 : 0;
      },
      reason: 'Stub-detectie: bestandsnaam bevat "${id}" (TODO: verfijnen)',
    }],
  },
];`;

  const marker = '\n];\n\nfunction detectCSV(';
  if (!detectTsContent.includes(marker)) {
    throw new Error('Kon SUPPLIER_RULES-array niet vinden in detect-supplier.ts (bestandsstructuur gewijzigd?)');
  }
  return detectTsContent.replace(marker, `${stub}\n\nfunction detectCSV(`);
}
