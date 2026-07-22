import type { NextApiRequest, NextApiResponse } from 'next';
import { odooClient } from '@/lib/odooClient';
import { OdooImageService } from '@/lib/import/services';

interface UploadRequest {
  templateId: number;
  base64Image: string;
  imageName: string;
  sequence: number;
  isMainImage: boolean;
  odooUid: string;
  odooPassword: string;
  /** Optional: when provided, force this publish state after image write. */
  isPublished?: boolean;
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
      odooPassword,
      isPublished,
    } = req.body as UploadRequest;

    if (!templateId || !base64Image || !odooUid || !odooPassword) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const uid = parseInt(odooUid);
    const imageService = new OdooImageService(uid, odooPassword);

    let imageId: number | null = null;

    if (isMainImage) {
      console.log(`🖼️ Setting main image for template ${templateId}...`);
      // Preserve publish flag: Odoo can reset website_published on template image write.
      let preservePublished = isPublished;
      if (preservePublished === undefined) {
        const current = await odooClient.read<{ website_published: boolean }>(
          uid,
          odooPassword,
          'product.template',
          [templateId],
          ['website_published'],
        );
        preservePublished = Boolean(current?.[0]?.website_published);
      }
      await imageService.setMainImage(templateId, base64Image, preservePublished);
      console.log(`✅ Main image set (publish preserved=${preservePublished})`);
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
