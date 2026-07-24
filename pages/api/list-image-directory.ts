import type { NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';

interface ListDirectoryResponse {
  folders?: string[];
  error?: string;
}

function getAllowedRoots(): string[] {
  const configured = process.env.IMAGE_DIRS;
  if (configured) {
    return configured
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => path.resolve(p.startsWith('~') ? path.join(process.env.HOME || '', p.slice(1)) : p));
  }
  return [path.resolve(process.cwd())];
}

function isPathAllowed(resolvedPath: string, allowedRoots: string[]): boolean {
  const normalized = path.resolve(resolvedPath);
  return allowedRoots.some((root) => {
    const normalizedRoot = path.resolve(root);
    return normalized === normalizedRoot || normalized.startsWith(normalizedRoot + path.sep);
  });
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<ListDirectoryResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (process.env.VERCEL) {
    return res.status(501).json({
      error: 'Deze functie is niet beschikbaar op Vercel. Gebruik de afbeeldingen upload pagina (/image-upload) in plaats van server-side bestandstoegang.',
    });
  }

  try {
    const { imageFolderPath } = req.body as { imageFolderPath: string };

    if (!imageFolderPath) {
      return res.status(400).json({ error: 'Missing imageFolderPath' });
    }

    // Expand tilde to home directory
    let expandedPath = imageFolderPath;
    if (expandedPath.startsWith('~')) {
      expandedPath = path.join(process.env.HOME || '', expandedPath.slice(1));
    }

    const resolvedPath = path.resolve(expandedPath);
    const allowedRoots = getAllowedRoots();
    if (!isPathAllowed(resolvedPath, allowedRoots)) {
      return res.status(403).json({
        error: 'Path not allowed. Directory must be under process.cwd() or IMAGE_DIRS allowlist.',
      });
    }

    // Check if directory exists
    if (!fs.existsSync(resolvedPath)) {
      return res.status(400).json({ error: `Directory not found: ${resolvedPath}` });
    }

    // List subdirectories
    const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
    const folders = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();

    console.log(`📁 Listed ${folders.length} folders from ${resolvedPath}`);

    return res.status(200).json({ folders });
  } catch (error) {
    console.error('❌ Error listing directory:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      error: err.message || 'Failed to list directory',
    });
  }
}

export default withAuth(handler);
