import { odooClient } from '@/lib/odooClient';
import {
  collectCategoryTreeIds,
  searchCategories,
  sizeAttributeNamesForAudience,
  type AudienceFilter,
} from '@/lib/retail/sellThrough';

export type StockFilters = {
  brand?: string;
  category?: string;
  audience?: AudienceFilter;
};

type InStockVariant = {
  id: number;
  templateId: number;
  templateName: string;
  qty: number;
  standardPrice: number;
  listPrice: number;
  barcode: string | null;
  displayName: string;
  categId: number | null;
  categLabel: string | null;
};

/** qty usable for on-hand counts (excludes 0 and unlimited -1). */
export function isCountableQty(qty: number): boolean {
  return typeof qty === 'number' && qty > 0 && qty !== -1;
}

/**
 * Last size left: exactly one in-stock variant and that qty is 1.
 * `inStockQtys` = qtys of variants that are already countable.
 */
export function isLastSizeLeft(inStockQtys: number[]): boolean {
  return inStockQtys.length === 1 && inStockQtys[0] === 1;
}

/** Latest 20xx year in a category name/path, or null. */
export function parseCollectionYear(
  categoryPath: string | null | undefined
): number | null {
  if (!categoryPath) return null;
  const years = [...categoryPath.matchAll(/\b(20\d{2})\b/g)].map((m) =>
    Number(m[1])
  );
  if (!years.length) return null;
  return Math.max(...years);
}

export function getBrusselsToday(now = new Date()): {
  isoDate: string;
  year: number;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return { isoDate: `${year}-${month}-${day}`, year };
}

export function collectionAgeYears(
  collectionYear: number,
  currentYear: number
): number {
  return currentYear - collectionYear;
}

/** Whole calendar years from ISO date to asOfDate (both YYYY-MM-DD). */
export function receiptAgeYears(
  firstReceiptDate: string,
  asOfDate: string
): number {
  const [y0, m0, d0] = firstReceiptDate.split('-').map(Number);
  const [y1, m1, d1] = asOfDate.split('-').map(Number);
  let years = y1 - y0;
  if (m1 < m0 || (m1 === m0 && d1 < d0)) years -= 1;
  return years;
}

export function isAgedBySignals(input: {
  collectionYear: number | null;
  firstReceiptDate: string | null;
  minAgeYears: number;
  currentYear: number;
  asOfDate: string;
}): { aged: boolean; ageReason: 'collection' | 'first_receipt' | 'both' | null } {
  const byCollection =
    input.collectionYear != null &&
    collectionAgeYears(input.collectionYear, input.currentYear) >=
      input.minAgeYears;
  const byReceipt =
    input.firstReceiptDate != null &&
    receiptAgeYears(input.firstReceiptDate, input.asOfDate) >=
      input.minAgeYears;

  if (byCollection && byReceipt) return { aged: true, ageReason: 'both' };
  if (byCollection) return { aged: true, ageReason: 'collection' };
  if (byReceipt) return { aged: true, ageReason: 'first_receipt' };
  return { aged: false, ageReason: null };
}

/** Prefer trailing size-like token from display_name (e.g. "Dress (XS)"). */
export function remainingVariantLabel(displayName: string): string {
  const paren = displayName.match(/\(([^)]+)\)\s*$/);
  if (paren?.[1]) return paren[1].trim();
  const parts = displayName.split(/\s+[–-]\s+/);
  if (parts.length > 1) return parts[parts.length - 1]!.trim();
  return displayName;
}

/**
 * Extra category search terms for Babette naming
 * (e.g. "Herfst 2026" → AW26 / Winter 2026).
 */
export function categorySearchAliases(query: string): string[] {
  const q = query.trim();
  if (!q) return [];
  const out = [q];
  const lower = q.toLowerCase();

  const seasonYear = lower.match(
    /\b(herfst|winter|najaar|autumn|fall|aw|fw)\s*(?:20)?(\d{2})\b/
  );
  if (seasonYear) {
    const yy = seasonYear[2]!;
    out.push(`AW${yy}`, `AW ${yy}`, `AW20${yy}`, `Winter 20${yy}`, `Winter ${yy}`);
  }

  const awShort = lower.match(/\baw\s*(\d{2})\b/);
  if (awShort) {
    const yy = awShort[1]!;
    out.push(`AW${yy}`, `Herfst 20${yy}`, `Winter 20${yy}`);
  }

  return [...new Set(out)];
}

