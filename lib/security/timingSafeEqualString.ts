import { timingSafeEqual } from 'crypto';

/** Timing-safe equality for secrets (API keys, etc.). */
export function timingSafeEqualString(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
