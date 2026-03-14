import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

interface GalleryImage {
  id: number;
  name: string;
  image: string;
  sequence: number;
}

interface TemplateImagesResponse {
  mainImage: string | null;
  galleryImages: GalleryImage[];
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<TemplateImagesResponse | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { user } = req.session;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const templateIdRaw = req.query.templateId;
    const templateId = Array.isArray(templateIdRaw)
      ? parseInt(templateIdRaw[0])
      : parseInt(templateIdRaw as string);

    if (isNaN(templateId)) {
      return res.status(400).json({ error: 'templateId query parameter is required' });
    }

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

    const mainImage = templates.length > 0 && templates[0].image_1920
      ? templates[0].image_1920 as string
      : null;

    const gallery = await odooClient.searchRead<{
      id: number;
      name: string;
      image_1920: string | false;
      sequence: number;
    }>(
      user.uid,
      user.password,
      'product.image',
      [['product_tmpl_id', '=', templateId]],
      ['id', 'name', 'image_1920', 'sequence'],
      undefined,
      undefined,
      'sequence asc, id asc'
    );

    const galleryImages: GalleryImage[] = gallery
      .filter((img) => img.image_1920)
      .map((img) => ({
        id: img.id,
        name: img.name || '',
        image: img.image_1920 as string,
        sequence: img.sequence || 0,
      }));

    return res.status(200).json({ mainImage, galleryImages });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching template images:', error);
    return res.status(500).json({ error: message });
  }
}

export default withAuth(handler);

export const config = {
  api: {
    responseLimit: '50mb',
  },
};