async function resolveCategory(
  uid: number,
  password: string,
  query: string
): Promise<{ id: number; name: string; completeName: string | null }> {
  const aliases = categorySearchAliases(query);
  for (const alias of aliases) {
    const cats = await searchCategories(uid, password, alias, 20);
    if (!cats.length) continue;
    const q = alias.toLowerCase();
    const cat =
      cats.find(
        (c) =>
          c.name.toLowerCase() === q ||
          (c.completeName || '').toLowerCase() === q ||
          (c.completeName || '').toLowerCase().endsWith(`/${q}`) ||
          (c.completeName || '').toLowerCase().endsWith(q)
      ) || cats[0];
    if (cat) {
      return {
        id: cat.id,
        name: cat.name,
        completeName: cat.completeName,
      };
    }
  }
  throw new Error(
    `Category not found: ${query}. Tried: ${aliases.join(', ')}. Use list_categories.`
  );
}

async function getMerkAttributeIds(
  uid: number,
  password: string
): Promise<number[]> {
  const attrs = await odooClient.searchRead<{ id: number }>(
    uid,
    password,
    'product.attribute',
    [['name', 'in', ['MERK', 'Merk 1']]],
    ['id'],
    10
  );
  return attrs.map((a) => a.id);
}

async function getTemplateIdsWithAttribute(
  uid: number,
  password: string,
  attributeIds: number[],
  valueIds?: number[]
): Promise<Set<number>> {
  if (!attributeIds.length) return new Set();
  const domain: unknown[] = [['attribute_id', 'in', attributeIds]];
  if (valueIds?.length) domain.push(['value_ids', 'in', valueIds]);

  const lines = await odooClient.searchRead<{
    product_tmpl_id: [number, string];
    value_ids?: number[];
  }>(
    uid,
    password,
    'product.template.attribute.line',
    domain,
    ['product_tmpl_id', 'value_ids'],
    20000
  );

  const ids = new Set<number>();
  for (const line of lines) {
    if (valueIds?.length) {
      const hit = (line.value_ids || []).some((v) => valueIds.includes(v));
      if (!hit) continue;
    }
    if (Array.isArray(line.product_tmpl_id)) ids.add(line.product_tmpl_id[0]);
  }
  return ids;
}

async function resolveFilters(
  uid: number,
  password: string,
  filters: StockFilters
): Promise<{
  templateFilter: Set<number> | null;
  categoryIds: number[] | null;
  resolved: { brand: string | null; category: string | null; audience: AudienceFilter };
}> {
  const audience = filters.audience ?? 'all';
  let templateFilter: Set<number> | null = null;
  let categoryIds: number[] | null = null;
  let brandLabel: string | null = null;
  let categoryLabel: string | null = null;

  if (filters.brand?.trim()) {
    const merkIds = await getMerkAttributeIds(uid, password);
    const brands = await odooClient.searchRead<{ id: number; name: string }>(
      uid,
      password,
      'product.attribute.value',
      [['attribute_id', 'in', merkIds], ['name', 'ilike', filters.brand.trim()]],
      ['id', 'name'],
      20
    );
    const brand =
      brands.find(
        (b) => b.name.toLowerCase() === filters.brand!.trim().toLowerCase()
      ) || brands[0];
    if (!brand) throw new Error(`Brand not found: ${filters.brand}`);
    brandLabel = brand.name;
    templateFilter = await getTemplateIdsWithAttribute(
      uid,
      password,
      merkIds,
      [brand.id]
    );
  }

  if (filters.category?.trim()) {
    const cat = await resolveCategory(uid, password, filters.category.trim());
    categoryLabel = cat.completeName || cat.name;
    categoryIds = await collectCategoryTreeIds(uid, password, cat.id);
  }

  if (audience !== 'all') {
    const sizeNames = sizeAttributeNamesForAudience(audience);
    const sizeAttrs = await odooClient.searchRead<{ id: number }>(
      uid,
      password,
      'product.attribute',
      [['name', 'in', sizeNames]],
      ['id'],
      10
    );
    const audienceTemplates = await getTemplateIdsWithAttribute(
      uid,
      password,
      sizeAttrs.map((a) => a.id)
    );
    if (templateFilter) {
      templateFilter = new Set(
        [...templateFilter].filter((id) => audienceTemplates.has(id))
      );
    } else {
      templateFilter = audienceTemplates;
    }
  }

  return {
    templateFilter,
    categoryIds,
    resolved: { brand: brandLabel, category: categoryLabel, audience },
  };
}

