import type { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/lib/middleware/withAuth';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
    const { key } = req.query;

    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'Key is required' });
    }

    const session = req.session;
    const userId = session.user?.uid?.toString() || 'default';

    // Verify the key belongs to this user
    if (!key.startsWith(`inventories/${userId}/`)) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    // Get signed URL for download (valid for 1 hour)
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return res.status(200).json({ url });
  } catch (error) {
    console.error('Error generating download URL:', error);
    return res.status(500).json({ 
      error: 'Failed to generate download URL',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

