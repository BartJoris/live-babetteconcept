/**
 * Product name formatting utilities.
 */

/**
 * Title Case: capitalize first letter of each word.
 * "bear fleece jacket" -> "Bear Fleece Jacket"
 */
export function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Sentence case: capitalize only the first letter.
 * "BEAR FLEECE JACKET" -> "Bear fleece jacket"
 */
export function toSentenceCase(str: string): string {
  if (!str) return str;
  const lower = str.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Format a product name using a template with placeholders.
 * Template: "{brand} - {name} - {color}"
 * Data: { brand: "Flöss", name: "Fresa Onesie", color: "Blue Violet" }
 * Result: "Flöss - Fresa Onesie - Blue Violet"
 *
 * Trailing separators from empty values are cleaned up.
 */
export function formatProductName(
  template: string,
  data: Record<string, string>,
  casing?: { brand?: 'title' | 'sentence' | 'none'; name?: 'title' | 'sentence' | 'none'; color?: 'title' | 'sentence' | 'none' }
): string {
  const applyCase = (value: string, mode?: 'title' | 'sentence' | 'none'): string => {
    if (!mode || mode === 'none') return value;
    return mode === 'title' ? toTitleCase(value) : toSentenceCase(value);
  };

  let result = template;
  for (const [key, value] of Object.entries(data)) {
    const caseMode = casing?.[key as keyof typeof casing];
    result = result.replace(`{${key}}`, applyCase(value || '', caseMode));
  }

  // Clean up trailing separators from empty values
  result = result.replace(/\s*-\s*$/g, '').replace(/\s+-\s+-/g, ' -').trim();

  return result;
}

/**
 * Strip a leading "Brand - " prefix and trailing color (" - Color" or " (Color)").
 */
export function extractProductBaseName(name: string): string {
  if (!name) return '';
  let base = name.trim();
  // Remove first "Brand - " segment when present
  if (base.includes(' - ')) {
    base = base.replace(/^.*?\s+-\s+/, '');
  }
  base = base.replace(/\s*\([^)]*\)\s*$/, '').trim();
  // If still "Name - Color", drop trailing color segment
  if (base.includes(' - ')) {
    base = base.replace(/\s+-\s+[^-]+$/, '').trim();
  }
  return base;
}

/**
 * Rebuild product display name when the brand changes.
 * Preserves parentheses color style when the current name uses it.
 */
export function rebuildNameWithBrand(
  currentName: string,
  originalName: string | undefined,
  color: string | undefined,
  brandName: string,
): string {
  const base = toSentenceCase(
    (originalName || extractProductBaseName(currentName) || currentName).trim(),
  );
  const colorPart = color?.trim() ? toSentenceCase(color.trim()) : '';

  if (colorPart && /\([^)]+\)\s*$/.test(currentName)) {
    return `${brandName} - ${base} (${colorPart})`;
  }
  if (colorPart) {
    return `${brandName} - ${base} - ${colorPart}`;
  }
  return `${brandName} - ${base}`;
}
