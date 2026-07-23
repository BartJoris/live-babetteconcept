import { odooClient } from '@/lib/odooClient';
import {
  classifyDateInYear,
  type DateRange,
} from '@/lib/retail/belgianRetailCalendar';
import {
  fetchPosOrdersInDateRange,
  fetchPosLinesForOrderIds,
} from '@/lib/posSalesForRange';

export type AssortmentDimension = 'brand' | 'category';
/** Size-attribute audience filter (Odoo MAAT * product.attribute names). */
export type AudienceFilter =
  | 'all'
  | 'adults'
  | 'kids'
  | 'babies'
  | 'children'
  | 'teens';
export type SellThroughStatus = 'hit' | 'good' | 'slow' | 'dead';

/** Map audience filter → Odoo product.attribute names. */
export function sizeAttributeNamesForAudience(
  audience: Exclude<AudienceFilter, 'all'>
): string[] {
  switch (audience) {
    case 'adults':
      return ['MAAT Volwassenen'];
    case 'kids':
      return ["MAAT Baby's", 'MAAT Kinderen', 'MAAT Tieners'];
    case 'babies':
      return ["MAAT Baby's"];
    case 'children':
      return ['MAAT Kinderen'];
    case 'teens':
      return ['MAAT Tieners'];
    default: {
      const _exhaustive: never = audience;
      throw new Error(`Unknown audience filter: ${_exhaustive}`);
    }
  }
}

export type AssortmentPerformance = {
  dimension: AssortmentDimension;
  name: string;
  matchedName: string;
  period: DateRange;
  audience: AudienceFilter;
  productCount: number;
  openingStock: number;
  stockIn: number;
  available: number;
  unitsSold: number;
  revenue: number;
  sellThroughPct: number;
  status: SellThroughStatus;
  currentStock: number;
  soldDuringSales: number;
  soldOutsideSales: number;
  weeksOfSupply: number | null;
  summary: string;
};

export type BrandRankRow = {
  brandId: number;
  brandName: string;
  unitsSold: number;
  revenue: number;
  sellThroughPct: number | null;
  openingStock: number | null;
  stockIn: number | null;
  currentStock: number;
  productCount: number;
  status: SellThroughStatus | null;
};

function sellThroughStatus(pct: number): SellThroughStatus {
  if (pct >= 80) return 'hit';
  if (pct >= 60) return 'good';
  if (pct >= 40) return 'slow';
  return 'dead';
}

export function computeSellThroughPct(unitsSold: number, openingStock: number, stockIn: number): number {
  const available = openingStock + stockIn;
  if (available <= 0) return 0;
  return (unitsSold / available) * 100;
}

async function getMerkAttributeIds(uid: number, password: string): Promise<number[]> {
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

async function findBrandValue(
  uid: number,
  password: string,
  name: string
): Promise<{ id: number; name: string } | null> {
  const attrIds = await getMerkAttributeIds(uid, password);
  if (!attrIds.length) return null;

  const exact = await odooClient.searchRead<{ id: number; name: string }>(
    uid,
    password,
    'product.attribute.value',
    [['attribute_id', 'in', attrIds], ['name', '=ilike', name]],
    ['id', 'name'],
    5
  );
  if (exact[0]) return exact[0];

  const fuzzy = await odooClient.searchRead<{ id: number; name: string }>(
    uid,
    password,
    'product.attribute.value',
    [['attribute_id', 'in', attrIds], ['name', 'ilike', name]],
    ['id', 'name'],
    20
  );
  return fuzzy[0] ?? null;
}

async function findCategory(
  uid: number,
  password: string,
  name: string
): Promise<{ id: number; name: string; complete_name?: string } | null> {
  // Match leaf name or full path. Do not order by complete_name — it is not stored in SQL.
  const exact = await odooClient.searchRead<{ id: number; name: string; complete_name?: string }>(
    uid,
    password,
    'product.category',
    ['|', ['name', '=ilike', name], ['complete_name', '=ilike', name]],
    ['id', 'name', 'complete_name'],
    5
  );
  if (exact[0]) return exact[0];

  const fuzzy = await odooClient.searchRead<{ id: number; name: string; complete_name?: string }>(
    uid,
    password,
    'product.category',
    ['|', ['name', 'ilike', name], ['complete_name', 'ilike', name]],
    ['id', 'name', 'complete_name'],
    20
  );
  return fuzzy[0] ?? null;
}

/** Collect category id + all descendants via parent_id BFS. */
export async function collectCategoryTreeIds(
  uid: number,
  password: string,
  rootId: number
): Promise<number[]> {
  const all = await odooClient.searchRead<{ id: number; parent_id: [number, string] | false }>(
    uid,
    password,
    'product.category',
    [],
    ['id', 'parent_id'],
    5000
  );
  const children = new Map<number, number[]>();
  for (const cat of all) {
    const parentId = Array.isArray(cat.parent_id) ? cat.parent_id[0] : null;
    if (parentId == null) continue;
    const list = children.get(parentId) || [];
    list.push(cat.id);
    children.set(parentId, list);
  }

  const ids = new Set<number>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const child of children.get(current) || []) {
      if (!ids.has(child)) {
        ids.add(child);
        queue.push(child);
      }
    }
  }
  return [...ids];
}

