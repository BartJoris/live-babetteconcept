import { odooClient } from '@/lib/odooClient';
import {
  fetchPosLinesForOrderIds,
  fetchPosOrdersInDateRange,
} from '@/lib/posSalesForRange';
import {
  formatYmd,
  getAfterSummerSalesRange,
  getAfterWinterSalesRange,
  getBeforeSummerSalesRange,
  getSummerSoldenRange,
  getWinterSoldenRange,
  getWinterSoldenStart,
  type DateRange,
} from '@/lib/retail/belgianRetailCalendar';
import {
  buildBrandTemplateMap,
  collectCategoryTreeIds,
  computeSellThroughPct,
  findCategory,
  getTemplateIdsWithAttribute,
  sizeAttributeNamesForAudience,
} from '@/lib/retail/sellThrough';

export const STOCK_SALE_FRACTION = 0.20;
export const STOCK_SALE_NOTE_RE = /stock\s*verkoop/i;

const PRODUCT_ID_CHUNK = 500;
const MOVE_PAGE_SIZE = 5000;
const SALE_PAGE_SIZE = 5000;
const ORDER_ID_CHUNK = 2000;

export type SeasonKind = 'summer' | 'winter';
export type SeasonAudienceKey = 'all' | 'kids' | 'adults' | 'other';

export type PhaseTotals = { units: number; revenue: number; cost: number; profit: number };

export type AudienceSlice = {
  productCount: number;
  available: number;
  openingStock: number;
  stockIn: number;
  stockAtSoldenStart: number;
  currentStock: number;
  currentRetailValue: number;
  currentCostValue: number;
  regular: PhaseTotals;
  solden: PhaseTotals;
  afterRetail: PhaseTotals;
  retailSold: PhaseTotals;
  stockSale: PhaseTotals;
  totalSold: PhaseTotals;
  sellThroughRetailPct: number;
  sellThroughInclStockSalePct: number;
  avgSoldenDiscountPct: number | null;
  profitMarginPct: number;
};

export type BrandSeasonRow = {
  brandId: number | null;
  brandName: string;
  available: number;
  regularUnits: number;
  soldenUnits: number;
  afterUnits: number;
  stockSaleUnits: number;
  currentStock: number;
  sellThroughRetailPct: number;
  revenue: number;
  cost: number;
  profit: number;
  profitMarginPct: number;
};

export type StockSaleOrder = {
  orderId: number;
  orderName: string;
  date: string;
  partner: string | null;
  state: string;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  avgPctOfList: number | null;
  matchedBy: 'note' | 'price' | 'quotationName';
};

export type SeasonInsights = {
  category: string;
  matchedCategory: string;
  year: number;
  kind: SeasonKind;
  periods: { regular: DateRange; solden: DateRange; after: DateRange };
  byAudience: Record<SeasonAudienceKey, AudienceSlice>;
  brands: BrandSeasonRow[];
  stockSales: StockSaleOrder[];
  leftoverWarning: string | null;
  summary: string;
};

type ProductRow = {
  id: number;
  product_tmpl_id: [number, string] | false;
  qty_available: number;
  list_price: number;
  standard_price: number;
};

type ProductStock = {
  openingStock: number;
  stockIn: number;
  stockAtSoldenStart: number;
};

type SaleOrderRow = {
  id: number;
  name: string;
  date_order: string;
  state: string;
  partner_id?: [number, string] | false;
  note?: string | false;
};

type SaleLineRow = {
  product_id: [number, string] | false;
  product_uom_qty: number;
  price_unit: number;
  price_subtotal?: number;
  discount?: number;
  order_id: [number, string];
};

type PhaseBucket = 'regular' | 'solden' | 'afterRetail';

type AudienceSets = {
  adults: Set<number>;
  kids: Set<number>;
};

type BrandAcc = {
  brandId: number | null;
  brandName: string;
  openingStock: number;
  stockIn: number;
  regularUnits: number;
  soldenUnits: number;
  afterUnits: number;
  stockSaleUnits: number;
  currentStock: number;
  revenue: number;
  cost: number;
};

