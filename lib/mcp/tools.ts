import { z } from 'zod';
import { odooClient } from '@/lib/odooClient';
import { fetchPosOrdersInDateRange } from '@/lib/posSalesForRange';
import { getMcpOdooCredentials } from '@/lib/mcp/odooCredentials';
import {
  getRetailCalendar,
  PERIOD_PRESETS,
  resolvePeriodPreset,
  type PeriodPreset,
} from '@/lib/retail/belgianRetailCalendar';
import {
  analyzeAssortment,
  rankBrands,
  searchCategories,
} from '@/lib/retail/sellThrough';
import { analyzeSoldenDiscounts } from '@/lib/retail/soldenDiscountAnalysis';
import {
  categorySearchAliases,
  countAssortment,
  getStockSummary,
  listAgedStock,
  listLastSizeLeft,
} from '@/lib/retail/stockSnapshot';

export type ToolAccess = 'read' | 'write';

export type McpToolDefinition = {
  name: string;
  description: string;
  access: ToolAccess;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  execute: (args: Record<string, unknown>) => Promise<string>;
};

function jsonResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

type OdooProduct = {
  id: number;
  barcode: string | false | null;
  name?: string | false | null;
  display_name?: string | false | null;
  qty_available: number | null;
  list_price: number | null;
  standard_price: number | null;
  active: boolean;
  categ_id: [number, string] | false | null;
  default_code?: string | false | null;
};

type PosSession = {
  id: number;
  name: string;
  state: string;
};

type PosOrder = {
  id: number;
  amount_total: number;
  date_order: string;
  partner_id?: [number, string] | false;
};

type BrandValue = {
  id: number;
  name: string;
  attribute_id: [number, string];
};

type SaleOrder = {
  id: number;
  name: string;
  date_order: string;
  amount_total: number;
  state: string;
  partner_id: [number, string] | false;
};

const searchProductsSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Search term for product name, barcode, or internal reference'),
  limit: z.number().int().min(1).max(50).optional().describe('Max results (default 20)'),
  includeArchived: z
    .boolean()
    .optional()
    .describe('Include archived products (default false)'),
});

const getProductSchema = z.object({
  productId: z.number().int().positive().optional().describe('Odoo product.product id'),
  barcode: z.string().min(1).optional().describe('Exact product barcode'),
});

const posSalesSchema = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe('Start date YYYY-MM-DD'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe('End date YYYY-MM-DD'),
});

const recentOrdersSchema = z.object({
  limit: z.number().int().min(1).max(50).optional().describe('Max orders (default 10)'),
});

const emptySchema = z.object({});

const retailCalendarSchema = z.object({
  year: z
    .number()
    .int()
    .min(2020)
    .max(2100)
    .optional()
    .describe('Calendar year (default: current year)'),
});

const listCategoriesSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      'Search term for product.category name or path, e.g. "Zomer 2026" or "Solden". Omit to list categories (capped by limit).'
    ),
  limit: z.number().int().min(1).max(50).optional().describe('Max results (default 20)'),
});

const stockAudienceSchema = z
  .enum(['all', 'adults', 'kids', 'babies', 'children', 'teens'])
  .optional()
  .describe(
    'Size attribute filter: adults / kids / babies / children / teens (MAAT attributes)'
  );

const stockFiltersSchema = {
  brand: z.string().min(1).optional().describe('Optional MERK brand filter'),
  category: z
    .string()
    .min(1)
    .optional()
    .describe('Optional product.category / collection filter'),
  audience: stockAudienceSchema,
};

const stockSummarySchema = z.object(stockFiltersSchema);

const lastSizeLeftSchema = z.object({
  ...stockFiltersSchema,
  limit: z.number().int().min(1).max(100).optional().describe('Max rows (default 50)'),
});

const agedStockSchema = z.object({
  ...stockFiltersSchema,
  minAgeYears: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe('Minimum age in years (default 2)'),
  limit: z.number().int().min(1).max(100).optional().describe('Max rows (default 50)'),
});

const countAssortmentSchema = z
  .object({
    brand: z.string().min(1).optional().describe('MERK brand name'),
    category: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Collection/category, e.g. "Zomer 2026", "Herfst 2026", "AW26". Herfst/winter often maps to AW26.'
      ),
    audience: stockAudienceSchema,
  })
  .superRefine((val, ctx) => {
    if (!val.brand && !val.category) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide brand and/or category',
      });
    }
  });

