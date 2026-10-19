/**
 * ISBN helpers for cover lookup (ISBN-13 ↔ ISBN-10).
 */

export function normalizeIsbn(raw: string): string | null {
  const digits = raw.replace(/[^0-9Xx]/g, '').toUpperCase();
  if (/^\d{13}$/.test(digits)) return digits;
  if (/^\d{9}[\dX]$/.test(digits)) return digits;
  return null;
}

/** Convert ISBN-13 (978…) to ISBN-10. Returns null for 979… or invalid. */
export function isbn13To10(isbn13: string): string | null {
  const n = normalizeIsbn(isbn13);
  if (!n || n.length !== 13 || !n.startsWith('978')) return null;
  const core = n.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += (10 - i) * parseInt(core[i], 10);
  }
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? 'X' : String(check));
}

export function isLikelyIsbn(raw: string): boolean {
  const n = normalizeIsbn(raw);
  return Boolean(n && (n.length === 13 || n.length === 10));
}
