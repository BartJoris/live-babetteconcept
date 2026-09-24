import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';
import type { SeoAltTextUpdate } from '../../../lib/seo/types';

const MAX_UPDATES = 100;
const MAX_ALT_LENGTH = 512;

type UpdateResult = {
  imageId: number;
  success: boolean;
  error?: string;
};

function parseUpdates(body: unknown): SeoAltTextUpdate[] | string {
  if (typeof body !== 'object' || body === null) {
    return 'Body must be a JSON object';
  }
  const updates = (body as { updates?: unknown }).updates;
  if (!Array.isArray(updates) || updates.length === 0) {
    return 'updates must be a non-empty array';
  }
  if (updates.length > MAX_UPDATES) {
    return `updates may contain at most ${MAX_UPDATES} items`;
  }

  const parsed: SeoAltTextUpdate[] = [];
  for (const item of updates) {
    if (typeof item !== 'object' || item === null) {
      return 'Each update must be an object with imageId and altText';
    }
    const imageId = (item as { imageId?: unknown }).imageId;
    const altText = (item as { altText?: unknown }).altText;
    if (typeof imageId !== 'number' || !Number.isInteger(imageId) || imageId <= 0) {
      return 'Each update needs a positive integer imageId';
    }
    if (typeof altText !== 'string') {
      return 'Each update needs a string altText';
    }
    const trimmed = altText.trim();
    if (!trimmed) {
      return 'altText mag niet leeg zijn';
    }
    if (trimmed.length > MAX_ALT_LENGTH) {
      return `altText mag maximaal ${MAX_ALT_LENGTH} tekens zijn`;
    }
    parsed.push({ imageId, altText: trimmed });
  }
  return parsed;
}

function groupIdsByAltText(updates: SeoAltTextUpdate[]): Map<string, number[]> {
  const grouped = new Map<string, number[]>();
  for (const update of updates) {
    const ids = grouped.get(update.altText) ?? [];
    ids.push(update.imageId);
    grouped.set(update.altText, ids);
  }
  return grouped;
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<{ success: boolean; updatedCount: number; results: UpdateResult[] } | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { user } = req.session;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const parsed = parseUpdates(req.body);
    if (typeof parsed === 'string') {
      return res.status(400).json({ error: parsed });
    }

    const results: UpdateResult[] = [];
    const grouped = groupIdsByAltText(parsed);

    for (const [name, ids] of grouped) {
      try {
        await odooClient.write(user.uid, user.password, 'product.image', ids, { name });
        ids.forEach((imageId) => results.push({ imageId, success: true }));
      } catch {
        for (const imageId of ids) {
          try {
            await odooClient.write(user.uid, user.password, 'product.image', [imageId], { name });
            results.push({ imageId, success: true });
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            results.push({ imageId, success: false, error: message });
          }
        }
      }
    }

    const updatedCount = results.filter((r) => r.success).length;
    return res.status(200).json({
      success: updatedCount === parsed.length,
      updatedCount,
      results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error updating SEO alt text:', error);
    return res.status(500).json({ error: message });
  }
}

export default withAuth(handler);

export const maxDuration = 60;