const AUDIENCE_KEYS: SeasonAudienceKey[] = ['all', 'kids', 'adults', 'other'];

function addDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return formatYmd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

function minYmd(a: string, b: string): string {
  return a <= b ? a : b;
}

function todayYmd(now: Date): string {
  return formatYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function dayFromDateTime(value: string): string {
  return value.slice(0, 10);
}

export function emptyPhase(): PhaseTotals {
  return { units: 0, revenue: 0, cost: 0, profit: 0 };
}

export function addPhase(a: PhaseTotals, b: PhaseTotals): PhaseTotals {
  return {
    units: a.units + b.units,
    revenue: a.revenue + b.revenue,
    cost: a.cost + b.cost,
    profit: a.profit + b.profit,
  };
}

export function profitMarginPct(profit: number, revenue: number): number {
  if (!(revenue > 0)) return 0;
  return (profit / revenue) * 100;
}

function addLineToPhase(
  phase: PhaseTotals,
  units: number,
  revenue: number,
  cost: number
): void {
  phase.units += units;
  phase.revenue += revenue;
  phase.cost += cost;
  phase.profit += revenue - cost;
}

export function inferSeasonFromCategoryName(
  name: string
): { kind: SeasonKind; year: number } | null {
  const raw = name.trim();
  if (!raw) return null;

  const code = raw.match(/\b(AW|FW|SS)[\s\-']?(?:20)?(\d{2})\b/i);
  if (code) {
    const tag = code[1]!.toUpperCase();
    const year = 2000 + Number(code[2]);
    const kind: SeasonKind = tag === 'SS' ? 'summer' : 'winter';
    return { kind, year };
  }

  const yearMatch = raw.match(/\b(20\d{2})\b/);
  if (!yearMatch) return null;
  const year = Number(yearMatch[1]);

  if (/herfst|winter|najaar|autumn|\bfall\b/i.test(raw)) {
    return { kind: 'winter', year };
  }
  if (/zomer|summer|lente|voorjaar|spring/i.test(raw)) {
    return { kind: 'summer', year };
  }
  return null;
}

export function collectionPeriods(
  kind: SeasonKind,
  year: number,
  today: string
): { regular: DateRange; solden: DateRange; after: DateRange } {
  switch (kind) {
    case 'summer': {
      const regular = getBeforeSummerSalesRange(year);
      const solden = getSummerSoldenRange(year);
      const afterFull = getAfterSummerSalesRange(year);
      return {
        regular,
        solden,
        after: { start: afterFull.start, end: minYmd(afterFull.end, today) },
      };
    }
    case 'winter': {
      const soldenStart = getWinterSoldenStart(year);
      const solden = getWinterSoldenRange(year);
      const afterFull = getAfterWinterSalesRange(year);
      return {
        regular: {
          start: formatYmd(year - 1, 8, 1),
          end: addDaysYmd(soldenStart, -1),
        },
        solden,
        after: { start: afterFull.start, end: minYmd(afterFull.end, today) },
      };
    }
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unknown season kind: ${_exhaustive}`);
    }
  }
}

export function isStockSalePrice(priceUnit: number, listPrice: number): boolean {
  if (!(listPrice > 0)) return false;
  const fraction = priceUnit / listPrice;
  return Math.abs(fraction - STOCK_SALE_FRACTION) <= 0.03;
}

export function leftoverKidsWarning(kidsCurrentStock: number): string | null {
  if (kidsCurrentStock <= 0) return null;
  const units = Number.isInteger(kidsCurrentStock)
    ? String(kidsCurrentStock)
    : kidsCurrentStock.toFixed(0);
  return `Kids-collectie heeft nog ${units} stuks op voorraad — waarschijnlijk niet afgeboekt.`;
}

function brandKey(name: string): string {
  return name.trim().toLowerCase();
}

function brandCollectionUnits(row: BrandSeasonRow): number {
  return (
    row.available +
    row.regularUnits +
    row.soldenUnits +
    row.afterUnits +
    row.stockSaleUnits +
    Math.abs(row.currentStock)
  );
}

export function brandHasCollectionUnits(row: BrandSeasonRow): boolean {
  return brandCollectionUnits(row) !== 0 || row.revenue !== 0;
}

function isNamedBrand(row: BrandSeasonRow): boolean {
  return row.brandId != null && brandKey(row.brandName) !== 'onbekend';
}

export function consolidateBrandSeasonRows(rows: BrandSeasonRow[]): BrandSeasonRow[] {
  const merged = new Map<string, BrandSeasonRow>();
  for (const row of rows) {
    const key = brandKey(row.brandName);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...row });
      continue;
    }
    const incomingVolume = brandCollectionUnits(row);
    const currentVolume = brandCollectionUnits(current);
    current.available += row.available;
    current.regularUnits += row.regularUnits;
    current.soldenUnits += row.soldenUnits;
    current.afterUnits += row.afterUnits;
    current.stockSaleUnits += row.stockSaleUnits;
    current.currentStock += row.currentStock;
    current.revenue += row.revenue;
    current.cost += row.cost;
    current.profit = current.revenue - current.cost;
    current.profitMarginPct = profitMarginPct(current.profit, current.revenue);
    current.sellThroughRetailPct = computeSellThroughPct(
      current.regularUnits + current.soldenUnits + current.afterUnits,
      current.available,
      0
    );
    if (current.brandId == null && row.brandId != null) {
      current.brandId = row.brandId;
    }
    if (incomingVolume > currentVolume) {
      current.brandName = row.brandName;
    }
  }

  return [...merged.values()]
    .filter((row) => isNamedBrand(row) && brandHasCollectionUnits(row))
    .sort((a, b) => {
      const aSold =
        a.regularUnits + a.soldenUnits + a.afterUnits + a.stockSaleUnits;
      const bSold =
        b.regularUnits + b.soldenUnits + b.afterUnits + b.stockSaleUnits;
      if (bSold !== aSold) return bSold - aSold;
      return a.brandName.localeCompare(b.brandName, 'nl');
    });
}

function emptySlice(): AudienceSlice {
  return {
    productCount: 0,
    available: 0,
    openingStock: 0,
    stockIn: 0,
    stockAtSoldenStart: 0,
    currentStock: 0,
    currentRetailValue: 0,
    currentCostValue: 0,
    regular: emptyPhase(),
    solden: emptyPhase(),
    afterRetail: emptyPhase(),
    retailSold: emptyPhase(),
    stockSale: emptyPhase(),
    totalSold: emptyPhase(),
    sellThroughRetailPct: 0,
    sellThroughInclStockSalePct: 0,
    avgSoldenDiscountPct: null,
    profitMarginPct: 0,
  };
}

function emptyByAudience(): Record<SeasonAudienceKey, AudienceSlice> {
  return {
    all: emptySlice(),
    kids: emptySlice(),
    adults: emptySlice(),
    other: emptySlice(),
  };
}

function phaseBucket(
  day: string,
  periods: { regular: DateRange; solden: DateRange; after: DateRange }
): PhaseBucket | null {
  if (day >= periods.regular.start && day <= periods.regular.end) return 'regular';
  if (day >= periods.solden.start && day <= periods.solden.end) return 'solden';
  if (day >= periods.after.start && day <= periods.after.end) return 'afterRetail';
  return null;
}

function audienceForTemplate(
  tmplId: number | null,
  sets: AudienceSets
): Exclude<SeasonAudienceKey, 'all'> {
  if (tmplId != null && sets.adults.has(tmplId)) return 'adults';
  if (tmplId != null && sets.kids.has(tmplId)) return 'kids';
  return 'other';
}

function webshopLineRevenue(line: SaleLineRow): number {
  if (line.price_subtotal != null) return line.price_subtotal;
  const qty = line.product_uom_qty || 0;
  const price = line.price_unit || 0;
  const discount = line.discount || 0;
  return qty * price * (1 - discount / 100);
}

function namesEqualIlike(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function partnerName(partnerId: [number, string] | false | undefined): string | null {
  return Array.isArray(partnerId) ? partnerId[1] : null;
}

async function searchReadPaged<T>(
  uid: number,
  password: string,
  model: string,
  domain: unknown[],
  fields: string[],
  pageSize = SALE_PAGE_SIZE
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const batch = await odooClient.searchRead<T>(
      uid,
      password,
      model,
      domain,
      fields,
      pageSize,
      offset
    );
    all.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function fetchSaleLinesForOrderIds(
  uid: number,
  password: string,
  orderIds: number[]
): Promise<SaleLineRow[]> {
  if (!orderIds.length) return [];
  const all: SaleLineRow[] = [];
  for (let i = 0; i < orderIds.length; i += ORDER_ID_CHUNK) {
    const chunk = orderIds.slice(i, i + ORDER_ID_CHUNK);
    let offset = 0;
    while (true) {
      const batch = await odooClient.searchRead<SaleLineRow>(
        uid,
        password,
        'sale.order.line',
        [['order_id', 'in', chunk]],
        [
          'product_id',
          'product_uom_qty',
          'price_unit',
          'price_subtotal',
          'discount',
          'order_id',
        ],
        SALE_PAGE_SIZE,
        offset
      );
      all.push(...batch);
      if (batch.length < SALE_PAGE_SIZE) break;
      offset += SALE_PAGE_SIZE;
    }
  }
  return all;
}

async function fetchAudienceSets(
  uid: number,
  password: string
): Promise<AudienceSets> {
  const [adultAttrs, kidsAttrs] = await Promise.all([
    odooClient.searchRead<{ id: number }>(
      uid,
      password,
      'product.attribute',
      [['name', 'in', sizeAttributeNamesForAudience('adults')]],
      ['id'],
      10
    ),
    odooClient.searchRead<{ id: number }>(
      uid,
      password,
      'product.attribute',
      [['name', 'in', sizeAttributeNamesForAudience('kids')]],
      ['id'],
      10
    ),
  ]);
  const [adults, kids] = await Promise.all([
    getTemplateIdsWithAttribute(
      uid,
      password,
      adultAttrs.map((a) => a.id)
    ),
    getTemplateIdsWithAttribute(
      uid,
      password,
      kidsAttrs.map((a) => a.id)
    ),
  ]);
  return { adults, kids };
}

async function reconstructStock(
  uid: number,
  password: string,
  productIds: number[],
  regularStart: string,
  soldenStart: string,
  soldenEnd: string
): Promise<Map<number, ProductStock>> {
  const result = new Map<number, ProductStock>();
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
  const soldenEndDt = `${soldenEnd} 23:59:59`;

  for (let i = 0; i < productIds.length; i += PRODUCT_ID_CHUNK) {
    const slice = productIds.slice(i, i + PRODUCT_ID_CHUNK);
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
          ['date', '<=', soldenEndDt],
          ['state', '=', 'done'],
          '|',
          ['location_id', 'in', [...internalIds]],
          ['location_dest_id', 'in', [...internalIds]],
        ],
        ['product_id', 'product_qty', 'date', 'location_id', 'location_dest_id'],
        MOVE_PAGE_SIZE,
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
        const moveDay = dayFromDateTime(move.date);

        let hist = result.get(productId);
        if (!hist) {
          hist = { openingStock: 0, stockIn: 0, stockAtSoldenStart: 0 };
          result.set(productId, hist);
        }

        if (!isInternal && isDestInternal) {
          if (moveDay < regularStart) hist.openingStock += qty;
          if (moveDay < soldenStart) hist.stockAtSoldenStart += qty;
          if (moveDay >= regularStart && move.date <= soldenEndDt) {
            hist.stockIn += qty;
          }
        } else if (isInternal && !isDestInternal) {
          if (moveDay < regularStart) hist.openingStock -= qty;
          if (moveDay < soldenStart) hist.stockAtSoldenStart -= qty;
        }
      }

      if (moves.length < MOVE_PAGE_SIZE) break;
      offset += MOVE_PAGE_SIZE;
    }
  }

  return result;
}

function ensureBrand(
  brands: Map<string, BrandAcc>,
  brandId: number | null,
  brandName: string
): BrandAcc {
  const key = brandId == null ? 'unknown' : String(brandId);
  let row = brands.get(key);
  if (!row) {
    row = {
      brandId,
      brandName,
      openingStock: 0,
      stockIn: 0,
      regularUnits: 0,
      soldenUnits: 0,
      afterUnits: 0,
      stockSaleUnits: 0,
      currentStock: 0,
      revenue: 0,
      cost: 0,
    };
    brands.set(key, row);
  }
  return row;
}

function addRetailToBrand(
  brand: BrandAcc,
  bucket: PhaseBucket,
  units: number,
  revenue: number,
  cost: number
): void {
  brand.revenue += revenue;
  brand.cost += cost;
  switch (bucket) {
    case 'regular':
      brand.regularUnits += units;
      break;
    case 'solden':
      brand.soldenUnits += units;
      break;
    case 'afterRetail':
      brand.afterUnits += units;
      break;
    default: {
      const _exhaustive: never = bucket;
      throw new Error(`Unknown phase bucket: ${_exhaustive}`);
    }
  }
}

function addRetailToSlice(
  slice: AudienceSlice,
  bucket: PhaseBucket,
  units: number,
  revenue: number,
  cost: number,
  listValue: number,
  soldenListValue: Record<SeasonAudienceKey, number>,
  audience: SeasonAudienceKey
): void {
  switch (bucket) {
    case 'regular':
      addLineToPhase(slice.regular, units, revenue, cost);
      break;
    case 'solden':
      addLineToPhase(slice.solden, units, revenue, cost);
      soldenListValue[audience] += listValue;
      break;
    case 'afterRetail':
      addLineToPhase(slice.afterRetail, units, revenue, cost);
      break;
    default: {
      const _exhaustive: never = bucket;
      throw new Error(`Unknown phase bucket: ${_exhaustive}`);
    }
  }
}

function formatSeasonSummary(
  matchedCategory: string,
  slice: AudienceSlice,
  periods: { regular: DateRange; solden: DateRange; after: DateRange }
): string {
  return [
    `${matchedCategory}: sell-through ${slice.sellThroughRetailPct.toFixed(1)}%`,
    `${slice.retailSold.units.toFixed(0)} stuks verkocht / ${slice.available.toFixed(0)} beschikbaar`,
    `regular ${periods.regular.start}→${periods.regular.end}`,
    `solden ${periods.solden.start}→${periods.solden.end}`,
    `na ${periods.after.start}→${periods.after.end}`,
    `winst €${slice.totalSold.profit.toFixed(0)} (${slice.profitMarginPct.toFixed(1)}%)`,
  ].join(' · ');
}

function finalizeSlice(
  slice: AudienceSlice,
  soldenListValue: number
): AudienceSlice {
  slice.available = slice.openingStock + slice.stockIn;
  slice.retailSold = addPhase(addPhase(slice.regular, slice.solden), slice.afterRetail);
  slice.sellThroughRetailPct = computeSellThroughPct(
    slice.retailSold.units,
    slice.openingStock,
    slice.stockIn
  );
  slice.sellThroughInclStockSalePct = computeSellThroughPct(
    slice.retailSold.units + slice.stockSale.units,
    slice.openingStock,
    slice.stockIn
  );
  slice.avgSoldenDiscountPct =
    soldenListValue > 0 && slice.solden.units !== 0
      ? (1 - slice.solden.revenue / soldenListValue) * 100
      : null;
  slice.totalSold = addPhase(slice.retailSold, slice.stockSale);
  slice.profitMarginPct = profitMarginPct(slice.totalSold.profit, slice.totalSold.revenue);
  return slice;
}

export async function analyzeSeasonInsights(input: {
  uid: number;
  password: string;
  category: string;
  year?: number;
  quotationName?: string;
  now?: Date;
}): Promise<SeasonInsights> {
  const now = input.now ?? new Date();
  const today = todayYmd(now);
  const quotationName = input.quotationName?.trim() || undefined;

  const category = await findCategory(input.uid, input.password, input.category);
  if (!category) {
    throw new Error(`Category not found: ${input.category}`);
  }

  const matchedCategory = category.complete_name || category.name;
  const inferred =
    inferSeasonFromCategoryName(matchedCategory) ??
    inferSeasonFromCategoryName(input.category) ??
    inferSeasonFromCategoryName(category.name);
  if (!inferred) {
    throw new Error(`Cannot infer season from category: ${matchedCategory}`);
  }
  const kind = inferred.kind;
  const year = input.year ?? inferred.year;
  const periods = collectionPeriods(kind, year, today);

  const categoryIds = await collectCategoryTreeIds(
    input.uid,
    input.password,
    category.id
  );

  const products = await odooClient.searchRead<ProductRow>(
    input.uid,
    input.password,
    'product.product',
    [['categ_id', 'in', categoryIds]],
    ['id', 'product_tmpl_id', 'qty_available', 'list_price', 'standard_price'],
    20000
  );

  if (!products.length) {
    const byAudience = emptyByAudience();
    for (const key of AUDIENCE_KEYS) {
      finalizeSlice(byAudience[key], 0);
    }
    return {
      category: input.category,
      matchedCategory,
      year,
      kind,
      periods,
      byAudience,
      brands: [],
      stockSales: [],
      leftoverWarning: leftoverKidsWarning(0),
      summary: formatSeasonSummary(matchedCategory, byAudience.all, periods),
    };
  }

  const productIds = products.map((p) => p.id);
  const productIdSet = new Set(productIds);
  const listPriceById = new Map<number, number>();
  const costById = new Map<number, number>();
  for (const p of products) {
    listPriceById.set(p.id, p.list_price || 0);
    costById.set(p.id, p.standard_price || 0);
  }

  const soldenStartDt = `${periods.solden.start} 00:00:00`;
  const rangeStartDt = `${periods.regular.start} 00:00:00`;
  const rangeEndDt = `${periods.after.end} 23:59:59`;

  const b2bDomain: unknown[] = [
    ['website_id', '=', false],
    ['state', 'in', ['draft', 'sent', 'sale', 'done']],
  ];
  if (quotationName) {
    b2bDomain.push(
      '|',
      ['name', '=ilike', quotationName],
      '&',
      ['date_order', '>=', soldenStartDt],
      ['date_order', '<=', `${today} 23:59:59`]
    );
  } else {
    b2bDomain.push(
      ['date_order', '>=', soldenStartDt],
      ['date_order', '<=', `${today} 23:59:59`]
    );
  }

  const [stockByProduct, audienceSets, brandMap, posOrders, webshopOrders, b2bOrders] =
    await Promise.all([
      reconstructStock(
        input.uid,
        input.password,
        productIds,
        periods.regular.start,
        periods.solden.start,
        periods.solden.end
      ),
      fetchAudienceSets(input.uid, input.password),
      buildBrandTemplateMap(input.uid, input.password),
      fetchPosOrdersInDateRange<{ id: number; date_order: string }>(
        input.uid,
        input.password,
        periods.regular.start,
        periods.after.end,
        ['id', 'date_order']
      ),
      searchReadPaged<SaleOrderRow>(
        input.uid,
        input.password,
        'sale.order',
        [
          ['website_id', '!=', false],
          ['state', 'in', ['sale', 'done']],
          ['date_order', '>=', rangeStartDt],
          ['date_order', '<=', rangeEndDt],
        ],
        ['id', 'name', 'date_order', 'state']
      ),
      searchReadPaged<SaleOrderRow>(
        input.uid,
        input.password,
        'sale.order',
        b2bDomain,
        ['id', 'name', 'date_order', 'state', 'partner_id', 'note']
      ),
    ]);

  const [posLines, webshopLines, b2bLines] = await Promise.all([
    fetchPosLinesForOrderIds<{
      product_id: [number, string];
      qty: number;
      price_subtotal_incl: number;
      order_id: [number, string];
    }>(
      input.uid,
      input.password,
      posOrders.map((o) => o.id),
      ['product_id', 'qty', 'price_subtotal_incl', 'order_id']
    ),
    fetchSaleLinesForOrderIds(
      input.uid,
      input.password,
      webshopOrders.map((o) => o.id)
    ),
    fetchSaleLinesForOrderIds(
      input.uid,
      input.password,
      b2bOrders.map((o) => o.id)
    ),
  ]);

  const byAudience = emptyByAudience();
  const soldenListValue: Record<SeasonAudienceKey, number> = {
    all: 0,
    kids: 0,
    adults: 0,
    other: 0,
  };
  const brands = new Map<string, BrandAcc>();
  const audienceByProduct = new Map<number, Exclude<SeasonAudienceKey, 'all'>>();
  const brandAccByProduct = new Map<number, BrandAcc>();

  for (const product of products) {
    const tmplId = Array.isArray(product.product_tmpl_id)
      ? product.product_tmpl_id[0]
      : null;
    const audience = audienceForTemplate(tmplId, audienceSets);
    audienceByProduct.set(product.id, audience);
    const hist = stockByProduct.get(product.id);
    const opening = hist?.openingStock || 0;
    const stockIn = hist?.stockIn || 0;
    const stockAtSoldenStart = hist?.stockAtSoldenStart || 0;
    const qty = product.qty_available || 0;
    const list = product.list_price || 0;
    const cost = product.standard_price || 0;

    const brandId = tmplId != null ? brandMap.templateToBrand.get(tmplId) : undefined;
    const brandName =
      brandId != null ? brandMap.brandNames.get(brandId) || 'Onbekend' : 'Onbekend';
    const brand = ensureBrand(brands, brandId ?? null, brandName);
    brand.openingStock += opening;
    brand.stockIn += stockIn;
    brand.currentStock += qty;
    brandAccByProduct.set(product.id, brand);

    for (const key of [audience, 'all'] as const) {
      const slice = byAudience[key];
      slice.productCount += 1;
      slice.openingStock += opening;
      slice.stockIn += stockIn;
      slice.stockAtSoldenStart += stockAtSoldenStart;
      slice.currentStock += qty;
      slice.currentRetailValue += qty * list;
      slice.currentCostValue += qty * cost;
    }
  }

  const addRetailLine = (
    productId: number,
    day: string,
    units: number,
    revenue: number
  ) => {
    if (!productIdSet.has(productId) || units === 0) return;
    const bucket = phaseBucket(day, periods);
    if (!bucket) return;
    const audience = audienceByProduct.get(productId) ?? 'other';
    const listValue = units * (listPriceById.get(productId) || 0);
    const cost = units * (costById.get(productId) || 0);
    addRetailToSlice(
      byAudience.all,
      bucket,
      units,
      revenue,
      cost,
      listValue,
      soldenListValue,
      'all'
    );
    addRetailToSlice(
      byAudience[audience],
      bucket,
      units,
      revenue,
      cost,
      listValue,
      soldenListValue,
      audience
    );
    const brand = brandAccByProduct.get(productId);
    if (brand) addRetailToBrand(brand, bucket, units, revenue, cost);
  };

  const posDateByOrder = new Map(posOrders.map((o) => [o.id, o.date_order]));
  for (const line of posLines) {
    const productId = line.product_id?.[0];
    const orderId = line.order_id?.[0];
    const dateStr = orderId ? posDateByOrder.get(orderId) : undefined;
    if (!productId || !dateStr) continue;
    addRetailLine(
      productId,
      dayFromDateTime(dateStr),
      line.qty || 0,
      line.price_subtotal_incl || 0
    );
  }

  const webshopDateByOrder = new Map(webshopOrders.map((o) => [o.id, o.date_order]));
  for (const line of webshopLines) {
    const productId = Array.isArray(line.product_id) ? line.product_id[0] : null;
    const orderId = line.order_id?.[0];
    const dateStr = orderId ? webshopDateByOrder.get(orderId) : undefined;
    if (!productId || !dateStr) continue;
    addRetailLine(
      productId,
      dayFromDateTime(dateStr),
      line.product_uom_qty || 0,
      webshopLineRevenue(line)
    );
  }

  const linesByB2bOrder = new Map<number, SaleLineRow[]>();
  for (const line of b2bLines) {
    const orderId = line.order_id?.[0];
    if (!orderId) continue;
    const list = linesByB2bOrder.get(orderId) || [];
    list.push(line);
    linesByB2bOrder.set(orderId, list);
  }

  const stockSales: StockSaleOrder[] = [];
  for (const order of b2bOrders) {
    const lines = (linesByB2bOrder.get(order.id) || []).filter((line) => {
      const productId = Array.isArray(line.product_id) ? line.product_id[0] : null;
      return productId != null && productIdSet.has(productId);
    });
    const note = typeof order.note === 'string' ? order.note : '';
    const nameMatch = quotationName
      ? namesEqualIlike(order.name, quotationName)
      : false;
    const noteMatch = STOCK_SALE_NOTE_RE.test(note);
    const priceMatch = lines.some((line) => {
      const productId = Array.isArray(line.product_id) ? line.product_id[0] : 0;
      return isStockSalePrice(line.price_unit || 0, listPriceById.get(productId) || 0);
    });

    let matchedBy: StockSaleOrder['matchedBy'] | null = null;
    if (nameMatch) matchedBy = 'quotationName';
    else if (noteMatch) matchedBy = 'note';
    else if (priceMatch) matchedBy = 'price';
    if (!matchedBy) continue;

    let units = 0;
    let revenue = 0;
    let cost = 0;
    let listValue = 0;
    for (const line of lines) {
      const productId = Array.isArray(line.product_id) ? line.product_id[0] : null;
      if (productId == null) continue;
      const qty = line.product_uom_qty || 0;
      if (qty === 0) continue;
      const lineRevenue = webshopLineRevenue(line);
      const lineCost = qty * (costById.get(productId) || 0);
      units += qty;
      revenue += lineRevenue;
      cost += lineCost;
      listValue += qty * (listPriceById.get(productId) || 0);

      const audience = audienceByProduct.get(productId) ?? 'other';
      addLineToPhase(byAudience.all.stockSale, qty, lineRevenue, lineCost);
      addLineToPhase(byAudience[audience].stockSale, qty, lineRevenue, lineCost);
      const brand = brandAccByProduct.get(productId);
      if (brand) {
        brand.stockSaleUnits += qty;
        brand.revenue += lineRevenue;
        brand.cost += lineCost;
      }
    }

    stockSales.push({
      orderId: order.id,
      orderName: order.name,
      date: dayFromDateTime(order.date_order),
      partner: partnerName(order.partner_id),
      state: order.state,
      units,
      revenue,
      cost,
      profit: revenue - cost,
      avgPctOfList: listValue > 0 ? (revenue / listValue) * 100 : null,
      matchedBy,
    });
  }

  for (const key of AUDIENCE_KEYS) {
    finalizeSlice(byAudience[key], soldenListValue[key]);
  }

  const brandRows: BrandSeasonRow[] = consolidateBrandSeasonRows(
    [...brands.values()].map((row) => ({
      brandId: row.brandId,
      brandName: row.brandName,
      available: row.openingStock + row.stockIn,
      regularUnits: row.regularUnits,
      soldenUnits: row.soldenUnits,
      afterUnits: row.afterUnits,
      stockSaleUnits: row.stockSaleUnits,
      currentStock: row.currentStock,
      sellThroughRetailPct: computeSellThroughPct(
        row.regularUnits + row.soldenUnits + row.afterUnits,
        row.openingStock,
        row.stockIn
      ),
      revenue: row.revenue,
      cost: row.cost,
      profit: row.revenue - row.cost,
      profitMarginPct: profitMarginPct(row.revenue - row.cost, row.revenue),
    }))
  );

  const leftoverWarning = leftoverKidsWarning(byAudience.kids.currentStock);
  const summary = formatSeasonSummary(matchedCategory, byAudience.all, periods);

  return {
    category: input.category,
    matchedCategory,
    year,
    kind,
    periods,
    byAudience,
    brands: brandRows,
    stockSales,
    leftoverWarning,
    summary,
  };
}
