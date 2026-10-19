/**
 * Match ecommerce / public category paths from supplier files against Odoo
 * product.public.category records (which only expose name + parent_id).
 */

export interface PublicCategoryLike {
  id: number;
  name: string;
  display_name?: string;
  parent_id?: number | false | [number, string] | null;
}

/** Normalize path separators, en-dashes, and spacing for reliable matching. */
export function normalizePublicCategoryPath(raw: string): string {
  return raw
    .trim()
    .replace(/[–—]/g, '-') // en/em dash → hyphen (CSV often has "4–5")
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' / ')
    .toLowerCase();
}

function parentIdOf(cat: PublicCategoryLike): number | null {
  const p = cat.parent_id;
  if (p == null || p === false) return null;
  if (Array.isArray(p)) return p[0] ?? null;
  return typeof p === 'number' ? p : null;
}

/**
 * Build complete paths ("Speelgoed / Boeken") for every public category
 * using the parent_id hierarchy.
 */
export function buildPublicCategoryPathMap(
  categories: PublicCategoryLike[],
): Map<number, string> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const paths = new Map<number, string>();

  const pathFor = (id: number, stack: Set<number> = new Set()): string => {
    if (paths.has(id)) return paths.get(id)!;
    if (stack.has(id)) return byId.get(id)?.name || '';
    stack.add(id);

    const cat = byId.get(id);
    if (!cat) return '';

    const parent = parentIdOf(cat);
    const leaf = (cat.name || '').trim();
    const full = parent != null ? `${pathFor(parent, stack)} / ${leaf}` : leaf;
    const cleaned = full
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean)
      .join(' / ');
    paths.set(id, cleaned);
    return cleaned;
  };

  for (const cat of categories) {
    pathFor(cat.id);
  }

  return paths;
}

/**
 * Resolve a list of path strings to public category id/name pairs.
 * Prefers exact complete-path matches; falls back to leaf-name match when unique.
 */
export function matchPublicCategoriesByPaths(
  paths: string[],
  categories: PublicCategoryLike[],
): Array<{ id: number; name: string }> {
  if (!paths.length || !categories.length) return [];

  const pathMap = buildPublicCategoryPathMap(categories);
  const byNormPath = new Map<string, PublicCategoryLike>();
  const byLeaf = new Map<string, PublicCategoryLike[]>();

  for (const cat of categories) {
    const full = pathMap.get(cat.id) || cat.display_name || cat.name;
    byNormPath.set(normalizePublicCategoryPath(full), cat);

    const leaf = normalizePublicCategoryPath(cat.name);
    const list = byLeaf.get(leaf) || [];
    list.push(cat);
    byLeaf.set(leaf, list);
  }

  const matched: Array<{ id: number; name: string }> = [];
  const seen = new Set<number>();

  for (const raw of paths) {
    const norm = normalizePublicCategoryPath(raw);
    if (!norm) continue;

    let cat = byNormPath.get(norm);

    if (!cat) {
      // Also try without a leading "All /" if present
      const withoutAll = norm.replace(/^all\s*\/\s*/, '');
      cat = byNormPath.get(withoutAll);
    }

    if (!cat) {
      const leaf = norm.split(' / ').pop() || '';
      const leafHits = byLeaf.get(leaf) || [];
      if (leafHits.length === 1) cat = leafHits[0];
    }

    if (!cat || seen.has(cat.id)) continue;
    seen.add(cat.id);
    matched.push({
      id: cat.id,
      name: pathMap.get(cat.id) || cat.display_name || cat.name,
    });
  }

  return matched;
}

/** Split a comma-separated ecommerce category cell into path strings. */
export function splitPublicCategoryPaths(raw: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}
