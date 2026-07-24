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

export type NameCasingMode = 'title' | 'sentence' | 'none';

export type NameTemplateCasing = {
  brand?: NameCasingMode;
  name?: NameCasingMode;
  color?: NameCasingMode;
  reference?: NameCasingMode;
};

/** Default Emile & Ida / kids fashion style: Brand - Name - Color (ref) */
export const DEFAULT_PRODUCT_NAME_TEMPLATE =
  '{brand} - {name} - {color} ({reference})';

/**
 * Format a product name using a template with placeholders.
 * Template: "{brand} - {name} - {color} ({reference})"
 * Data: { brand: "Emile & Ida", name: "Bonnet", color: "Chataigne", reference: "ida-eveland" }
 * Result: "Emile & Ida - Bonnet - Chataigne (ida-eveland)"
 *
 * Empty placeholders and leftover separators / parentheses are cleaned up.
 */
export function formatProductName(
  template: string,
  data: Record<string, string>,
  casing?: NameTemplateCasing,
): string {
  const applyCase = (
    value: string,
    mode?: NameCasingMode,
  ): string => {
    if (!mode || mode === 'none') return value;
    return mode === 'title' ? toTitleCase(value) : toSentenceCase(value);
  };

  let result = template;
  for (const [key, value] of Object.entries(data)) {
    const caseMode = casing?.[key as keyof NameTemplateCasing];
    result = result.replaceAll(`{${key}}`, applyCase(value || '', caseMode));
  }

  // Drop unresolved placeholders
  result = result.replace(/\{[a-zA-Z0-9_]+\}/g, '');

  // Clean empty parentheses, dangling separators, and double spaces
  result = result
    .replace(/\(\s*\)/g, '')
    .replace(/\s+-\s+-/g, ' -')
    .replace(/(?:^|\s)-\s*$/g, '')
    .replace(/^\s*-\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\)/g, ')')
    .replace(/\(\s+/g, '(')
    .trim();

  return result;
}

/** Build placeholder values from a parsed product for name templates. */
export function productNameTemplateData(product: {
  name: string;
  originalName?: string;
  productName?: string;
  reference: string;
  color?: string;
  selectedBrand?: { name: string } | null;
  suggestedBrand?: string;
}): Record<string, string> {
  const brand =
    product.selectedBrand?.name || product.suggestedBrand || '';
  const name =
    product.originalName ||
    extractProductBaseName(product.name) ||
    product.name;
  const color = product.color || '';
  // Prefer supplier article code (productName); fall back to reference without color suffix
  const rawRef =
    product.productName ||
    product.reference.split('_')[0] ||
    product.reference;
  const reference = rawRef.toLowerCase();

  return { brand, name, color, reference };
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