async function fetchInStockVariants(
  uid: number,
  password: string,
  filters: StockFilters
): Promise<{
  variants: InStockVariant[];
  resolved: { brand: string | null; category: string | null; audience: AudienceFilter };
  truncated: boolean;
}> {
  const { templateFilter, categoryIds, resolved } = await resolveFilters(
    uid,
    password,
    filters
  );

  const domain: unknown[] = [['qty_available', '>', 0]];
  if (categoryIds) domain.push(['categ_id', 'in', categoryIds]);
  if (templateFilter) domain.push(['product_tmpl_id', 'in', [...templateFilter]]);

  const LIMIT = 20000;
  const rows = await odooClient.searchRead<{
    id: number;
    product_tmpl_id: [number, string];
    qty_available: number;
    standard_price: number;
    list_price: number;
    barcode: string | false | null;
    display_name: string;
    categ_id: [number, string] | false;
  }>(
    uid,
    password,
    'product.product',
    domain,
    [
      'id',
      'product_tmpl_id',
      'qty_available',
      'standard_price',
      'list_price',
      'barcode',
      'display_name',
      'categ_id',
    ],
    LIMIT,
    0,
    'id asc'
  );

  const variants: InStockVariant[] = [];
  for (const r of rows) {
    const qty = r.qty_available || 0;
    if (!isCountableQty(qty)) continue;
    if (!Array.isArray(r.product_tmpl_id)) continue;
    variants.push({
      id: r.id,
      templateId: r.product_tmpl_id[0],
      templateName: r.product_tmpl_id[1],
      qty,
      standardPrice: r.standard_price || 0,
      listPrice: r.list_price || 0,
      barcode: r.barcode ? String(r.barcode) : null,
      displayName: r.display_name || r.product_tmpl_id[1],
      categId: Array.isArray(r.categ_id) ? r.categ_id[0] : null,
      categLabel: Array.isArray(r.categ_id) ? r.categ_id[1] : null,
    });
  }

  return {
    variants,
    resolved,
    truncated: rows.length >= LIMIT,
  };
}

async function buildTemplateBrandMap(
  uid: number,
  password: string,
  templateIds: number[]
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (!templateIds.length) return result;

  const merkIds = await getMerkAttributeIds(uid, password);
  if (!merkIds.length) return result;

  const brandValues = await odooClient.searchRead<{ id: number; name: string }>(
    uid,
    password,
    'product.attribute.value',
    [['attribute_id', 'in', merkIds]],
    ['id', 'name'],
    500
  );
  const brandNames = new Map(brandValues.map((b) => [b.id, b.name]));

  const chunk = 500;
  for (let i = 0; i < templateIds.length; i += chunk) {
    const slice = templateIds.slice(i, i + chunk);
    const lines = await odooClient.searchRead<{
      product_tmpl_id: [number, string];
      value_ids?: number[];
    }>(
      uid,
      password,
      'product.template.attribute.line',
      [['attribute_id', 'in', merkIds], ['product_tmpl_id', 'in', slice]],
      ['product_tmpl_id', 'value_ids'],
      5000
    );
    for (const line of lines) {
      if (!Array.isArray(line.product_tmpl_id)) continue;
      const tmplId = line.product_tmpl_id[0];
      if (result.has(tmplId)) continue;
      for (const vid of line.value_ids || []) {
        const name = brandNames.get(vid);
        if (name) {
          result.set(tmplId, name);
          break;
        }
      }
    }
  }
  return result;
}