async function getTemplateIdsWithAttribute(
  uid: number,
  password: string,
  attributeIds: number[],
  valueIds?: number[]
): Promise<Set<number>> {
  if (!attributeIds.length) return new Set();

  const domain: unknown[] = [['attribute_id', 'in', attributeIds]];
  if (valueIds?.length) {
    domain.push(['value_ids', 'in', valueIds]);
  }

  const lines = await odooClient.searchRead<{
    id: number;
    product_tmpl_id: [number, string];
    value_ids?: number[];
  }>(uid, password, 'product.template.attribute.line', domain, [
    'id',
    'product_tmpl_id',
    'value_ids',
  ], 20000);

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

type ProductRow = {
  id: number;
  product_tmpl_id: [number, string];
  qty_available: number;
  categ_id: [number, string] | false;
};

async function resolveProductSet(
  uid: number,
  password: string,
  dimension: AssortmentDimension,
  name: string,
  audience: AudienceFilter
): Promise<{ matchedName: string; productIds: number[]; currentStockById: Map<number, number> }> {
  let templateFilter: Set<number> | null = null;
  let matchedName = name;
  let categoryIds: number[] | null = null;

  if (dimension === 'brand') {
    const brand = await findBrandValue(uid, password, name);
    if (!brand) {
      throw new Error(`Brand not found: ${name}`);
    }
    matchedName = brand.name;
    const merkIds = await getMerkAttributeIds(uid, password);
    templateFilter = await getTemplateIdsWithAttribute(uid, password, merkIds, [brand.id]);
  } else {
    const category = await findCategory(uid, password, name);
    if (!category) {
      throw new Error(`Category not found: ${name}`);
    }
    matchedName = category.complete_name || category.name;
    categoryIds = await collectCategoryTreeIds(uid, password, category.id);
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
    const sizeAttrIds = sizeAttrs.map((a) => a.id);
    const audienceTemplates = await getTemplateIdsWithAttribute(uid, password, sizeAttrIds);
    if (templateFilter) {
      templateFilter = new Set([...templateFilter].filter((id) => audienceTemplates.has(id)));
    } else {
      templateFilter = audienceTemplates;
    }
  }

  const domain: unknown[] = [];
  if (categoryIds) {
    domain.push(['categ_id', 'in', categoryIds]);
  }
  if (templateFilter) {
    domain.push(['product_tmpl_id', 'in', [...templateFilter]]);
  }
  if (!domain.length) {
    return { matchedName, productIds: [], currentStockById: new Map() };
  }

  const products = await odooClient.searchRead<ProductRow>(
    uid,
    password,
    'product.product',
    domain,
    ['id', 'product_tmpl_id', 'qty_available', 'categ_id'],
    20000
  );

  const currentStockById = new Map<number, number>();
  const productIds: number[] = [];
  for (const p of products) {
    productIds.push(p.id);
    currentStockById.set(p.id, p.qty_available || 0);
  }

  return { matchedName, productIds, currentStockById };
}

type StockHistory = {
  openingStock: number;
  stockIn: number;
};

async function computeStockHistory(
  uid: number,
  password: string,
  productIds: number[],
  period: DateRange
): Promise<Map<number, StockHistory>> {
  const result = new Map<number, StockHistory>();
  if (!productIds.length) return result;

  const locations = await odooClient.searchRead<{ id: number }>(
    uid,
    password,
    'stock.location',
    [['usage', '=', 'internal']],
    ['id'],
    200
  );
  const internalIds = new Set(locations.map((l) => l.id));

  const productIdSet = new Set(productIds);
  // Fetch moves up to period end for these products (chunk product ids)
  const chunk = 500;
  for (let i = 0; i < productIds.length; i += chunk) {
    const slice = productIds.slice(i, i + chunk);
    let offset = 0;
    while (true) {
      const moves = await odooClient.searchRead<{
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
          ['product_id', 'in', slice],
          ['date', '<=', `${period.end} 23:59:59`],
          ['state', '=', 'done'],
          '|',
          ['location_id', 'in', [...internalIds]],
          ['location_dest_id', 'in', [...internalIds]],
        ],
        ['product_id', 'product_qty', 'date', 'location_id', 'location_dest_id'],
        5000,
        offset
      );

      for (const move of moves) {
        const productId = move.product_id?.[0];
        if (!productId || !productIdSet.has(productId)) continue;
        const qty = move.product_qty || 0;
        const loc = move.location_id?.[0];
        const dest = move.location_dest_id?.[0];
        const isInternal = internalIds.has(loc);
        const isDestInternal = internalIds.has(dest);
        const moveDay = move.date.slice(0, 10);
        const isBefore = moveDay < period.start;
        const isIn =
          moveDay >= period.start && move.date <= `${period.end} 23:59:59`;

        let hist = result.get(productId);
        if (!hist) {
          hist = { openingStock: 0, stockIn: 0 };
          result.set(productId, hist);
        }

        if (isBefore) {
          if (!isInternal && isDestInternal) hist.openingStock += qty;
          else if (isInternal && !isDestInternal) hist.openingStock -= qty;
        } else if (isIn) {
          if (!isInternal && isDestInternal) hist.stockIn += qty;
        }
      }

      if (moves.length < 5000) break;
      offset += 5000;
    }
  }

  return result;
}

