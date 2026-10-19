import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import {
  lookupBookCovers,
  type CoverLookupItem,
  type CoverLookupResult,
} from '@/lib/books/lookup-covers';

type RequestBody = {
  items?: CoverLookupItem[];
};

async function handler(req: NextApiRequestWithSession, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { items } = (req.body || {}) as RequestBody;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items[] met isbn/reference is verplicht' });
  }

  if (items.length > 100) {
    return res.status(400).json({ error: 'Maximaal 100 ISBNs per verzoek' });
  }

  const cleaned: CoverLookupItem[] = items
    .map((item) => ({
      reference: String(item?.reference || '').trim(),
      isbn: String(item?.isbn || item?.reference || '').trim(),
      title: item?.title ? String(item.title) : undefined,
    }))
    .filter((item) => item.reference && item.isbn);

  if (cleaned.length === 0) {
    return res.status(400).json({ error: 'Geen geldige items' });
  }

  try {
    const result: CoverLookupResult = await lookupBookCovers(cleaned, {
      easycbContact: process.env.EASYCB_CONTACT || 'import@babetteconcept.be',
      googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY,
      concurrency: 4,
      timeoutMs: 12_000,
    });

    return res.status(200).json({
      found: result.found,
      missing: result.missing,
      summary: {
        requested: cleaned.length,
        found: result.found.length,
        missing: result.missing.length,
      },
    });
  } catch (error) {
    console.error('lookup-book-covers failed:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Cover lookup mislukt',
    });
  }
}

export default withAuth(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
    responseLimit: '32mb',
  },
};
