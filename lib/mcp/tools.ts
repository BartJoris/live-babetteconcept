import { z } from 'zod';
import { odooClient } from '@/lib/odooClient';
import { fetchPosOrdersInDateRange } from '@/lib/posSalesForRange';
import { getMcpOdooCredentials } from '@/lib/mcp/odooCredentials';

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
