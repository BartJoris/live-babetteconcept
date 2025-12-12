import type { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/lib/middleware/withAuth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-central-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || '';

export default withAuth(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!BUCKET_NAME) {
    return res.status(500).json({ error: 'S3 bucket not configured' });
  }

  try {
    const { name, data } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!data || !Array.isArray(data.rows)) {
      return res.status(400).json({ error: 'Invalid data format. Expected { rows: InventoryRow[] }' });
    }

    const session = req.session;
    const userId = session.user?.uid?.toString() || 'default';
    
    // Sanitize filename
    const sanitizedName = name.trim().replace(/[^a-zA-Z0-9-_]/g, '-');
    const key = `inventories/${userId}/${sanitizedName}-${Date.now()}.json`;
    
    const jsonData = JSON.stringify(data, null, 2);

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: jsonData,
      ContentType: 'application/json',
      Metadata: {
        userId,
        name: sanitizedName,
        rowCount: data.rows.length.toString(),
      },
    });

    await s3Client.send(command);

    return res.status(200).json({ 
      success: true,
      key,
      message: `Inventaris "${name}" opgeslagen in S3 (${data.rows.length} items)`
    });
  } catch (error) {
    console.error('Error uploading to S3:', error);
    return res.status(500).json({ 
      error: 'Failed to upload to S3',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