const periodPresetSchema = z
  .enum(PERIOD_PRESETS as [PeriodPreset, ...PeriodPreset[]])
  .describe(
    'Retail period preset (Belgian solden/seasons). Prefer this over raw dates when the user mentions solden/seizoen/YTD.'
  );

const analyzeAssortmentSchema = z
  .object({
    dimension: z
      .enum(['brand', 'category'])
      .describe('Analyze a MERK brand or a product.category / collection'),
    name: z
      .string()
      .min(1)
      .describe('Brand or category name, e.g. "Hvid", "1+ in the family", "Zomer 2026"'),
    periodPreset: periodPresetSchema.optional(),
    year: z
      .number()
      .int()
      .min(2020)
      .max(2100)
      .optional()
      .describe('Year for periodPreset (default: current year)'),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('Explicit start YYYY-MM-DD (alternative to periodPreset)'),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('Explicit end YYYY-MM-DD (alternative to periodPreset)'),
    audience: z
      .enum(['all', 'adults', 'kids', 'babies', 'children', 'teens'])
      .optional()
      .describe(
        'Size attribute filter: adults=MAAT Volwassenen; kids=all youth; babies=MAAT Baby\'s; children=MAAT Kinderen; teens=MAAT Tieners'
      ),
  })
  .superRefine((val, ctx) => {
    const hasPreset = Boolean(val.periodPreset);
    const hasDates = Boolean(val.startDate && val.endDate);
    if (!hasPreset && !hasDates) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide periodPreset or both startDate and endDate',
      });
    }
  });

const rankBrandsSchema = z
  .object({
    periodPreset: periodPresetSchema.optional(),
    year: z.number().int().min(2020).max(2100).optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    sortBy: z
      .enum(['revenue', 'unitsSold', 'sellThroughPct'])
      .optional()
      .describe('Ranking metric (default revenue). Use sellThroughPct for "% verkocht" style questions.'),
    limit: z.number().int().min(1).max(50).optional().describe('Top N (default 10)'),
    audience: z
      .enum(['all', 'adults', 'kids', 'babies', 'children', 'teens'])
      .optional()
      .describe(
        'Size attribute filter: adults / kids / babies / children / teens (MAAT attributes)'
      ),
    includeSellThrough: z
      .boolean()
      .optional()
      .describe('Also compute sell-through when sorting by revenue/units (slower)'),
  })
  .superRefine((val, ctx) => {
    const hasPreset = Boolean(val.periodPreset);
    const hasDates = Boolean(val.startDate && val.endDate);
    if (!hasPreset && !hasDates) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide periodPreset or both startDate and endDate',
      });
    }
  });

const analyzeSoldenDiscountsSchema = z.object({
  season: z
    .enum(['summer', 'winter'])
    .describe('Summer solden (jul) or winter solden (jan)'),
  year: z
    .number()
    .int()
    .min(2020)
    .max(2100)
    .describe('Solden year, e.g. 2025 for summer 2025 or winter 2025'),
});

function resolveToolPeriod(input: {
  periodPreset?: PeriodPreset;
  year?: number;
  startDate?: string;
  endDate?: string;
}): { start: string; end: string; year: number } {
  const now = new Date();
  const year = input.year ?? now.getFullYear();
  if (input.periodPreset) {
    const range = resolvePeriodPreset(input.periodPreset, year, now);
    return { ...range, year };
  }
  if (input.startDate && input.endDate) {
    return { start: input.startDate, end: input.endDate, year };
  }
  throw new Error('Provide periodPreset or both startDate and endDate');
}

async function searchProducts(args: z.infer<typeof searchProductsSchema>): Promise<string> {
  const { uid, password } = await getMcpOdooCredentials();
  const limit = args.limit ?? 20;
  // display_name is not stored on product.product — search name/barcode/default_code only.
  const domain: unknown[] = [
    '|',
    '|',
    ['name', 'ilike', args.query],
    ['barcode', 'ilike', args.query],
    ['default_code', 'ilike', args.query],
  ];

  const products = await odooClient.call<OdooProduct[]>({
    uid,
    password,
    model: 'product.product',
    method: 'search_read',
    args: [domain],
    kwargs: {
      fields: [
        'id',
        'barcode',
        'name',
        'display_name',
        'categ_id',
        'qty_available',
        'list_price',
        'standard_price',
        'active',
        'default_code',
      ],
      limit,
      order: 'name asc',
      ...(args.includeArchived ? { context: { active_test: false } } : {}),
    },
  });

  return jsonResult({
    count: products.length,
    products: products.map((p) => ({
      id: p.id,
      name: p.display_name || p.name || null,
      barcode: p.barcode || null,
      defaultCode: p.default_code || null,
      qtyAvailable: p.qty_available,
      listPrice: p.list_price,
      standardPrice: p.standard_price,
      category: Array.isArray(p.categ_id) ? p.categ_id[1] : null,
      active: p.active,
    })),
  });
}

