import { odooClient } from '@/lib/odooClient';
import {
  categorySearchAliases,
  getBrusselsToday,
  isCountableQty,
  type StockFilters,
} from '@/lib/retail/stockSnapshot';
import {
  collectCategoryTreeIds,
  searchCategories,
  sizeAttributeNamesForAudience,
  type AudienceFilter,
} from '@/lib/retail/sellThrough';

export type StockMoveInput = {
  productId: number;
  qty: number;
  date: string;
  locationId: number;
  destLocationId: number;
};

export type ProductPriceRow = {
  id: number;
  templateId: number;
  standardPrice: number;
  listPrice: number;
};

export type BrandStockValueRow = {
  brandName: string;
  units: number;
  variantCount: number;
  templateCount: number;
  costValue: number;
  retailValue: number;
};

export type StockValueAtDateResult = {
  asOfDate: string;
  filters: { brand: string | null; category: string | null; audience: AudienceFilter };
  totalUnits: number;
  variantCount: number;
  templateCount: number;
  costValue: number;
  retailValue: number;
  zeroCostUnits: number;
  moveCount: number;
  truncatedMoves: boolean;
  truncatedProducts: boolean;
  brands: BrandStockValueRow[];
  summary: string;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T12:00:00`);
  return !Number.isNaN(d.getTime());
}

/** Net stock delta for one completed move touching internal locations. */
export function stockDeltaFromMove(
  locationId: number,
  destLocationId: number,
  qty: number,
  internalLocationIds: ReadonlySet<number>
): number {
  if (qty <= 0) return 0;
  const isInternal = internalLocationIds.has(locationId);
  const isDestInternal = internalLocationIds.has(destLocationId);
  if (!isInternal && isDestInternal) return qty;
  if (isInternal && !isDestInternal) return -qty;
  return 0;
}

/** Reconstruct on-hand qty per product at end of `asOfDate` from stock moves. */
export function computeStockAtDate(
  moves: StockMoveInput[],
  asOfDate: string,
  internalLocationIds: ReadonlySet<number>
): Map<number, number> {
  const cutoff = `${asOfDate} 23:59:59`;
  const stock = new Map<number, number>();

  const sorted = [...moves].sort((a, b) => a.date.localeCompare(b.date));
  for (const move of sorted) {
    if (move.date > cutoff) continue;
    const delta = stockDeltaFromMove(
      move.locationId,
      move.destLocationId,
      move.qty,
      internalLocationIds
    );
    if (!delta) continue;
    stock.set(move.productId, (stock.get(move.productId) || 0) + delta);
  }

  for (const [productId, qty] of [...stock.entries()]) {
    if (qty <= 0) stock.delete(productId);
  }

  return stock;
}

export function aggregateStockValues(
  stockByProductId: Map<number, number>,
  products: ProductPriceRow[],
  brandByTemplateId: Map<number, string>
): {
  totalUnits: number;
  variantCount: number;
  templateCount: number;
  costValue: number;
  retailValue: number;
  zeroCostUnits: number;
  brands: BrandStockValueRow[];
} {
  const productMap = new Map(products.map((p) => [p.id, p]));
  const templates = new Set<number>();
  let totalUnits = 0;
  let variantCount = 0;
  let costValue = 0;
  let retailValue = 0;
  let zeroCostUnits = 0;

  const brandAgg = new Map<
    string,
    { units: number; variants: Set<number>; templates: Set<number>; cost: number; retail: number }
  >();

  for (const [productId, qty] of stockByProductId) {
    if (!isCountableQty(qty)) continue;
    const product = productMap.get(productId);
    if (!product) continue;

    totalUnits += qty;
    variantCount += 1;
    templates.add(product.templateId);
    const cost = qty * product.standardPrice;
    const retail = qty * product.listPrice;
    costValue += cost;
    retailValue += retail;
    if (!product.standardPrice) zeroCostUnits += qty;

    const brandName = brandByTemplateId.get(product.templateId) || 'Onbekend merk';
    let row = brandAgg.get(brandName);
    if (!row) {
      row = { units: 0, variants: new Set(), templates: new Set(), cost: 0, retail: 0 };
      brandAgg.set(brandName, row);
    }
    row.units += qty;
    row.variants.add(productId);
    row.templates.add(product.templateId);
    row.cost += cost;
    row.retail += retail;
  }

  const brands = [...brandAgg.entries()]
    .map(([brandName, row]) => ({
      brandName,
      units: row.units,
      variantCount: row.variants.size,
      templateCount: row.templates.size,
      costValue: +row.cost.toFixed(2),
      retailValue: +row.retail.toFixed(2),
    }))
    .sort((a, b) => b.costValue - a.costValue);

  return {
    totalUnits,
    variantCount,
    templateCount: templates.size,
    costValue: +costValue.toFixed(2),
    retailValue: +retailValue.toFixed(2),
    zeroCostUnits,
    brands,
  };
}

function euro(n: number): string {
  return `€${n.toFixed(2)}`;
}

async function getMerkAttributeIds(uid: number, password: string): Promise<number[]> {
  const rows = await odooClient.searchRead<{ id: number }>(
    uid,
    password,
    'product.attribute',
    [['name', '=', 'MERK']],
    ['id'],
    5
  );
  return rows.map((r) => r.id);
}

async function getTemplateIdsWithAttribute(
  uid: number,
  password: string,
  attributeIds: number[],
  valueIds?: number[]
): Promise<Set<number>> {
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

async function resolveCategory(
  uid: number,
  password: string,
  query: string
): Promise<{ id: number; name: string; completeName: string | null }> {
  const aliases = categorySearchAliases(query);
  for (const term of aliases) {
    const hits = await searchCategories(uid, password, term, 5);
    if (hits.length) {
      const exact = hits.find(
        (h) =>
          h.name.toLowerCase() === term.toLowerCase() ||
          (h.completeName || '').toLowerCase() === term.toLowerCase()
      );
      const pick = exact || hits[0];
      return {
        id: pick.id,
        name: pick.name,
        completeName: pick.completeName,
      };
    }
  }
  throw new Error(`Category not found: ${query}`);
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
    templateFilter = await getTemplateIdsWithAttribute(uid, password, merkIds, [brand.id]);
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

async function fetchActiveProducts(
  uid: number,
  password: string,
  filters: StockFilters
): Promise<{
  products: ProductPriceRow[];
  resolved: { brand: string | null; category: string | null; audience: AudienceFilter };
  truncated: boolean;
}> {
  const { templateFilter, categoryIds, resolved } = await resolveFilters(
    uid,
    password,
    filters
  );

  const domain: unknown[] = [['active', '=', true]];
  if (categoryIds) domain.push(['categ_id', 'in', categoryIds]);
  if (templateFilter) domain.push(['product_tmpl_id', 'in', [...templateFilter]]);

  const LIMIT = 20000;
  const rows = await odooClient.searchRead<{
    id: number;
    product_tmpl_id: [number, string];
    standard_price: number;
    list_price: number;
  }>(
    uid,
    password,
    'product.product',
    domain,
    ['id', 'product_tmpl_id', 'standard_price', 'list_price'],
    LIMIT,
    0,
    'id asc'
  );

  const products: ProductPriceRow[] = [];
  for (const row of rows) {
    if (!Array.isArray(row.product_tmpl_id)) continue;
    products.push({
      id: row.id,
      templateId: row.product_tmpl_id[0],
      standardPrice: row.standard_price || 0,
      listPrice: row.list_price || 0,
    });
  }

  return { products, resolved, truncated: rows.length >= LIMIT };
}

async function fetchStockMovesUntil(
  uid: number,
  password: string,
  asOfDate: string,
  internalLocationIds: number[],
  productIdSet: Set<number>
): Promise<{ moves: StockMoveInput[]; truncated: boolean }> {
  const cutoff = `${asOfDate} 23:59:59`;
  const moves: StockMoveInput[] = [];
  let offset = 0;
  let truncated = false;

  while (true) {
    const batch = await odooClient.searchRead<{
      product_id: [number, string];
      product_qty: number;
      date: string;
      location_id: [number, string];
      location_dest_id: [number, string];
    }>(
      uid,
      password,
      'stock.move',
      [
        ['date', '<=', cutoff],
        ['state', '=', 'done'],
        '|',
        ['location_id', 'in', internalLocationIds],
        ['location_dest_id', 'in', internalLocationIds],
      ],
      ['product_id', 'product_qty', 'date', 'location_id', 'location_dest_id'],
      5000,
      offset,
      'date asc'
    );

    for (const move of batch) {
      const productId = move.product_id?.[0];
      if (!productId || !productIdSet.has(productId)) continue;
      moves.push({
        productId,
        qty: move.product_qty || 0,
        date: move.date,
        locationId: move.location_id?.[0] || 0,
        destLocationId: move.location_dest_id?.[0] || 0,
      });
    }

    if (batch.length < 5000) break;
    offset += 5000;
    if (offset >= 200000) {
      truncated = true;
      break;
    }
  }

  return { moves, truncated };
}

export async function getStockValueAtDate(input: {
  uid: number;
  password: string;
  asOfDate: string;
  filters?: StockFilters;
}): Promise<StockValueAtDateResult> {
  const asOfDate = input.asOfDate.trim();
  if (!isValidIsoDate(asOfDate)) {
    throw new Error('Ongeldige datum (verwacht YYYY-MM-DD)');
  }

  const today = getBrusselsToday().isoDate;
  if (asOfDate > today) {
    throw new Error('Datum kan niet in de toekomst liggen');
  }

  const { products, resolved, truncated: truncatedProducts } = await fetchActiveProducts(
    input.uid,
    input.password,
    input.filters || {}
  );

  const productIdSet = new Set(products.map((p) => p.id));
  if (!productIdSet.size) {
    return {
      asOfDate,
      filters: resolved,
      totalUnits: 0,
      variantCount: 0,
      templateCount: 0,
      costValue: 0,
      retailValue: 0,
      zeroCostUnits: 0,
      moveCount: 0,
      truncatedMoves: false,
      truncatedProducts,
      brands: [],
      summary: `Geen producten gevonden voor de gekozen filters op ${asOfDate}.`,
    };
  }

  const locations = await odooClient.searchRead<{ id: number }>(
    input.uid,
    input.password,
    'stock.location',
    [['usage', '=', 'internal']],
    ['id'],
    200
  );
  const internalIds = locations.map((l) => l.id);
  const internalSet = new Set(internalIds);

  const { moves, truncated: truncatedMoves } = await fetchStockMovesUntil(
    input.uid,
    input.password,
    asOfDate,
    internalIds,
    productIdSet
  );

  const stockByProductId = computeStockAtDate(moves, asOfDate, internalSet);
  const templateIds = [...new Set(products.map((p) => p.templateId))];
  const brandByTemplateId = await buildTemplateBrandMap(
    input.uid,
    input.password,
    templateIds
  );

  const totals = aggregateStockValues(stockByProductId, products, brandByTemplateId);

  const filterBits = [
    resolved.brand ? `merk ${resolved.brand}` : null,
    resolved.category ? `categorie ${resolved.category}` : null,
    resolved.audience !== 'all' ? `doelgroep ${resolved.audience}` : null,
  ].filter(Boolean);

  const summary = [
    `Voorraad op ${asOfDate}: ${totals.totalUnits.toFixed(0)} stuks · ${totals.variantCount} varianten · ${totals.templateCount} modellen`,
    `kost ${euro(totals.costValue)} · verkoopwaarde ${euro(totals.retailValue)}`,
    filterBits.length ? `filters: ${filterBits.join(', ')}` : null,
    totals.zeroCostUnits
      ? `(${totals.zeroCostUnits.toFixed(0)} stuks zonder kostprijs)`
      : null,
    truncatedProducts || truncatedMoves ? '(resultaat mogelijk afgekapt)' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    asOfDate,
    filters: resolved,
    totalUnits: totals.totalUnits,
    variantCount: totals.variantCount,
    templateCount: totals.templateCount,
    costValue: totals.costValue,
    retailValue: totals.retailValue,
    zeroCostUnits: totals.zeroCostUnits,
    moveCount: moves.length,
    truncatedMoves,
    truncatedProducts,
    brands: totals.brands,
    summary,
  };
}
