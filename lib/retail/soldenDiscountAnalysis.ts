import { odooClient } from '@/lib/odooClient';
import {
  getRetailCalendar,
  getSummerSoldenRange,
  getWinterSoldenRange,
  getSummerSperperiodeRange,
  getWinterSperperiodeRange,
  type DateRange,
} from '@/lib/retail/belgianRetailCalendar';
import {
  collectCategoryTreeIds,
} from '@/lib/retail/sellThrough';
import {
  fetchPosOrdersInDateRange,
  fetchPosLinesForOrderIds,
} from '@/lib/posSalesForRange';

export type DiscountManner = 'line_percent' | 'order_level_korting' | 'solden_category' | 'none';

export type DiscountBucket =
  | '0'
  | '1-20'
  | '21-40'
  | '41-60'
  | '60+';

export type DayDiscountStats = {
  date: string;
  orderCount: number;
  units: number;
  revenue: number;
  discountEur: number;
  linePercentUnits: number;
  orderLevelKortingEur: number;
  soldenCategoryUnits: number;
};

export type MannerBreakdown = Record<
  DiscountManner,
  { units: number; revenue: number; discountEur: number; lineCount: number }
>;

export type SoldenDiscountAnalysis = {
  year: number;
  season: 'summer' | 'winter';
  period: DateRange;
  sperperiode: DateRange;
  soldenCategoryMatched: string | null;
  firstDiscountDay: string | null;
  peakDiscountDay: string | null;
  mannerBreakdown: MannerBreakdown;
  discountBuckets: Record<DiscountBucket, number>;
  timeline: DayDiscountStats[];
  sperperiodeSignals: {
    linePercentLines: number;
    orderLevelKortingLines: number;
    discountEur: number;
  };
  topBrandsByDiscountEur: Array<{ name: string; discountEur: number; units: number }>;
  summary: string;
  notes: string[];
};

const KORTING_NAME_RE = /korting|discount|summersales|solden\s*korting/i;

export function isOrderLevelKortingProduct(productName: string): boolean {
  return KORTING_NAME_RE.test(productName);
}

export function classifyDiscountManner(input: {
  discountPct: number;
  productName: string;
  inSoldenCategory: boolean;
}): DiscountManner {
  if (isOrderLevelKortingProduct(input.productName)) return 'order_level_korting';
  if (input.discountPct > 0) return 'line_percent';
  if (input.inSoldenCategory) return 'solden_category';
  return 'none';
}

export function discountBucket(discountPct: number): DiscountBucket {
  if (discountPct <= 0) return '0';
  if (discountPct <= 20) return '1-20';
  if (discountPct <= 40) return '21-40';
  if (discountPct <= 60) return '41-60';
  return '60+';
}

function emptyManner(): MannerBreakdown {
  return {
    line_percent: { units: 0, revenue: 0, discountEur: 0, lineCount: 0 },
    order_level_korting: { units: 0, revenue: 0, discountEur: 0, lineCount: 0 },
    solden_category: { units: 0, revenue: 0, discountEur: 0, lineCount: 0 },
    none: { units: 0, revenue: 0, discountEur: 0, lineCount: 0 },
  };
}

async function resolveSoldenCategoryIds(
  uid: number,
  password: string,
  season: 'summer' | 'winter',
  year: number
): Promise<{ name: string | null; ids: number[] }> {
  const seasonWord = season === 'summer' ? 'zomer' : 'winter';
  const candidates = [
    `Solden ${seasonWord} ${year}`,
    `Solden ${seasonWord}`,
    `Solden ${year}`,
  ];

  for (const name of candidates) {
    const found = await odooClient.searchRead<{ id: number; name: string }>(
      uid,
      password,
      'product.category',
      [['name', '=ilike', name]],
      ['id', 'name'],
      3
    );
    if (found[0]) {
      const ids = await collectCategoryTreeIds(uid, password, found[0].id);
      return { name: found[0].name, ids };
    }
  }

  const fuzzy = await odooClient.searchRead<{ id: number; name: string }>(
    uid,
    password,
    'product.category',
    ['&', ['name', 'ilike', 'Solden'], ['name', 'ilike', seasonWord]],
    ['id', 'name'],
    10
  );
  // Prefer one containing the year
  const preferred =
    fuzzy.find((c) => c.name.includes(String(year))) || fuzzy[0] || null;
  if (!preferred) return { name: null, ids: [] };
  const ids = await collectCategoryTreeIds(uid, password, preferred.id);
  return { name: preferred.name, ids };
}

