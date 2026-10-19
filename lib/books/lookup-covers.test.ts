import { describe, expect, it, vi } from 'vitest';
import { lookupCoverForIsbn, lookupBookCovers } from './lookup-covers';

function jpegResponse(bytes = 2000): Response {
  const buf = Buffer.alloc(bytes, 0xff);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  return new Response(buf, {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  });
}

function gifPlaceholder(): Response {
  return new Response(Buffer.alloc(43, 0), {
    status: 200,
    headers: { 'content-type': 'image/gif' },
  });
}

describe('lookupCoverForIsbn', () => {
  it('returns Amazon cover when EasyCB and Open Library miss', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('easycbapi.nl/isbn/')) {
        return new Response('isbn:9789002286957\nmutationlog:\n', { status: 200 });
      }
      if (url.includes('covers.openlibrary.org')) {
        return new Response(null, { status: 404 });
      }
      if (url.includes('images-na.ssl-images-amazon.com')) {
        return jpegResponse(20_000);
      }
      return new Response('nope', { status: 404 });
    }) as unknown as typeof fetch;

    const hit = await lookupCoverForIsbn('9789002286957', { fetchImpl, timeoutMs: 2000 });
    expect(hit?.source).toBe('amazon');
    expect(hit?.buffer.length).toBeGreaterThan(1000);
  });

  it('skips Amazon GIF placeholders', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('easycbapi.nl/isbn/')) {
        return new Response('isbn:x\n', { status: 200 });
      }
      if (url.includes('covers.openlibrary.org')) {
        return new Response(null, { status: 404 });
      }
      if (url.includes('images-na.ssl-images-amazon.com')) {
        return gifPlaceholder();
      }
      if (url.includes('syndetics.com')) {
        return jpegResponse(8_000);
      }
      return new Response('nope', { status: 404 });
    }) as unknown as typeof fetch;

    const hit = await lookupCoverForIsbn('9789002287374', { fetchImpl, timeoutMs: 2000 });
    expect(hit?.source).toBe('syndetics');
  });
});

describe('lookupBookCovers', () => {
  it('assigns covers per reference', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('easycbapi.nl/isbn/')) {
        return new Response('isbn:x\n', { status: 200 });
      }
      if (url.includes('covers.openlibrary.org')) {
        return new Response(null, { status: 404 });
      }
      if (url.includes('images-na.ssl-images-amazon.com')) {
        return jpegResponse(12_000);
      }
      return new Response('nope', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await lookupBookCovers(
      [
        { reference: '9789002286957', isbn: '9789002286957' },
        { reference: 'bad', isbn: 'nope' },
      ],
      { fetchImpl, concurrency: 2, timeoutMs: 2000 },
    );

    expect(result.found).toHaveLength(1);
    expect(result.found[0].reference).toBe('9789002286957');
    expect(result.found[0].base64.length).toBeGreaterThan(10);
    expect(result.missing).toHaveLength(1);
  });
});
