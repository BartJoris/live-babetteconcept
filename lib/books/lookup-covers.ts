/**
 * Resolve book cover image URLs by ISBN.
 *
 * Cascade (first hit wins):
 *  1. EasyCB / Titelbank (NL/BE publisher assets)
 *  2. Open Library
 *  3. Amazon product-image CDN (ISBN-10)
 *  4. Syndetics
 *  5. Google Books (optional API key)
 */

import { isbn13To10, normalizeIsbn } from './isbn';

export type CoverSource = 'easycb' | 'openlibrary' | 'amazon' | 'syndetics' | 'google';

export interface CoverLookupItem {
  /** Product reference / key to assign the image to */
  reference: string;
  /** ISBN-13 (or ISBN-10); usually the barcode */
  isbn: string;
  title?: string;
}

export interface CoverLookupHit {
  reference: string;
  isbn: string;
  url: string;
  source: CoverSource;
  mimeType: string;
  base64: string;
}

export interface CoverLookupMiss {
  reference: string;
  isbn: string;
  error: string;
}

export interface CoverLookupResult {
  found: CoverLookupHit[];
  missing: CoverLookupMiss[];
}

export interface LookupCoversOptions {
  /** EasyCB contact header (required for automated use) */
  easycbContact?: string;
  /** Optional Google Books API key */
  googleBooksApiKey?: string;
  /** Abort after this many ms per ISBN (default 12s) */
  timeoutMs?: number;
  /** Max concurrent ISBN lookups (default 4) */
  concurrency?: number;
  fetchImpl?: typeof fetch;
}

const MIN_IMAGE_BYTES = 1500;

function isUsefulImage(buffer: Buffer, contentType: string): boolean {
  if (buffer.length < MIN_IMAGE_BYTES) return false;
  const type = contentType.toLowerCase();
  if (!type.startsWith('image/')) return false;
  // Amazon returns a tiny 1×1 GIF placeholder when no cover exists
  if (type.includes('gif') && buffer.length < 5000) return false;
  return true;
}