type PosAgg = {
  unitsSold: number;
  revenue: number;
  soldDuringSales: number;
  soldOutsideSales: number;
};

async function aggregatePosForProducts(
  uid: number,
  password: string,
  productIds: number[],
  period: DateRange,
  yearForSalesSplit: number
): Promise<PosAgg> {
  const empty: PosAgg = {
    unitsSold: 0,
    revenue: 0,
    soldDuringSales: 0,
    soldOutsideSales: 0,
  };
  if (!productIds.length) return empty;

  const productSet = new Set(productIds);
  const orders = await fetchPosOrdersInDateRange<{
    id: number;
    date_order: string;
  }>(uid, password, period.start, period.end, ['id', 'date_order']);

  if (!orders.length) return empty;

  const orderIdToDate = new Map(orders.map((o) => [o.id, o.date_order]));
  const lines = await fetchPosLinesForOrderIds<{
    product_id: [number, string];
    qty: number;
    price_subtotal_incl: number;
    order_id: [number, string];
  }>(uid, password, orders.map((o) => o.id), [
    'product_id',
    'qty',
    'price_subtotal_incl',
    'order_id',
  ]);

  const agg = { ...empty };
  for (const line of lines) {
    const productId = line.product_id?.[0];
    if (!productId || !productSet.has(productId)) continue;
    const qty = line.qty || 0;
    if (qty === 0) continue;
    const revenue = line.price_subtotal_incl || 0;
    agg.unitsSold += qty;
    agg.revenue += revenue;

    const orderId = line.order_id?.[0];
    const dateStr = orderId ? orderIdToDate.get(orderId) : undefined;
    if (dateStr) {
      const bucket = classifyDateInYear(dateStr, yearForSalesSplit);
      if (bucket === 'winterSales' || bucket === 'summerSales') {
        agg.soldDuringSales += qty;
      } else {
        agg.soldOutsideSales += qty;
      }
    }
  }
  return agg;
}

