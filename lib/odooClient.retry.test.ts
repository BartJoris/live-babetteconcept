import { describe, expect, it } from 'vitest';
import { isRetryableHttpStatus, rpcRetryDelayMs } from '@/lib/odooClient';

describe('isRetryableHttpStatus', () => {
  it('retries rate limits and gateway errors', () => {
    expect(isRetryableHttpStatus(429)).toBe(true);
    expect(isRetryableHttpStatus(502)).toBe(true);
    expect(isRetryableHttpStatus(503)).toBe(true);
    expect(isRetryableHttpStatus(504)).toBe(true);
  });

  it('does not retry client/auth errors', () => {
    expect(isRetryableHttpStatus(400)).toBe(false);
    expect(isRetryableHttpStatus(401)).toBe(false);
    expect(isRetryableHttpStatus(404)).toBe(false);
    expect(isRetryableHttpStatus(200)).toBe(false);
  });
});

describe('rpcRetryDelayMs', () => {
  it('grows exponentially from the base', () => {
    expect(rpcRetryDelayMs(0, 500)).toBeGreaterThanOrEqual(500);
    expect(rpcRetryDelayMs(0, 500)).toBeLessThan(650);
    expect(rpcRetryDelayMs(1, 500)).toBeGreaterThanOrEqual(1000);
    expect(rpcRetryDelayMs(2, 500)).toBeGreaterThanOrEqual(2000);
  });

  it('caps at 8s before jitter', () => {
    expect(rpcRetryDelayMs(10, 500)).toBeLessThan(8200);
  });
});