async function fetchImage(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  headers?: Record<string, string>,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: {
        Accept: 'image/*,*/*',
        'User-Agent': 'BabetteConcept/1.0 (book-cover-lookup)',
        ...headers,
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const mimeType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!isUsefulImage(buffer, mimeType)) return null;
    return { buffer, mimeType: mimeType.split(';')[0].trim() || 'image/jpeg' };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function tryEasyCb(
  isbn: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  contact: string,
): Promise<{ url: string; buffer: Buffer; mimeType: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let metaText = '';
  try {
    const metaRes = await fetchImpl(`https://easycbapi.nl/isbn/${isbn}`, {
      headers: {
        contact,
        Accept: 'text/plain,*/*',
        'User-Agent': 'BabetteConcept/1.0 (book-cover-lookup)',
      },
      signal: controller.signal,
    });
    if (!metaRes.ok) return null;
    metaText = await metaRes.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  const links = [...metaText.matchAll(/ResourceLink:(\S+\.jpe?g)/gi)].map((m) => m[1]);
  const ordered = [
    ...links.filter((l) => /_VRK\.jpe?g$/i.test(l)),
    ...links.filter((l) => /_ATK\.jpe?g$/i.test(l)),
    ...links,
  ];
  const unique = [...new Set(ordered)];

  for (const link of unique) {
    const url = `https://easycbapi.nl/resources/jpg/${link}`;
    const img = await fetchImage(url, fetchImpl, timeoutMs, {
      contact,
      Referer: 'https://easycbapi.nl/',
    });
    if (img) return { url, ...img };
  }
  return null;
}

async function tryOpenLibrary(
  isbn: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ url: string; buffer: Buffer; mimeType: string } | null> {
  const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
  const img = await fetchImage(url, fetchImpl, timeoutMs);
  return img ? { url, ...img } : null;
}

async function tryAmazon(
  isbn: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ url: string; buffer: Buffer; mimeType: string } | null> {
  const isbn10 = isbn.length === 10 ? isbn : isbn13To10(isbn);
  if (!isbn10) return null;
  const url = `https://images-na.ssl-images-amazon.com/images/P/${isbn10}.01.LZZZZZZZ.jpg`;
  const img = await fetchImage(url, fetchImpl, timeoutMs);
  return img ? { url, ...img } : null;
}

async function trySyndetics(
  isbn: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ url: string; buffer: Buffer; mimeType: string } | null> {
  const url = `https://syndetics.com/index.aspx?isbn=${isbn}/lc.jpg`;
  const img = await fetchImage(url, fetchImpl, timeoutMs);
  return img ? { url, ...img } : null;
}

async function tryGoogleBooks(
  isbn: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  apiKey?: string,
): Promise<{ url: string; buffer: Buffer; mimeType: string } | null> {
  const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const metaRes = await fetchImpl(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}${keyParam}`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      },
    );
    if (!metaRes.ok) return null;
    const data = (await metaRes.json()) as {
      items?: Array<{
        volumeInfo?: {
          imageLinks?: { thumbnail?: string; smallThumbnail?: string };
        };
      }>;
    };
    const links = data.items?.[0]?.volumeInfo?.imageLinks;
    const raw = links?.thumbnail || links?.smallThumbnail;
    if (!raw) return null;
    // Prefer https + higher zoom when possible
    const url = raw.replace(/^http:/, 'https:').replace('zoom=1', 'zoom=2');
    const img = await fetchImage(url, fetchImpl, timeoutMs);
    return img ? { url, ...img } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupCoverForIsbn(
  isbnRaw: string,
  options: LookupCoversOptions = {},
): Promise<{ url: string; source: CoverSource; buffer: Buffer; mimeType: string } | null> {
  const isbn = normalizeIsbn(isbnRaw);
  if (!isbn) return null;

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const contact = options.easycbContact ?? 'import@babetteconcept.be';

  const easycb = await tryEasyCb(isbn, fetchImpl, timeoutMs, contact);
  if (easycb) return { ...easycb, source: 'easycb' };

  const ol = await tryOpenLibrary(isbn, fetchImpl, timeoutMs);
  if (ol) return { ...ol, source: 'openlibrary' };

  const amazon = await tryAmazon(isbn, fetchImpl, timeoutMs);
  if (amazon) return { ...amazon, source: 'amazon' };

  const syndetics = await trySyndetics(isbn, fetchImpl, timeoutMs);
  if (syndetics) return { ...syndetics, source: 'syndetics' };

  const google = await tryGoogleBooks(isbn, fetchImpl, timeoutMs, options.googleBooksApiKey);
  if (google) return { ...google, source: 'google' };

  return null;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  }
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}

export async function lookupBookCovers(
  items: CoverLookupItem[],
  options: LookupCoversOptions = {},
): Promise<CoverLookupResult> {
  const concurrency = options.concurrency ?? 4;
  const found: CoverLookupHit[] = [];
  const missing: CoverLookupMiss[] = [];

  const outcomes = await mapPool(items, concurrency, async (item) => {
    const isbn = normalizeIsbn(item.isbn) || normalizeIsbn(item.reference);
    if (!isbn) {
      return {
        kind: 'miss' as const,
        miss: {
          reference: item.reference,
          isbn: item.isbn,
          error: 'Ongeldige ISBN/barcode',
        },
      };
    }
    const hit = await lookupCoverForIsbn(isbn, options);
    if (!hit) {
      return {
        kind: 'miss' as const,
        miss: {
          reference: item.reference,
          isbn,
          error: 'Geen cover gevonden',
        },
      };
    }
    return {
      kind: 'hit' as const,
      hit: {
        reference: item.reference,
        isbn,
        url: hit.url,
        source: hit.source,
        mimeType: hit.mimeType,
        base64: hit.buffer.toString('base64'),
      },
    };
  });

  for (const outcome of outcomes) {
    if (outcome.kind === 'hit') found.push(outcome.hit);
    else missing.push(outcome.miss);
  }

  return { found, missing };
}
