import type { NextApiRequest, NextApiResponse } from 'next';
import { OdooImageService } from '@/lib/import/services';

interface UploadRequest {
  templateId: number;
  base64Image: string;
  imageName: string;
  sequence: number;
  isMainImage: boolean;
  odooUid: string;
  odooPassword: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      templateId,
      base64Image,
      imageName,
      sequence,
      isMainImage,
      odooUid,
      odooPassword
    } = req.body as UploadRequest;

    if (!templateId || !base64Image || !odooUid || !odooPassword) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const uid = parseInt(odooUid);
    const imageService = new OdooImageService(uid, odooPassword);

    let imageId: number | null = null;

    if (isMainImage) {
      console.log(`🖼️ Setting main image for template ${templateId}...`);
      await imageService.setMainImage(templateId, base64Image);
      console.log(`✅ Main image set (no product.image record created to avoid duplicates)`);
    } else {
      imageId = await imageService.addGalleryImage(templateId, imageName, base64Image, sequence);
      console.log(`✅ Created product.image ${imageId} for template ${templateId}`);
    }

    return res.status(200).json({
      success: true,
      imageId,
      templateId,
    });

  } catch (error) {
    console.error('Error uploading image:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to upload image',
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};
