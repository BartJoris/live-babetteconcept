/**
 * Suggest / normalize internal Odoo product.category paths for smart import.
 * Used when a brand is new or has no category assigned yet (e.g. Nixnut → All / Nixnut).
 */

export interface CategoryLike {
  id: number;
  name: string;
  display_name?: string;
  complete_name?: string;
}

export interface CategorySuggestion {
  /** Full path, e.g. "All / Kleding / Baje" */
  path: string;
  /** Existing Odoo category when the path already exists */
  existing?: CategoryLike;
  /** True when this path would be created on import */
  isNew: boolean;
  /** Short reason for the UI */
  reason: string;
}

function categoryPath(cat: CategoryLike): string {
  return (cat.complete_name || cat.display_name || cat.name || '').trim();
}

/** Normalize slashes/spaces: "All/Kleding/Baje" → "All / Kleding / Baje" */
export function normalizeCategoryPath(raw: string): string {
  return raw
    .trim()
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' / ');
}

export function categoryPathExists(
  path: string,
  categories: CategoryLike[],
): CategoryLike | undefined {
  const normalized = normalizeCategoryPath(path).toLowerCase();
  return categories.find(
    (c) => categoryPath(c).toLowerCase() === normalized,
  );
}

export function findCategoriesMatchingBrand(
  brandName: string,
  categories: CategoryLike[],
): CategoryLike[] {
  const brand = brandName.trim().toLowerCase();
  if (!brand) return [];

  return categories
    .filter((c) => {
      const path = categoryPath(c).toLowerCase();
      const leaf = path.split(' / ').pop() || '';
      return leaf === brand || path.includes(` / ${brand}`);
    })
    .sort((a, b) => categoryPath(a).localeCompare(categoryPath(b)));
}

function parentExists(path: string, categories: CategoryLike[]): boolean {
  return Boolean(categoryPathExists(path, categories));
}

/**
 * Build ranked category proposals for a brand:
 * 1. Existing Odoo categories whose leaf/path matches the brand
 * 2. New paths under AW26 / Kleding / All (only parents that already exist)
 */
export function suggestCategoriesForBrand(
  brandName: string,
  categories: CategoryLike[],
  options?: { sizeAttribute?: string },
): CategorySuggestion[] {
  const brand = brandName.trim();
  if (!brand) return [];

  const suggestions: CategorySuggestion[] = [];
  const seen = new Set<string>();

  const push = (path: string, reason: string, existing?: CategoryLike) => {
    const normalized = normalizeCategoryPath(path);
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push({
      path: normalized,
      existing,
      isNew: !existing,
      reason,
    });
  };

  for (const existing of findCategoriesMatchingBrand(brand, categories)) {
    push(categoryPath(existing), 'Bestaande categorie', existing);
  }

  const hasAll = parentExists('All', categories);
  const hasKleding = parentExists('All / Kleding', categories);
  const hasBabys = parentExists("All / Kleding / Baby's", categories);
  const hasKinderen = parentExists('All / Kleding / Kinderen', categories);
  const hasAw26 = parentExists('All / AW26', categories);

  if (hasAw26) {
    push(`All / AW26 / ${brand}`, 'Seizoenscollectie AW26');
  }

  const size = options?.sizeAttribute || '';
  if (size === "MAAT Baby's" && hasBabys) {
    push(`All / Kleding / Baby's / ${brand}`, "Onder Kleding / Baby's");
  } else if (
    (size === 'MAAT Kinderen' || size === 'MAAT Tieners') &&
    hasKinderen
  ) {
    push(`All / Kleding / Kinderen / ${brand}`, 'Onder Kleding / Kinderen');
  }

  if (hasKleding) {
    push(`All / Kleding / ${brand}`, 'Onder Kleding (merkmap)');
  }

  if (hasAll) {
    push(`All / ${brand}`, 'Top-level merkmap onder All');
  }

  return suggestions;
}

/**
 * Turn a typed value into a full category path.
 * Bare names default under All / Kleding when that parent exists, else All /.
 */
export function resolveTypedCategoryPath(
  raw: string,
  categories: CategoryLike[],
): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  if (trimmed.includes('/')) {
    const normalized = normalizeCategoryPath(trimmed);
    return normalized.toLowerCase().startsWith('all')
      ? normalized
      : normalizeCategoryPath(`All / ${normalized}`);
  }

  if (parentExists('All / Kleding', categories)) {
    return `All / Kleding / ${trimmed}`;
  }
  if (parentExists('All', categories)) {
    return `All / ${trimmed}`;
  }
  return trimmed;
}
