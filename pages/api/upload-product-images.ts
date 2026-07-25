import type { NextApiResponse } from 'next';
import { odooClient } from '@/lib/odooClient';
import { OdooImageService } from '@/lib/import/services';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';

type ImageItem = {
  base64: string;
  imageName: string;
  sequence: number;
  isMainImage?: boolean;
};

type UploadRequest = {
  templateId: number;
  images: ImageItem[];
  isPublished?: boolean;
};

/**
 * Upload multiple images for one product template in a single request.
 * Images are written sequentially to Odoo to avoid rate limits.
 */
async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { uid, password } = req.session.user!;
    const { templateId, images, isPublished } = req.body as UploadRequest;

    if (!templateId || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        error: 'templateId and non-empty images[] required',
      });
    }

    if (images.length > 30) {
      return res.status(400).json({
        error: 'Max 30 images per request',
      });
    }

    const imageService = new OdooImageService(uid, password);
    let preservePublished = isPublished;
    if (preservePublished === undefined) {
      const current = await odooClient.read<{ website_published: boolean }>(
        uid,
        password,
        'product.template',
        [templateId],
        ['website_published'],
      );
      preservePublished = Boolean(current?.[0]?.website_published);
    }

    const sorted = [...images].sort((a, b) => a.sequence - b.sequence);
    let uploaded = 0;
    const errors: string[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const img = sorted[i];
      if (!img.base64?.trim()) {
        errors.push(`${img.imageName || `image ${i + 1}`}: empty base64`);
        continue;
      }
      try {
        const isMain = img.isMainImage === true || i === 0;
        await imageService.addGalleryImage(
          templateId,
          img.imageName || `Image ${img.sequence || i + 1}`,
          img.base64,
          img.sequence || i + 1,
        );
        if (isMain) {
          await imageService.setMainImage(
            templateId,
            img.base64,
            preservePublished,
          );
        }
        uploaded += 1;
      } catch (err) {
        errors.push(
          `${img.imageName || `image ${i + 1}`}: ${(err as Error).message}`,
        );
      }
    }

    return res.status(200).json({
      success: uploaded > 0 && errors.length === 0,
      templateId,
      uploaded,
      failed: sorted.length - uploaded,
      errors,
    });
  } catch (error) {
    console.error('upload-product-images error:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to upload images',
    });
  }
}

export default withAuth(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
  },
};