async function firstIncomingDatesByProduct(
  uid: number,
  password: string,
  productIds: number[]
): Promise<Map<number, string>> {
  const firstByProduct = new Map<number, string>();
  if (!productIds.length) return firstByProduct;

  const locations = await odooClient.searchRead<{ id: number }>(
    uid,
    password,
    'stock.location',
    [['usage', '=', 'internal']],
    ['id'],
    200
  );
  const internalIds = new Set(locations.map((l) => l.id));

  const chunk = 400;
  for (let i = 0; i < productIds.length; i += chunk) {
    const slice = productIds.slice(i, i + chunk);
    let offset = 0;
    while (true) {
      const moves = await odooClient.searchRead<{
        product_id: [number, string];
        date: string;
        location_id: [number, string];
        location_dest_id: [number, string];
      }>(
        uid,
        password,
        'stock.move',
        [
          ['product_id', 'in', slice],
          ['state', '=', 'done'],
          ['location_dest_id', 'in', [...internalIds]],
        ],
        ['product_id', 'date', 'location_id', 'location_dest_id'],
        5000,
        offset,
        'date asc'
      );

      for (const move of moves) {
        const productId = move.product_id?.[0];
        if (!productId) continue;
        const loc = move.location_id?.[0];
        const dest = move.location_dest_id?.[0];
        if (internalIds.has(loc) || !internalIds.has(dest)) continue;
        const day = move.date.slice(0, 10);
        const prev = firstByProduct.get(productId);
        if (!prev || day < prev) firstByProduct.set(productId, day);
      }

      if (moves.length < 5000) break;
      offset += 5000;
    }
  }

  return firstByProduct;
}

function euro(n: number): string {
  return `€${n.toFixed(2)}`;
}

/**
 * Count products created/assigned in a brand or category (not only in-stock).
 * Requires brand and/or category.
 */
export async function countAssortment(input: {
  uid: number;
  password: string;
  brand?: string;
  category?: string;
  audience?: AudienceFilter;
}): Promise<{
  matchedBrand: string | null;
  matchedCategory: string | null;
  audience: AudienceFilter;
  templateCount: number;
  variantCount: number;
  inStockTemplateCount: number;
  inStockVariantCount: number;
  inStockUnits: number;
  truncated: boolean;
  summary: string;
}> {
  if (!input.brand?.trim() && !input.category?.trim()) {
    throw new Error('Provide brand and/or category (e.g. category="Herfst 2026" or "AW26")');
  }

  const { templateFilter, categoryIds, resolved } = await resolveFilters(
    input.uid,
    input.password,
    {
      brand: input.brand,
      category: input.category,
      audience: input.audience,
    }
  );

  const domain: unknown[] = [];
  if (categoryIds) domain.push(['categ_id', 'in', categoryIds]);
  if (templateFilter) domain.push(['product_tmpl_id', 'in', [...templateFilter]]);
  if (!domain.length) {
    throw new Error('No filter resolved for assortment count');
  }

  const LIMIT = 20000;
  const rows = await odooClient.searchRead<{
    id: number;
    product_tmpl_id: [number, string];
    qty_available: number;
  }>(
    input.uid,
    input.password,
    'product.product',
    domain,
    ['id', 'product_tmpl_id', 'qty_available'],
    LIMIT,
    0,
    'id asc'
  );

  const templates = new Set<number>();
  const inStockTemplates = new Set<number>();
  let inStockVariantCount = 0;
  let inStockUnits = 0;

  for (const r of rows) {
    if (!Array.isArray(r.product_tmpl_id)) continue;
    templates.add(r.product_tmpl_id[0]);
    const qty = r.qty_available || 0;
    if (isCountableQty(qty)) {
      inStockVariantCount += 1;
      inStockUnits += qty;
      inStockTemplates.add(r.product_tmpl_id[0]);
    }
  }

  const label = resolved.category || resolved.brand || 'assortiment';
  const summary = [
    `${label}: ${templates.size} modellen · ${rows.length} varianten aangemaakt`,
    `waarvan op voorraad: ${inStockTemplates.size} modellen · ${inStockVariantCount} varianten · ${inStockUnits.toFixed(0)} stuks`,
    rows.length >= LIMIT ? '(afgekapt bij 20.000 rijen)' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    matchedBrand: resolved.brand,
    matchedCategory: resolved.category,
    audience: resolved.audience,
    templateCount: templates.size,
    variantCount: rows.length,
    inStockTemplateCount: inStockTemplates.size,
    inStockVariantCount,
    inStockUnits,
    truncated: rows.length >= LIMIT,
    summary,
  };
}

