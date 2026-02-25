/**
 * Price parsing utilities for European/international price formats.
 */

/**
 * Parse a European-format price string (comma as decimal separator).
 * Handles: "22,00", "1.234,56", "12,39 €", "€ 155.00", "12.39"
 */
export function parseEuroPrice(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace(/[€\s\t]/g, '');

  // If it has both . and , -> determine which is decimal
  if (cleaned.includes('.') && cleaned.includes(',')) {
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    if (lastComma > lastDot) {
      // 1.234,56 -> comma is decimal
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
    }
    // 1,234.56 -> dot is decimal
    return parseFloat(cleaned.replace(/,/g, '')) || 0;
  }

  // Only comma -> treat as decimal separator
  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(',', '.')) || 0;
  }

  return parseFloat(cleaned) || 0;
}
