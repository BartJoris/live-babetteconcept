import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

interface ListDirectoryResponse {
  folders?: string[];
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListDirectoryResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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

    // Check if directory exists
    if (!fs.existsSync(expandedPath)) {
      return res.status(400).json({ error: `Directory not found: ${expandedPath}` });
    }

    // List subdirectories
    const entries = fs.readdirSync(expandedPath, { withFileTypes: true });
    const folders = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();

    console.log(`📁 Listed ${folders.length} folders from ${expandedPath}`);

    return res.status(200).json({ folders });
  } catch (error) {
    console.error('❌ Error listing directory:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      error: err.message || 'Failed to list directory',
    });
  }
}