async function getProduct(args: z.infer<typeof getProductSchema>): Promise<string> {
  if (!args.productId && !args.barcode) {
    throw new Error('Provide productId or barcode');
  }

  const { uid, password } = await getMcpOdooCredentials();
  const domain: unknown[] = args.productId
    ? [['id', '=', args.productId]]
    : [['barcode', '=', args.barcode]];

  const products = await odooClient.call<OdooProduct[]>({
    uid,
    password,
    model: 'product.product',
    method: 'search_read',
    args: [domain],
    kwargs: {
      fields: [
        'id',
        'barcode',
        'name',
        'display_name',
        'categ_id',
        'qty_available',
        'list_price',
        'standard_price',
        'active',
        'default_code',
      ],
      limit: 1,
      context: { active_test: false },
    },
  });

  if (products.length === 0) {
    return jsonResult({ found: false, product: null });
  }

  const p = products[0];
  return jsonResult({
    found: true,
    product: {
      id: p.id,
      name: p.display_name || p.name || null,
      barcode: p.barcode || null,
      defaultCode: p.default_code || null,
      qtyAvailable: p.qty_available,
      listPrice: p.list_price,
      standardPrice: p.standard_price,
      category: Array.isArray(p.categ_id) ? p.categ_id[1] : null,
      active: p.active,
    },
  });
}

async function getOpenPosSession(): Promise<string> {
  const { uid, password } = await getMcpOdooCredentials();

  const sessions = await odooClient.searchRead<PosSession>(
    uid,
    password,
    'pos.session',
    [['state', '=', 'opened']],
    ['id', 'name', 'state'],
    1,
    0,
    'id desc'
  );

  if (!sessions.length) {
    return jsonResult({
      open: false,
      session: null,
      total: 0,
      orderCount: 0,
      orders: [],
    });
  }

  const session = sessions[0];
  const orders = await odooClient.searchRead<PosOrder>(
    uid,
    password,
    'pos.order',
    [['session_id', '=', session.id]],
    ['id', 'amount_total', 'date_order', 'partner_id']
  );

  const mapped = orders.map((o) => ({
    id: o.id,
    total: o.amount_total,
    timestamp: o.date_order,
    partner: Array.isArray(o.partner_id) ? o.partner_id[1] : null,
  }));

  return jsonResult({
    open: true,
    session: { id: session.id, name: session.name, state: session.state },
    total: mapped.reduce((sum, o) => sum + o.total, 0),
    orderCount: mapped.length,
    orders: mapped,
  });
}

async function getPosSalesSummary(args: z.infer<typeof posSalesSchema>): Promise<string> {
  const { uid, password } = await getMcpOdooCredentials();
  const orders = await fetchPosOrdersInDateRange<{
    id: number;
    date_order: string;
    amount_total: number;
  }>(uid, password, args.startDate, args.endDate, [
    'id',
    'date_order',
    'amount_total',
  ]);

  const total = orders.reduce((sum, o) => sum + (o.amount_total || 0), 0);
  const byDay = new Map<string, { orderCount: number; total: number }>();

  for (const order of orders) {
    const day = order.date_order.slice(0, 10);
    const current = byDay.get(day) || { orderCount: 0, total: 0 };
    current.orderCount += 1;
    current.total += order.amount_total || 0;
    byDay.set(day, current);
  }

  return jsonResult({
    startDate: args.startDate,
    endDate: args.endDate,
    orderCount: orders.length,
    total,
    averageOrderValue: orders.length ? total / orders.length : 0,
    byDay: Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({ date, ...stats })),
  });
}