async function getMerkMap(
  uid: number,
  password: string
): Promise<Map<number, string>> {
  const attrs = await odooClient.searchRead<{ id: number }>(
    uid,
    password,
    'product.attribute',
    [['name', 'in', ['MERK', 'Merk 1']]],
    ['id'],
    10
  );
  const attrIds = attrs.map((a) => a.id);
  if (!attrIds.length) return new Map();

  const values = await odooClient.searchRead<{ id: number; name: string }>(
    uid,
    password,
    'product.attribute.value',
    [['attribute_id', 'in', attrIds]],
    ['id', 'name'],
    500
  );
  const brandNames = new Map(values.map((v) => [v.id, v.name]));

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
    const tmpl = line.product_tmpl_id?.[0];
    const brandId = line.value_ids?.[0];
    if (tmpl && brandId) templateToBrand.set(tmpl, brandId);
  }

  const products = await odooClient.searchRead<{
    id: number;
    product_tmpl_id: [number, string];
  }>(uid, password, 'product.product', [], ['id', 'product_tmpl_id'], 20000);

  const productToBrandName = new Map<number, string>();
  for (const p of products) {
    const tmpl = p.product_tmpl_id?.[0];
    const brandId = tmpl ? templateToBrand.get(tmpl) : undefined;
    if (brandId) {
      const name = brandNames.get(brandId);
      if (name) productToBrandName.set(p.id, name);
    }
  }
  return productToBrandName;
}