export async function analyzeAssortment(input: {
  uid: number;
  password: string;
  dimension: AssortmentDimension;
  name: string;
  period: DateRange;
  audience?: AudienceFilter;
  yearForSalesSplit?: number;
}): Promise<AssortmentPerformance> {
  const audience = input.audience ?? 'all';
  const year =
    input.yearForSalesSplit ?? Number(input.period.start.slice(0, 4));

  const { matchedName, productIds, currentStockById } = await resolveProductSet(
    input.uid,
    input.password,
    input.dimension,
    input.name,
    audience
  );

  const [stockHistory, pos] = await Promise.all([
    computeStockHistory(input.uid, input.password, productIds, input.period),
    aggregatePosForProducts(
      input.uid,
      input.password,
      productIds,
      input.period,
      year
    ),
  ]);

  let openingStock = 0;
  let stockIn = 0;
  let currentStock = 0;
  for (const id of productIds) {
    const hist = stockHistory.get(id);
    if (hist) {
      openingStock += hist.openingStock;
      stockIn += hist.stockIn;
    }
    currentStock += currentStockById.get(id) || 0;
  }

  const available = openingStock + stockIn;
  const sellThroughPct = computeSellThroughPct(pos.unitsSold, openingStock, stockIn);
  const status = sellThroughStatus(sellThroughPct);

  const days =
    (new Date(input.period.end).getTime() - new Date(input.period.start).getTime()) /
      (1000 * 60 * 60 * 24) +
    1;
  const weeks = days / 7;
  const weeklyRate = weeks > 0 ? pos.unitsSold / weeks : 0;
  const weeksOfSupply =
    weeklyRate > 0 ? Math.round((currentStock / weeklyRate) * 10) / 10 : null;

  const summary = [
    `${matchedName}: sell-through ${sellThroughPct.toFixed(1)}% (${status})`,
    `${pos.unitsSold.toFixed(0)} stuks verkocht / ${available.toFixed(0)} beschikbaar`,
    `(start ${openingStock.toFixed(0)} + in ${stockIn.toFixed(0)})`,
    `omzet €${pos.revenue.toFixed(2)}`,
    `periode ${input.period.start} → ${input.period.end}`,
  ].join(' · ');

  return {
    dimension: input.dimension,
    name: input.name,
    matchedName,
    period: input.period,
    audience,
    productCount: productIds.length,
    openingStock,
    stockIn,
    available,
    unitsSold: pos.unitsSold,
    revenue: pos.revenue,
    sellThroughPct,
    status,
    currentStock,
    soldDuringSales: pos.soldDuringSales,
    soldOutsideSales: pos.soldOutsideSales,
    weeksOfSupply,
    summary,
  };
}

async function buildBrandTemplateMap(
  uid: number,
  password: string
): Promise<{
  brandNames: Map<number, string>;
  templateToBrand: Map<number, number>;
}> {
  const attrIds = await getMerkAttributeIds(uid, password);
  const brandValues = await odooClient.searchRead<{ id: number; name: string }>(
    uid,
    password,
    'product.attribute.value',
    [['attribute_id', 'in', attrIds]],
    ['id', 'name'],
    500
  );
  const brandNames = new Map(brandValues.map((b) => [b.id, b.name]));

  const lines = await odooClient.searchRead<{
    product_tmpl_id: [number, string];
    value_ids?: number[];
  }>(
    uid,
    password,
    'product.template.attribute.line',
    [['attribute_id', 'in', attrIds]],
    ['product_tmpl_id', 'value_ids'],
    20000
  );

  const templateToBrand = new Map<number, number>();
  for (const line of lines) {
    const tmplId = line.product_tmpl_id?.[0];
    const brandId = line.value_ids?.[0];
    if (tmplId && brandId) templateToBrand.set(tmplId, brandId);
  }

  return { brandNames, templateToBrand };
}