async function listBrands(): Promise<string> {
  const { uid, password } = await getMcpOdooCredentials();

  const merkAttributes = await odooClient.searchRead<{ id: number; name: string }>(
    uid,
    password,
    'product.attribute',
    [['name', 'in', ['MERK', 'Merk 1']]],
    ['id', 'name'],
    10
  );

  if (!merkAttributes.length) {
    return jsonResult({ brands: [], summary: { total: 0 } });
  }

  const attributeIds = merkAttributes.map((a) => a.id);
  const attributeNames = Object.fromEntries(merkAttributes.map((a) => [a.id, a.name]));

  const brandValues = await odooClient.searchRead<BrandValue>(
    uid,
    password,
    'product.attribute.value',
    [['attribute_id', 'in', attributeIds]],
    ['id', 'name', 'attribute_id'],
    500
  );

  const brands = brandValues
    .map((b) => ({
      id: b.id,
      name: b.name,
      source: attributeNames[b.attribute_id[0]] || 'Unknown',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return jsonResult({
    brands,
    summary: { total: brands.length, attributes: merkAttributes },
  });
}

async function listRecentWebshopOrders(
  args: z.infer<typeof recentOrdersSchema>
): Promise<string> {
  const { uid, password } = await getMcpOdooCredentials();
  const limit = args.limit ?? 10;

  const orders = await odooClient.searchRead<SaleOrder>(
    uid,
    password,
    'sale.order',
    [['state', 'in', ['sent', 'sale', 'done']]],
    ['id', 'name', 'date_order', 'amount_total', 'state', 'partner_id'],
    limit,
    0,
    'date_order desc'
  );

  return jsonResult({
    count: orders.length,
    orders: orders.map((o) => ({
      id: o.id,
      name: o.name,
      date: o.date_order,
      total: o.amount_total,
      state: o.state,
      partner: Array.isArray(o.partner_id) ? o.partner_id[1] : null,
    })),
  });
}

async function ping(): Promise<string> {
  return jsonResult({
    ok: true,
    server: 'babetteconcept',
    access: 'read',
    timestamp: new Date().toISOString(),
  });
}

async function getRetailCalendarTool(
  args: z.infer<typeof retailCalendarSchema>
): Promise<string> {
  const year = args.year ?? new Date().getFullYear();
  const calendar = getRetailCalendar(year);
  return jsonResult({
    ...calendar,
    presets: PERIOD_PRESETS,
    summary: `Belgische tradingkalender ${year}: wintersolden ${calendar.winterSolden.start}→${calendar.winterSolden.end}, zomersolden ${calendar.summerSolden.start}→${calendar.summerSolden.end}`,
  });
}

async function listCategoriesTool(
  args: z.infer<typeof listCategoriesSchema>
): Promise<string> {
  const { uid, password } = await getMcpOdooCredentials();
  const query = args.query?.trim() ?? '';
  const limit = args.limit ?? 20;
  const aliases = query ? categorySearchAliases(query) : [''];
  const byId = new Map<
    number,
    { id: number; name: string; completeName: string | null; parentId: number | null }
  >();
  for (const alias of aliases) {
    const found = await searchCategories(uid, password, alias, limit);
    for (const cat of found) byId.set(cat.id, cat);
  }
  const categories = [...byId.values()]
    .sort((a, b) =>
      (a.completeName || a.name).localeCompare(b.completeName || b.name, 'nl')
    )
    .slice(0, limit);
  return jsonResult({
    query: query || null,
    aliasesTried: query ? aliases : null,
    count: categories.length,
    categories,
    hint:
      categories.length === 0
        ? 'Geen categorieën gevonden. Probeer "AW26", "Zomer", "Winter" of "2026".'
        : undefined,
  });
}

async function analyzeAssortmentTool(
  args: z.infer<typeof analyzeAssortmentSchema>
): Promise<string> {
  const { uid, password } = await getMcpOdooCredentials();
  const period = resolveToolPeriod(args);
  const result = await analyzeAssortment({
    uid,
    password,
    dimension: args.dimension,
    name: args.name,
    period: { start: period.start, end: period.end },
    audience: args.audience ?? 'all',
    yearForSalesSplit: period.year,
  });
  return jsonResult(result);
}

async function rankBrandsTool(
  args: z.infer<typeof rankBrandsSchema>
): Promise<string> {
  const { uid, password } = await getMcpOdooCredentials();
  const period = resolveToolPeriod(args);
  const result = await rankBrands({
    uid,
    password,
    period: { start: period.start, end: period.end },
    sortBy: args.sortBy ?? 'revenue',
    limit: args.limit ?? 10,
    audience: args.audience ?? 'all',
    yearForSalesSplit: period.year,
    includeSellThrough:
      args.includeSellThrough ?? args.sortBy === 'sellThroughPct',
  });
  return jsonResult(result);
}

async function analyzeSoldenDiscountsTool(
  args: z.infer<typeof analyzeSoldenDiscountsSchema>
): Promise<string> {
  const { uid, password } = await getMcpOdooCredentials();
  const result = await analyzeSoldenDiscounts({
    uid,
    password,
    season: args.season,
    year: args.year,
  });
  return jsonResult(result);
}

async function getStockSummaryTool(
  args: z.infer<typeof stockSummarySchema>
): Promise<string> {
  const { uid, password } = await getMcpOdooCredentials();
  const result = await getStockSummary({
    uid,
    password,
    filters: {
      brand: args.brand,
      category: args.category,
      audience: args.audience,
    },
  });
  return jsonResult(result);
}

async function listLastSizeLeftTool(
  args: z.infer<typeof lastSizeLeftSchema>
): Promise<string> {
  const { uid, password } = await getMcpOdooCredentials();
  const result = await listLastSizeLeft({
    uid,
    password,
    filters: {
      brand: args.brand,
      category: args.category,
      audience: args.audience,
    },
    limit: args.limit,
  });
  return jsonResult(result);
}

async function listAgedStockTool(
  args: z.infer<typeof agedStockSchema>
): Promise<string> {
  const { uid, password } = await getMcpOdooCredentials();
  const result = await listAgedStock({
    uid,
    password,
    filters: {
      brand: args.brand,
      category: args.category,
      audience: args.audience,
    },
    minAgeYears: args.minAgeYears,
    limit: args.limit,
  });
  return jsonResult(result);
}

async function countAssortmentTool(
  args: z.infer<typeof countAssortmentSchema>
): Promise<string> {
  const { uid, password } = await getMcpOdooCredentials();
  const result = await countAssortment({
    uid,
    password,
    brand: args.brand,
    category: args.category,
    audience: args.audience,
  });
  return jsonResult(result);
}

/**
 * All MCP tools. Remote `/api/mcp` only registers `access: "read"`.
 * Add `access: "write"` tools later when expanding beyond read-only.
 */
export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'ping',
    description: 'Health check for the Babette Concept MCP server. Returns ok when authenticated.',
    access: 'read',
    inputSchema: emptySchema,
    execute: async () => ping(),
  },
  {
    name: 'search_products',
    description:
      'Search Odoo products by name, barcode, or internal reference. Use when the user asks to find products in the Babette catalog.',
    access: 'read',
    inputSchema: searchProductsSchema,
    execute: async (args) => searchProducts(searchProductsSchema.parse(args)),
  },
  {
    name: 'get_product',
    description:
      'Get a single Odoo product by id or exact barcode. Use when the user asks for details of one product.',
    access: 'read',
    inputSchema: getProductSchema,
    execute: async (args) => getProduct(getProductSchema.parse(args)),
  },
  {
    name: 'get_open_pos_session',
    description:
      'Return the currently open POS session with order count and total. Use for live till / kassa status.',
    access: 'read',
    inputSchema: emptySchema,
    execute: async () => getOpenPosSession(),
  },
  {
    name: 'get_pos_sales_summary',
    description:
      'Summarize POS sales totals and order counts for a date range (YYYY-MM-DD). Use for revenue questions.',
    access: 'read',
    inputSchema: posSalesSchema,
    execute: async (args) => getPosSalesSummary(posSalesSchema.parse(args)),
  },
  {
    name: 'list_brands',
    description:
      'List product brands from Odoo MERK attributes. Use when the user asks which brands exist.',
    access: 'read',
    inputSchema: emptySchema,
    execute: async () => listBrands(),
  },
  {
    name: 'list_recent_webshop_orders',
    description:
      'List recent confirmed webshop sale orders. Use for e-commerce order overview questions.',
    access: 'read',
    inputSchema: recentOrdersSchema,
    execute: async (args) =>
      listRecentWebshopOrders(recentOrdersSchema.parse(args)),
  },
  {
    name: 'get_retail_calendar',
    description:
      'Return Belgian solden, sperperiode and fashion trading-season dates for a year. Use when the user asks when solden/seasons start, or before choosing a periodPreset for assortment analysis.',
    access: 'read',
    inputSchema: retailCalendarSchema,
    execute: async (args) =>
      getRetailCalendarTool(retailCalendarSchema.parse(args)),
  },
  {
    name: 'list_categories',
    description:
      'Search Odoo product.category names/paths (collections like "Zomer 2026", "Solden zomer 2025"). Use to resolve collection names before analyze_assortment. Query optional — omit to browse.',
    access: 'read',
    inputSchema: listCategoriesSchema,
    execute: async (args) =>
      listCategoriesTool(listCategoriesSchema.parse(args)),
  },
  {
    name: 'analyze_assortment',
    description:
      'Sell-through analysis for a brand (MERK) or category/collection: units sold / (opening stock + stock in). Use for "% verkocht", solden splits, and audience splits (adults / babies / children / teens / kids). Prefer periodPreset.',
    access: 'read',
    inputSchema: analyzeAssortmentSchema,
    execute: async (args) =>
      analyzeAssortmentTool(analyzeAssortmentSchema.parse(args)),
  },
  {
    name: 'rank_brands',
    description:
      'Rank brands by revenue, units sold, or sell-through % for a period. Use for "best selling brand". audience: adults / kids / babies / children / teens.',
    access: 'read',
    inputSchema: rankBrandsSchema,
    execute: async (args) => rankBrandsTool(rankBrandsSchema.parse(args)),
  },
  {
    name: 'analyze_solden_discounts',
    description:
      'Analyze how and when discounts were applied during Belgian summer/winter solden: line % discounts, order-level korting products, solden-category sales, daily timeline, first/peak discount days. Use for previous solden markdown questions.',
    access: 'read',
    inputSchema: analyzeSoldenDiscountsSchema,
    execute: async (args) =>
      analyzeSoldenDiscountsTool(analyzeSoldenDiscountsSchema.parse(args)),
  },
  {
    name: 'get_stock_summary',
    description:
      'Current on-hand stock: total units, variant count, template/model count, cost value (standard_price) and retail value (list_price). Use for "hoeveel is onze stock waard" and "hoeveel producten aanwezig".',
    access: 'read',
    inputSchema: stockSummarySchema,
    execute: async (args) =>
      getStockSummaryTool(stockSummarySchema.parse(args)),
  },
  {
    name: 'list_last_size_left',
    description:
      'List product models where exactly one variant is still in stock and that qty is 1 (e.g. only XS left with 1 piece). Use for "enkel nog 1 maat" / last size questions.',
    access: 'read',
    inputSchema: lastSizeLeftSchema,
    execute: async (args) =>
      listLastSizeLeftTool(lastSizeLeftSchema.parse(args)),
  },
  {
    name: 'list_aged_stock',
    description:
      'List models still in stock that are older than minAgeYears (default 2), by collection year in category (e.g. Zomer 2024) OR first incoming stock.move date. Use for "oude stock" / "ouder dan 2 jaar".',
    access: 'read',
    inputSchema: agedStockSchema,
    execute: async (args) => listAgedStockTool(agedStockSchema.parse(args)),
  },
  {
    name: 'count_assortment',
    description:
      'Count how many product models/variants are created in a brand or collection/category (includes zero stock). Use for "hoeveel producten aangemaakt van Herfst 2026 / AW26 / Zomer 2026". Also returns how many of those are still in stock.',
    access: 'read',
    inputSchema: countAssortmentSchema,
    execute: async (args) =>
      countAssortmentTool(countAssortmentSchema.parse(args)),
  },
];

export function getToolsByAccess(access: ToolAccess | 'all'): McpToolDefinition[] {
  if (access === 'all') return MCP_TOOLS;
  return MCP_TOOLS.filter((tool) => tool.access === access);
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  options: { allowedAccess: ToolAccess | 'all' }
): Promise<string> {
  const tool = MCP_TOOLS.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Unknown MCP tool: ${name}`);
  }

  if (options.allowedAccess !== 'all' && tool.access !== options.allowedAccess) {
    throw new Error(
      `Tool "${name}" requires "${tool.access}" access; caller is restricted to "${options.allowedAccess}"`
    );
  }

  return tool.execute(args);
}