export async function getStockSummary(input: {
  uid: number;
  password: string;
  filters?: StockFilters;
}): Promise<{
  filters: { brand: string | null; category: string | null; audience: AudienceFilter };
  totalUnits: number;
  variantCount: number;
  templateCount: number;
  costValue: number;
  retailValue: number;
  zeroCostUnits: number;
  truncated: boolean;
  summary: string;
}> {
  const { variants, resolved, truncated } = await fetchInStockVariants(
    input.uid,
    input.password,
    input.filters || {}
  );

  let totalUnits = 0;
  let costValue = 0;
  let retailValue = 0;
  let zeroCostUnits = 0;
  const templates = new Set<number>();

  for (const v of variants) {
    totalUnits += v.qty;
    costValue += v.qty * v.standardPrice;
    retailValue += v.qty * v.listPrice;
    if (!v.standardPrice) zeroCostUnits += v.qty;
    templates.add(v.templateId);
  }

  const summary = [
    `Voorraad: ${totalUnits.toFixed(0)} stuks · ${variants.length} varianten · ${templates.size} modellen`,
    `kost ${euro(costValue)} · verkoopwaarde ${euro(retailValue)}`,
    zeroCostUnits
      ? `(${zeroCostUnits.toFixed(0)} stuks zonder kostprijs)`
      : null,
    truncated ? '(resultaat mogelijk afgekapt bij 20.000 rijen)' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    filters: resolved,
    totalUnits,
    variantCount: variants.length,
    templateCount: templates.size,
    costValue,
    retailValue,
    zeroCostUnits,
    truncated,
    summary,
  };
}

export async function listLastSizeLeft(input: {
  uid: number;
  password: string;
  filters?: StockFilters;
  limit?: number;
}): Promise<{
  count: number;
  items: Array<{
    templateId: number;
    name: string;
    remainingVariantId: number;
    remainingLabel: string;
    barcode: string | null;
    qty: 1;
    costPrice: number;
    listPrice: number;
    brand: string | null;
    category: string | null;
  }>;
  truncated: boolean;
  summary: string;
}> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const { variants, truncated } = await fetchInStockVariants(
    input.uid,
    input.password,
    input.filters || {}
  );

  const byTemplate = new Map<number, InStockVariant[]>();
  for (const v of variants) {
    const list = byTemplate.get(v.templateId) || [];
    list.push(v);
    byTemplate.set(v.templateId, list);
  }

  const matches: InStockVariant[] = [];
  for (const list of byTemplate.values()) {
    const qtys = list.map((v) => v.qty);
    if (!isLastSizeLeft(qtys)) continue;
    matches.push(list[0]!);
  }

  matches.sort((a, b) => a.templateName.localeCompare(b.templateName, 'nl'));
  const brandMap = await buildTemplateBrandMap(
    input.uid,
    input.password,
    matches.slice(0, limit).map((m) => m.templateId)
  );

  const items = matches.slice(0, limit).map((v) => ({
    templateId: v.templateId,
    name: v.templateName,
    remainingVariantId: v.id,
    remainingLabel: remainingVariantLabel(v.displayName),
    barcode: v.barcode,
    qty: 1 as const,
    costPrice: v.standardPrice,
    listPrice: v.listPrice,
    brand: brandMap.get(v.templateId) || null,
    category: v.categLabel,
  }));

  return {
    count: matches.length,
    items,
    truncated,
    summary: `${matches.length} modellen met nog exact 1 stuk van 1 variant${
      items.length < matches.length ? ` (top ${items.length} getoond)` : ''
    }`,
  };
}

