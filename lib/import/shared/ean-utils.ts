/**
 * EAN-13 barcode generation utilities.
 * Generates valid EAN-13 codes with correct check digits.
 * Uses prefix 200–299 (reserved for internal/in-store use).
 */

function calculateEAN13CheckDigit(digits12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(digits12[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function generateEAN13(): string {
  const prefix = '2' + String(Math.floor(Math.random() * 10));
  let body = '';
  for (let i = 0; i < 10; i++) {
    body += Math.floor(Math.random() * 10);
  }
  const digits12 = prefix + body;
  const check = calculateEAN13CheckDigit(digits12);
  return digits12 + check;
}

/**
 * Generate `count` unique EAN-13 codes, excluding any in `existingSet`.
 * Retries on collision (extremely unlikely with 10^10 possible codes).
 */
export function generateUniqueEAN13Batch(count: number, existingSet: Set<string>): string[] {
  const result: string[] = [];
  const localSet = new Set(existingSet);
  let attempts = 0;
  const maxAttempts = count * 10;

  while (result.length < count && attempts < maxAttempts) {
    const code = generateEAN13();
    if (!localSet.has(code)) {
      localSet.add(code);
      result.push(code);
    }
    attempts++;
  }

  return result;
}

export function isValidEAN13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const check = calculateEAN13CheckDigit(code.slice(0, 12));
  return check === parseInt(code[12], 10);
}