export async function analyzeSoldenDiscounts(input: {
  uid: number;
  password: string;
  season: 'summer' | 'winter';
  year: number;
}): Promise<SoldenDiscountAnalysis> {
  const period =
    input.season === 'summer'
      ? getSummerSoldenRange(input.year)
      : getWinterSoldenRange(input.year);
  const sperperiode =
    input.season === 'summer'
      ? getSummerSperperiodeRange(input.year)
      : getWinterSperperiodeRange(input.year);

  const calendar = getRetailCalendar(input.year);
  void calendar;

  const { name: soldenCategoryMatched, ids: soldenCategoryIds } =
    await resolveSoldenCategoryIds(
      input.uid,
      input.password,
      input.season,
      input.year
    );
  const soldenCategorySet = new Set(soldenCategoryIds);

  const productToBrand = await getMerkMap(input.uid, input.password);

  // Load product → category for solden membership
  const products = await odooClient.searchRead<{
    id: number;
    categ_id: [number, string] | false;
    display_name?: string;
    name?: string;
  }>(
    input.uid,
    input.password,
    'product.product',
    [],
    ['id', 'categ_id', 'display_name', 'name'],
    20000
  );
  const productInSolden = new Map<number, boolean>();
  const productName = new Map<number, string>();
  for (const p of products) {
    const catId = Array.isArray(p.categ_id) ? p.categ_id[0] : null;
    productInSolden.set(p.id, catId != null && soldenCategorySet.has(catId));
    productName.set(p.id, p.display_name || p.name || '');
  }

  const orders = await fetchPosOrdersInDateRange<{
    id: number;
    date_order: string;
  }>(input.uid, input.password, period.start, period.end, ['id', 'date_order']);

  const orderIdToDate = new Map(orders.map((o) => [o.id, o.date_order]));
  const lines = await fetchPosLinesForOrderIds<{
    id: number;
    product_id: [number, string];
    qty: number;
    price_unit: number;
    price_subtotal_incl: number;
    discount: number;
    order_id: [number, string];
  }>(input.uid, input.password, orders.map((o) => o.id), [
    'id',
    'product_id',
    'qty',
    'price_unit',
    'price_subtotal_incl',
    'discount',
    'order_id',
  ]);

  const mannerBreakdown = emptyManner();
  const discountBuckets: Record<DiscountBucket, number> = {
    '0': 0,
    '1-20': 0,
    '21-40': 0,
    '41-60': 0,
    '60+': 0,
  };
  const byDay = new Map<string, DayDiscountStats>();
  const brandDiscount = new Map<string, { discountEur: number; units: number }>();

  const ensureDay = (date: string): DayDiscountStats => {
    let d = byDay.get(date);
    if (!d) {
      d = {
        date,
        orderCount: 0,
        units: 0,
        revenue: 0,
        discountEur: 0,
        linePercentUnits: 0,
        orderLevelKortingEur: 0,
        soldenCategoryUnits: 0,
      };
      byDay.set(date, d);
    }
    return d;
  };

  const ordersPerDay = new Map<string, Set<number>>();

  for (const line of lines) {
    const productId = line.product_id?.[0];
    const orderId = line.order_id?.[0];
    const dateStr = orderId ? orderIdToDate.get(orderId) : undefined;
    if (!productId || !dateStr) continue;
    const day = dateStr.slice(0, 10);
    const name = line.product_id?.[1] || productName.get(productId) || '';
    const qty = line.qty || 0;
    const priceUnit = line.price_unit || 0;
    const revenue = line.price_subtotal_incl || 0;
    const discountPct = line.discount || 0;
    const inSolden = productInSolden.get(productId) || false;
    const manner = classifyDiscountManner({
      discountPct,
      productName: name,
      inSoldenCategory: inSolden,
    });

    const originalValue = priceUnit * Math.abs(qty);
    let discountEur = 0;
    if (manner === 'order_level_korting') {
      discountEur = Math.abs(revenue) || Math.abs(originalValue);
    } else if (discountPct > 0) {
      discountEur = originalValue * (discountPct / 100);
    } else if (manner === 'solden_category') {
      // Cannot reconstruct markdown vs list_price; count €0 explicit discount
      discountEur = 0;
    }

    const bucket = discountBucket(discountPct);
    discountBuckets[bucket] += 1;

    const m = mannerBreakdown[manner];
    m.lineCount += 1;
    m.units += qty;
    m.revenue += revenue;
    m.discountEur += discountEur;

    const dayStats = ensureDay(day);
    dayStats.units += qty;
    dayStats.revenue += revenue;
    dayStats.discountEur += discountEur;
    if (manner === 'line_percent') dayStats.linePercentUnits += qty;
    if (manner === 'order_level_korting') dayStats.orderLevelKortingEur += discountEur;
    if (manner === 'solden_category') dayStats.soldenCategoryUnits += qty;

    if (!ordersPerDay.has(day)) ordersPerDay.set(day, new Set());
    if (orderId) ordersPerDay.get(day)!.add(orderId);

    const brand = productToBrand.get(productId);
    if (brand && discountEur > 0) {
      const cur = brandDiscount.get(brand) || { discountEur: 0, units: 0 };
      cur.discountEur += discountEur;
      cur.units += Math.abs(qty);
      brandDiscount.set(brand, cur);
    }
  }

  for (const [day, stats] of byDay) {
    stats.orderCount = ordersPerDay.get(day)?.size || 0;
  }

  const timeline = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  const meaningful = timeline.filter(
    (d) =>
      d.discountEur > 0 ||
      d.linePercentUnits > 0 ||
      d.orderLevelKortingEur > 0 ||
      d.soldenCategoryUnits > 0
  );
  const firstDiscountDay = meaningful[0]?.date ?? null;
  let peakDiscountDay: string | null = null;
  let peakVal = -1;
  for (const d of timeline) {
    const score = d.discountEur + d.soldenCategoryUnits;
    if (score > peakVal) {
      peakVal = score;
      peakDiscountDay = d.date;
    }
  }

  // Sperperiode scan (signals only)
  const sperOrders = await fetchPosOrdersInDateRange<{
    id: number;
    date_order: string;
  }>(input.uid, input.password, sperperiode.start, sperperiode.end, [
    'id',
    'date_order',
  ]);
  const sperLines = await fetchPosLinesForOrderIds<{
    product_id: [number, string];
    discount: number;
    price_unit: number;
    qty: number;
    price_subtotal_incl: number;
  }>(input.uid, input.password, sperOrders.map((o) => o.id), [
    'product_id',
    'discount',
    'price_unit',
    'qty',
    'price_subtotal_incl',
  ]);

  let sperLinePercent = 0;
  let sperOrderLevel = 0;
  let sperDiscountEur = 0;
  for (const line of sperLines) {
    const name = line.product_id?.[1] || '';
    const discountPct = line.discount || 0;
    if (isOrderLevelKortingProduct(name)) {
      sperOrderLevel += 1;
      sperDiscountEur += Math.abs(line.price_subtotal_incl || 0);
    } else if (discountPct > 0) {
      sperLinePercent += 1;
      sperDiscountEur +=
        Math.abs(line.price_unit || 0) *
        Math.abs(line.qty || 0) *
        (discountPct / 100);
    }
  }

  const topBrandsByDiscountEur = [...brandDiscount.entries()]
    .map(([name, v]) => ({ name, discountEur: v.discountEur, units: v.units }))
    .sort((a, b) => b.discountEur - a.discountEur)
    .slice(0, 10);

  const totalDiscount = Object.values(mannerBreakdown).reduce(
    (s, m) => s + m.discountEur,
    0
  );
  const dominant = (
    Object.entries(mannerBreakdown) as Array<
      [DiscountManner, MannerBreakdown[DiscountManner]]
    >
  )
    .filter(([k]) => k !== 'none')
    .sort((a, b) => b[1].lineCount - a[1].lineCount)[0];

  const summary = [
    `${input.season} solden ${input.year} (${period.start} → ${period.end})`,
    firstDiscountDay
      ? `eerste kortingsactiviteit ${firstDiscountDay}`
      : 'geen kortingsactiviteit gedetecteerd',
    peakDiscountDay ? `piekdag ${peakDiscountDay}` : '',
    dominant
      ? `dominante manier: ${dominant[0]} (${dominant[1].lineCount} lijnen)`
      : '',
    `expliciete € korting ≈ ${totalDiscount.toFixed(2)}`,
    soldenCategoryMatched
      ? `solden-categorie: ${soldenCategoryMatched}`
      : 'geen solden-categorie gevonden',
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    year: input.year,
    season: input.season,
    period,
    sperperiode,
    soldenCategoryMatched,
    firstDiscountDay,
    peakDiscountDay,
    mannerBreakdown,
    discountBuckets,
    timeline,
    sperperiodeSignals: {
      linePercentLines: sperLinePercent,
      orderLevelKortingLines: sperOrderLevel,
      discountEur: sperDiscountEur,
    },
    topBrandsByDiscountEur,
    summary,
    notes: [
      'Geen historische list_price: markdown van vaste prijs naar soldenprijs is niet reconstrueerbaar.',
      'solden_category = artikel in Solden-categorieboom (price_unit kan al verlaagd zijn met discount=0).',
      'order_level_korting = aparte POS-regels waarvan de productnaam korting/discount/summersales bevat.',
      'Sperperiode-signalen zijn observaties, geen compliance-oordeel.',
      'Raad van State (20 May 2026): solden-term buiten jan/jul grotendeels niet meer afdwingbaar; kalender blijft analytics-ritme.',
    ],
  };
}