export async function listAgedStock(input: {
  uid: number;
  password: string;
  filters?: StockFilters;
  minAgeYears?: number;
  limit?: number;
  now?: Date;
}): Promise<{
  minAgeYears: number;
  asOfDate: string;
  totals: {
    templateCount: number;
    totalUnits: number;
    costValue: number;
    retailValue: number;
  };
  items: Array<{
    templateId: number;
    name: string;
    category: string | null;
    collectionYear: number | null;
    firstReceiptDate: string | null;
    ageReason: 'collection' | 'first_receipt' | 'both';
    units: number;
    costValue: number;
    retailValue: number;
    brand: string | null;
  }>;
  truncated: boolean;
  summary: string;
}> {
  const minAgeYears = Math.min(Math.max(input.minAgeYears ?? 2, 1), 10);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const { isoDate: asOfDate, year: currentYear } = getBrusselsToday(input.now);

  const { variants, truncated } = await fetchInStockVariants(
    input.uid,
    input.password,
    input.filters || {}
  );

  type Agg = {
    templateId: number;
    name: string;
    category: string | null;
    collectionYear: number | null;
    units: number;
    costValue: number;
    retailValue: number;
    productIds: number[];
  };

  const byTemplate = new Map<number, Agg>();
  for (const v of variants) {
    let agg = byTemplate.get(v.templateId);
    if (!agg) {
      agg = {
        templateId: v.templateId,
        name: v.templateName,
        category: v.categLabel,
        collectionYear: parseCollectionYear(v.categLabel),
        units: 0,
        costValue: 0,
        retailValue: 0,
        productIds: [],
      };
      byTemplate.set(v.templateId, agg);
    }
    agg.units += v.qty;
    agg.costValue += v.qty * v.standardPrice;
    agg.retailValue += v.qty * v.listPrice;
    agg.productIds.push(v.id);
  }

  // Only load stock.move history for templates not already aged by collection year.
  const needsReceiptCheck: number[] = [];
  for (const agg of byTemplate.values()) {
    const byCollection =
      agg.collectionYear != null &&
      collectionAgeYears(agg.collectionYear, currentYear) >= minAgeYears;
    if (!byCollection) needsReceiptCheck.push(...agg.productIds);
  }

  const firstByProduct = await firstIncomingDatesByProduct(
    input.uid,
    input.password,
    needsReceiptCheck
  );

  type AgedRow = Agg & {
    firstReceiptDate: string | null;
    ageReason: 'collection' | 'first_receipt' | 'both';
  };

  const aged: AgedRow[] = [];
  for (const agg of byTemplate.values()) {
    let firstReceiptDate: string | null = null;
    for (const pid of agg.productIds) {
      const d = firstByProduct.get(pid);
      if (d && (!firstReceiptDate || d < firstReceiptDate)) firstReceiptDate = d;
    }
    const { aged: isAged, ageReason } = isAgedBySignals({
      collectionYear: agg.collectionYear,
      firstReceiptDate,
      minAgeYears,
      currentYear,
      asOfDate,
    });
    if (!isAged || !ageReason) continue;
    aged.push({ ...agg, firstReceiptDate, ageReason });
  }

  aged.sort((a, b) => {
    const ya = a.collectionYear ?? 9999;
    const yb = b.collectionYear ?? 9999;
    if (ya !== yb) return ya - yb;
    const da = a.firstReceiptDate || '9999';
    const db = b.firstReceiptDate || '9999';
    if (da !== db) return da.localeCompare(db);
    return a.name.localeCompare(b.name, 'nl');
  });

  let totalUnits = 0;
  let costValue = 0;
  let retailValue = 0;
  for (const row of aged) {
    totalUnits += row.units;
    costValue += row.costValue;
    retailValue += row.retailValue;
  }

  const brandMap = await buildTemplateBrandMap(
    input.uid,
    input.password,
    aged.slice(0, limit).map((r) => r.templateId)
  );

  const items = aged.slice(0, limit).map((r) => ({
    templateId: r.templateId,
    name: r.name,
    category: r.category,
    collectionYear: r.collectionYear,
    firstReceiptDate: r.firstReceiptDate,
    ageReason: r.ageReason,
    units: r.units,
    costValue: r.costValue,
    retailValue: r.retailValue,
    brand: brandMap.get(r.templateId) || null,
  }));

  return {
    minAgeYears,
    asOfDate,
    totals: {
      templateCount: aged.length,
      totalUnits,
      costValue,
      retailValue,
    },
    items,
    truncated,
    summary: [
      `${aged.length} modellen ouder dan ${minAgeYears}j met nog voorraad`,
      `${totalUnits.toFixed(0)} stuks · kost ${euro(costValue)} · verkoop ${euro(retailValue)}`,
      items.length < aged.length ? `(top ${items.length} getoond)` : null,
      truncated ? '(catalogus mogelijk afgekapt)' : null,
    ]
      .filter(Boolean)
      .join(' · '),
  };
}
