import { describe, expect, it } from 'vitest';
import { assertSafeFetchUrl, SafeFetchUrlError } from './assertSafeFetchUrl';

describe('assertSafeFetchUrl', () => {
  it('rejects non-http(s) schemes', async () => {
    await expect(assertSafeFetchUrl('file:///etc/passwd')).rejects.toBeInstanceOf(
      SafeFetchUrlError,
    );
    await expect(assertSafeFetchUrl('ftp://example.com/a')).rejects.toBeInstanceOf(
      SafeFetchUrlError,
    );
  });

  it('rejects http by default (https only)', async () => {
    await expect(assertSafeFetchUrl('http://example.com/img.jpg')).rejects.toMatchObject({
      code: 'INSECURE_SCHEME',
    });
  });

  it('rejects obvious private / metadata hostnames without DNS', async () => {
    await expect(assertSafeFetchUrl('https://localhost/x')).rejects.toMatchObject({
      code: 'BLOCKED_HOST',
    });
    await expect(assertSafeFetchUrl('https://127.0.0.1/x')).rejects.toMatchObject({
      code: 'BLOCKED_HOST',
    });
    await expect(assertSafeFetchUrl('https://169.254.169.254/latest')).rejects.toMatchObject({
      code: 'BLOCKED_HOST',
    });
    await expect(assertSafeFetchUrl('https://metadata.google.internal/')).rejects.toMatchObject({
      code: 'BLOCKED_HOST',
    });
  });

  it('rejects hosts outside an explicit allowlist', async () => {
    await expect(
      assertSafeFetchUrl('https://evil.example/a.png', {
        allowedHosts: ['cdn.shopify.com'],
      }),
    ).rejects.toMatchObject({ code: 'HOST_NOT_ALLOWED' });
  });

  it('accepts an allowlisted public https host', async () => {
    const url = await assertSafeFetchUrl('https://cdn.shopify.com/s/files/1/x.jpg', {
      allowedHosts: ['cdn.shopify.com'],
      // Skip DNS in unit test — host is allowlisted and not a blocked literal.
      skipDnsLookup: true,
    });
    expect(url.hostname).toBe('cdn.shopify.com');
  });

  it('accepts public https when no allowlist is set (DNS skipped)', async () => {
    const url = await assertSafeFetchUrl('https://images.example.com/a.jpg', {
      skipDnsLookup: true,
    });
    expect(url.href).toBe('https://images.example.com/a.jpg');
  });
});
