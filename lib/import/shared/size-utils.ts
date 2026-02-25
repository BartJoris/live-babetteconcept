/**
 * Size conversion and attribute detection utilities.
 * Centralizes all size-related logic previously duplicated across 23+ parsers.
 */

export type SizeAttribute = "MAAT Baby's" | 'MAAT Kinderen' | 'MAAT Tieners' | 'MAAT Volwassenen';

const EU_SIZE_TO_AGE: Record<number, string> = {
  50: '0 maand', 56: '1 maand', 62: '3 maand', 68: '6 maand',
  74: '9 maand', 80: '12 maand', 86: '18 maand',
  92: '2 jaar', 98: '3 jaar', 104: '4 jaar', 110: '5 jaar',
  116: '6 jaar', 122: '7 jaar', 128: '8 jaar', 134: '9 jaar',
  140: '10 jaar', 146: '11 jaar', 152: '12 jaar', 158: '13 jaar', 164: '14 jaar',
};

const ADULT_SIZE_MAPPING: Record<string, string> = {
  'XXS': 'XXS - 32',
  'XS': 'XS - 34',
  'S': 'S - 36',
  'M': 'M - 38',
  'L': 'L - 40',
  'XL': 'XL - 42',
  'XXL': 'XXL - 44',
};

/**
 * Convert raw size strings to Odoo-compatible Dutch age format.
 * Handles: EU sizes (92, 104), dual EU sizes (92/98, 110/116),
 * Floss dual format (56/1M, 92/2Y), Y/M suffixes (3Y, 6M),
 * ranges (3-5Y, 9-24M, 18M-2Y), and one-size (ONE SIZE, OS, TU).
 */
export function convertSize(sizeStr: string): string {
  if (!sizeStr) return sizeStr;
  const s = sizeStr.trim();

  // EU/age dual format: "56/1M" -> "1 maand", "92/2Y" -> "2 jaar"
  const dualMatch = s.match(/^\d+\/(\d+)(M|Y)$/i);
  if (dualMatch) {
    const num = dualMatch[1];
    const unit = dualMatch[2].toUpperCase();
    return unit === 'M' ? `${num} maand` : `${num} jaar`;
  }

  // Dual EU size: "110/116" -> use larger -> "6 jaar"
  const dualEuMatch = s.match(/^(\d{2,3})\/(\d{2,3})$/);
  if (dualEuMatch) {
    const upperSize = parseInt(dualEuMatch[2]);
    if (EU_SIZE_TO_AGE[upperSize]) return EU_SIZE_TO_AGE[upperSize];
  }

  // Single EU size: "98" -> "3 jaar"
  const singleEuMatch = s.match(/^(\d{2,3})$/);
  if (singleEuMatch) {
    const euSize = parseInt(singleEuMatch[1]);
    if (EU_SIZE_TO_AGE[euSize]) return EU_SIZE_TO_AGE[euSize];
  }

  // Mixed range: "18M-2Y" -> "2 jaar"
  const mixedMatch = s.match(/^\d+M-(\d+)Y$/i);
  if (mixedMatch) {
    return `${mixedMatch[1]} jaar`;
  }

  // Year range: "3-5Y" -> "5 jaar"
  const yearRangeMatch = s.match(/^(\d+)-(\d+)Y$/i);
  if (yearRangeMatch) {
    return `${yearRangeMatch[2]} jaar`;
  }

  // Single year: "2Y" -> "2 jaar"
  if (/^\d+Y$/i.test(s)) {
    const yMatch = s.match(/^(\d+)Y$/i);
    return yMatch ? `${yMatch[1]} jaar` : s;
  }

  // Month range: "3-9M" -> "9 maand"
  const monthRangeMatch = s.match(/^\d+-(\d+)M$/i);
  if (monthRangeMatch) {
    return `${monthRangeMatch[1]} maand`;
  }

  // Single month: "3M" -> "3 maand"
  if (/^\d+M$/i.test(s)) {
    return s.replace(/M$/i, ' maand');
  }

  // One size variants
  if (s.toUpperCase() === 'ONE SIZE' || s.toUpperCase() === 'OS') return 'U';
  if (s.toUpperCase() === 'TU') return 'U';

  // Sock/shoe sizes or already-converted: return as-is
  return s;
}

/**
 * Map adult size codes to Odoo format with EU number suffix.
 * "XS" -> "XS - 34", "M" -> "M - 38"
 */
export function mapSizeToOdooFormat(size: string): string {
  if (!size) return size;
  if (size.includes(' - ')) return size;
  const normalized = size.trim().toUpperCase();
  return ADULT_SIZE_MAPPING[normalized] || size;
}

/**
 * Determine the Odoo size attribute based on a size string.
 * Returns "MAAT Baby's", "MAAT Kinderen", "MAAT Tieners", or "MAAT Volwassenen".
 */
export function determineSizeAttribute(sizeOrVariants: string | Array<{ size: string }>): SizeAttribute {
  const size = typeof sizeOrVariants === 'string'
    ? sizeOrVariants
    : sizeOrVariants[0]?.size || '';

  if (!size) return 'MAAT Kinderen';

  // Baby sizes
  if (size.includes('maand') || /^\d+\s*M$/i.test(size) || /\d+\/\d+\s*m$/i.test(size)) {
    return "MAAT Baby's";
  }

  // Teen sizes: "jaar" with number >= 10, or Y sizes >= 10
  if (size.includes('jaar')) {
    const match = size.match(/^(\d+)\s*jaar/i);
    if (match && parseInt(match[1]) >= 10) {
      return 'MAAT Tieners';
    }
  }
  if (/^(\d+)\s*Y$/i.test(size)) {
    const match = size.match(/^(\d+)\s*Y$/i);
    if (match && parseInt(match[1]) >= 10) {
      return 'MAAT Tieners';
    }
  }
  // Weekend House Kids teen sizes
  if (/^(11\/12|13\/14)$/i.test(size)) {
    return 'MAAT Tieners';
  }

  // Kids sizes
  if (size.includes('jaar') || /^\d+\s*Y$/i.test(size)) {
    return 'MAAT Kinderen';
  }
  if (/^(2|3\/4|5\/6|7\/8|9\/10)$/i.test(size)) {
    return 'MAAT Kinderen';
  }

  // Adult sizes
  if (/^(XXS|XS|S|M|L|XL|XXL)$/i.test(size)) {
    return 'MAAT Volwassenen';
  }

  return 'MAAT Kinderen';
}

/**
 * Check if a size represents a universal/unit size (no size variants needed).
 */
export function isUnitSize(size: string): boolean {
  const normalized = size?.trim().toUpperCase();
  return normalized === 'UNIT' || normalized === 'U' || normalized === 'TU';
}
