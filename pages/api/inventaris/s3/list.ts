import type { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/lib/middleware/withAuth';
import { S3Client, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-central-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || '';

export default withAuth(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!BUCKET_NAME) {
    return res.status(500).json({ error: 'S3 bucket not configured' });
  }

  try {
    const session = req.session;
    const userId = session.user?.uid?.toString() || 'default';
    const prefix = `inventories/${userId}/`;

    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
    });

    const response = await s3Client.send(command);

    // Fetch metadata for each object to get rowCount
    const inventories = await Promise.all(
      (response.Contents || []).map(async (object) => {
        const key = object.Key || '';
        const filename = key.split('/').pop() || '';
        const name = filename.replace(/\.json$/, '').replace(/-\d+$/, ''); // Remove timestamp
        const id = key;
        
        let rowCount = 0;
        try {
          const headCommand = new HeadObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
          });
          const headResponse = await s3Client.send(headCommand);
          // S3 metadata keys are lowercase
          rowCount = headResponse.Metadata?.['rowcount'] 
            ? parseInt(headResponse.Metadata['rowcount'], 10) 
            : 0;
        } catch {
          // If metadata fetch fails, rowCount stays 0
        }

        return {
          id,
          name,
          timestamp: object.LastModified?.toISOString() || new Date().toISOString(),
          size: object.Size || 0,
          key,
          rowCount,
        };
      })
    );

    // Sort by timestamp (newest first)
    inventories.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return res.status(200).json({ inventories });
  } catch (error) {
    console.error('Error listing S3 inventories:', error);
    return res.status(500).json({ 
      error: 'Failed to list inventories',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