export async function rankBrands(input: {
  uid: number;
  password: string;
  period: DateRange;
  sortBy?: 'revenue' | 'unitsSold' | 'sellThroughPct';
  limit?: number;
  audience?: AudienceFilter;
  yearForSalesSplit?: number;
  includeSellThrough?: boolean;
}): Promise<{ period: DateRange; audience: AudienceFilter; brands: BrandRankRow[]; summary: string }> {
  const sortBy = input.sortBy ?? 'revenue';
  const limit = input.limit ?? 10;
  const audience = input.audience ?? 'all';

  const { brandNames, templateToBrand } = await buildBrandTemplateMap(
    input.uid,
    input.password
  );

  let audienceTemplates: Set<number> | null = null;
  if (audience !== 'all') {
    const sizeNames = sizeAttributeNamesForAudience(audience);
    const sizeAttrs = await odooClient.searchRead<{ id: number }>(
      input.uid,
      input.password,
      'product.attribute',
      [['name', 'in', sizeNames]],
      ['id'],
      10
    );
    audienceTemplates = await getTemplateIdsWithAttribute(
      input.uid,
      input.password,
      sizeAttrs.map((a) => a.id)
    );
  }

  const variants = await odooClient.searchRead<{
    id: number;
    product_tmpl_id: [number, string];
    qty_available: number;
  }>(
    input.uid,
    input.password,
    'product.product',
    [],
    ['id', 'product_tmpl_id', 'qty_available'],
    20000
  );

  const variantToBrand = new Map<number, number>();
  const brandCurrentStock = new Map<number, number>();
  const brandProducts = new Map<number, Set<number>>();

  for (const v of variants) {
    const tmplId = v.product_tmpl_id?.[0];
    if (!tmplId) continue;
    if (audienceTemplates && !audienceTemplates.has(tmplId)) continue;
    const brandId = templateToBrand.get(tmplId);
    if (!brandId) continue;
    variantToBrand.set(v.id, brandId);
    brandCurrentStock.set(brandId, (brandCurrentStock.get(brandId) || 0) + (v.qty_available || 0));
    if (!brandProducts.has(brandId)) brandProducts.set(brandId, new Set());
    brandProducts.get(brandId)!.add(v.id);
  }

  const orders = await fetchPosOrdersInDateRange<{ id: number; date_order: string }>(
    input.uid,
    input.password,
    input.period.start,
    input.period.end,
    ['id', 'date_order']
  );
  const lines = await fetchPosLinesForOrderIds<{
    product_id: [number, string];
    qty: number;
    price_subtotal_incl: number;
  }>(input.uid, input.password, orders.map((o) => o.id), [
    'product_id',
    'qty',
    'price_subtotal_incl',
  ]);

  const brandUnits = new Map<number, number>();
  const brandRevenue = new Map<number, number>();
  for (const line of lines) {
    const productId = line.product_id?.[0];
    if (!productId) continue;
    const brandId = variantToBrand.get(productId);
    if (!brandId) continue;
    brandUnits.set(brandId, (brandUnits.get(brandId) || 0) + (line.qty || 0));
    brandRevenue.set(
      brandId,
      (brandRevenue.get(brandId) || 0) + (line.price_subtotal_incl || 0)
    );
  }

  const brandIds = new Set<number>([
    ...brandUnits.keys(),
    ...brandRevenue.keys(),
  ]);

  const sellThroughByBrand = new Map<number, { pct: number; opening: number; stockIn: number }>();
  const needSellThrough = sortBy === 'sellThroughPct' || input.includeSellThrough;
  if (needSellThrough && brandIds.size) {
    const allProductIds = [...brandIds].flatMap((id) => [...(brandProducts.get(id) || [])]);
    const history = await computeStockHistory(
      input.uid,
      input.password,
      allProductIds,
      input.period
    );
    for (const brandId of brandIds) {
      let opening = 0;
      let stockIn = 0;
      for (const pid of brandProducts.get(brandId) || []) {
        const h = history.get(pid);
        if (h) {
          opening += h.openingStock;
          stockIn += h.stockIn;
        }
      }
      const units = brandUnits.get(brandId) || 0;
      sellThroughByBrand.set(brandId, {
        pct: computeSellThroughPct(units, opening, stockIn),
        opening,
        stockIn,
      });
    }
  }

  let rows: BrandRankRow[] = [...brandIds].map((brandId) => {
    const st = sellThroughByBrand.get(brandId);
    const unitsSold = brandUnits.get(brandId) || 0;
    const revenue = brandRevenue.get(brandId) || 0;
    const sellThroughPct = st?.pct ?? null;
    return {
      brandId,
      brandName: brandNames.get(brandId) || `Brand ${brandId}`,
      unitsSold,
      revenue,
      sellThroughPct,
      openingStock: st?.opening ?? null,
      stockIn: st?.stockIn ?? null,
      currentStock: brandCurrentStock.get(brandId) || 0,
      productCount: brandProducts.get(brandId)?.size || 0,
      status: sellThroughPct == null ? null : sellThroughStatus(sellThroughPct),
    };
  });

  rows.sort((a, b) => {
    switch (sortBy) {
      case 'unitsSold':
        return b.unitsSold - a.unitsSold;
      case 'sellThroughPct':
        return (b.sellThroughPct ?? -1) - (a.sellThroughPct ?? -1);
      case 'revenue':
      default:
        return b.revenue - a.revenue;
    }
  });

  rows = rows.slice(0, limit);
  const top = rows[0];
  const summary = top
    ? `Top op ${sortBy}: ${top.brandName}` +
      (sortBy === 'sellThroughPct'
        ? ` (${(top.sellThroughPct ?? 0).toFixed(1)}%)`
        : sortBy === 'unitsSold'
          ? ` (${top.unitsSold.toFixed(0)} stuks)`
          : ` (€${top.revenue.toFixed(2)})`) +
      ` · ${input.period.start} → ${input.period.end}` +
      (audience !== 'all' ? ` · audience=${audience}` : '')
    : `Geen merken met verkoop in ${input.period.start} → ${input.period.end}`;

  return { period: input.period, audience, brands: rows, summary };
}

export async function searchCategories(
  uid: number,
  password: string,
  query: string,
  limit = 20
): Promise<Array<{ id: number; name: string; completeName: string | null; parentId: number | null }>> {
  const trimmed = query.trim();
  // complete_name is a non-stored related field — never use it in `order` (Odoo SQL error).
  // Search both leaf name and path so "Zomer" also finds nested solden children.
  const domain = trimmed
    ? (['|', ['name', 'ilike', trimmed], ['complete_name', 'ilike', trimmed]] as unknown[])
    : [];

  const rows = await odooClient.searchRead<{
    id: number;
    name: string;
    complete_name?: string;
    parent_id: [number, string] | false;
  }>(
    uid,
    password,
    'product.category',
    domain,
    ['id', 'name', 'complete_name', 'parent_id'],
    Math.max(limit * 3, limit),
    0,
    'name asc'
  );

  const mapped = rows.map((r) => ({
    id: r.id,
    name: r.name,
    completeName: r.complete_name || null,
    parentId: Array.isArray(r.parent_id) ? r.parent_id[0] : null,
  }));

  mapped.sort((a, b) =>
    (a.completeName || a.name).localeCompare(b.completeName || b.name, 'nl')
  );

  return mapped.slice(0, limit);
}
