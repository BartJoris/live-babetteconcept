import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

interface SetMainImageRequest {
  templateId: number;
  imageId: number;
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<{ success: boolean } | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { user } = req.session;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { templateId, imageId }: SetMainImageRequest = req.body;

    if (!templateId || !imageId) {
      return res.status(400).json({ error: 'templateId and imageId are required' });
    }

    // Read the gallery image
    const galleryImages = await odooClient.read<{
      id: number;
      image_1920: string | false;
      name: string;
    }>(
      user.uid,
      user.password,
      'product.image',
      [imageId],
      ['id', 'image_1920', 'name']
    );

    if (galleryImages.length === 0 || !galleryImages[0].image_1920) {
      return res.status(404).json({ error: 'Gallery image not found' });
    }

    const newMainImageData = galleryImages[0].image_1920 as string;

    // Read current main image
    const templates = await odooClient.read<{
      id: number;
      image_1920: string | false;
    }>(
      user.uid,
      user.password,
      'product.template',
      [templateId],
      ['id', 'image_1920']
    );

    const oldMainImageData = templates.length > 0 && templates[0].image_1920
      ? templates[0].image_1920 as string
      : null;

    // Set the gallery image as the new main image
    await odooClient.write(
      user.uid,
      user.password,
      'product.template',
      [templateId],
      { image_1920: newMainImageData }
    );

    // Move old main image to gallery if it existed
    if (oldMainImageData) {
      await odooClient.create(
        user.uid,
        user.password,
        'product.image',
        {
          name: 'Vorige hoofdafbeelding',
          product_tmpl_id: templateId,
          image_1920: oldMainImageData,
          sequence: 99,
        }
      );
    }

    // Delete the old gallery image record
    await odooClient.unlink(
      user.uid,
      user.password,
      'product.image',
      [imageId]
    );

    return res.status(200).json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error setting main image:', error);
    return res.status(500).json({ error: message });
  }
}

export default withAuth(handler);
