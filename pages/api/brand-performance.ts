import type { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = process.env.ODOO_URL!;
const ODOO_DB = process.env.ODOO_DB!;

type BrandMetrics = {
  brandId: number;
  brandName: string;
  revenue: number;
  cost: number;
  margin: number;
  profitPercentage: number;
  quantitySold: number;
  avgSellingPrice: number;
  productCount: number; // Number of different products sold
};

type PeriodData = {
  winterSales: Record<number, BrandMetrics>;
  winterRegular: Record<number, BrandMetrics>;
  summerSales: Record<number, BrandMetrics>;
  summerRegular: Record<number, BrandMetrics>;
};

type BrandPerformanceResponse = {
  year: number;
  periods: PeriodData;
  brandList: Array<{ id: number; name: string }>;
  totalRevenue: number;
};

// Helper to determine period based on date
function getPeriod(dateStr: string, year: number): 'winterSales' | 'winterRegular' | 'summerSales' | 'summerRegular' | null {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();
  
  // Winter Sales: Jan 2-31 (or Jan 3 if Jan 2 is Sunday)
  // Check if Jan 2 is Sunday
  const jan2 = new Date(year, 0, 2);
  const winterSalesStart = jan2.getDay() === 0 ? 3 : 2;
  
  if (month === 1 && day >= winterSalesStart && day <= 31) {
    return 'winterSales';
  }
  
  // Summer Sales: Jul 1-31 (or Jun 30 if it starts Sunday)
  // Check if Jun 30 is Sunday
  const jun30 = new Date(year, 5, 30);
  const summerSalesStartsInJune = jun30.getDay() === 0;
  
  if (summerSalesStartsInJune && month === 6 && day === 30) {
    return 'summerSales';
  }
  if (month === 7 && day <= 31) {
    return 'summerSales';
  }
  
  // Winter Regular: Feb 1 - Jun 30 (or Jul 1 if summer sales started Jun 30)
  if (summerSalesStartsInJune) {
    if ((month >= 2 && month <= 6) || (month === 7 && day === 1)) {
      return 'winterRegular';
    }
  } else {
    if (month >= 2 && month <= 6) {
      return 'winterRegular';
    }
  }
  
  // Summer Regular: Aug 1 - Dec 31
  if (month >= 8 && month <= 12) {
    return 'summerRegular';
  }
  
  // Jan 1 (New Year's Day) goes to Summer Regular of previous period cycle
  if (month === 1 && day === 1) {
    return 'summerRegular';
  }
  
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, password, year } = req.body;

  if (!uid || !password || !year) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    console.log(`🔍 Fetching brand performance for year ${year}...`);

    // STEP 1: Get MERK attribute
    const merkAttributePayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          ODOO_DB,
          uid,
          password,
          'product.attribute',
          'search_read',
          [[['name', '=', 'MERK']]],
          { fields: ['id', 'name'], limit: 1 },
        ],
      },
      id: Date.now(),
    };
    const merkAttrRes = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(merkAttributePayload),
    });
    const merkAttrJson = await merkAttrRes.json();
    const merkAttributes = merkAttrJson.result || [];
    
    if (!merkAttributes.length) {
      return res.status(404).json({ error: 'MERK attribute not found' });
    }
    
    const merkAttributeId = merkAttributes[0].id;
    console.log(`✅ Found MERK attribute: ${merkAttributeId}`);

    // STEP 2: Get all brand values
    const brandValuesPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          ODOO_DB,
          uid,
          password,
          'product.attribute.value',
          'search_read',
          [[['attribute_id', '=', merkAttributeId]]],
          { fields: ['id', 'name'], limit: 200 },
        ],
      },
      id: Date.now(),
    };
    const brandValuesRes = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(brandValuesPayload),
    });
    const brandValuesJson = await brandValuesRes.json();
    const allBrands = brandValuesJson.result || [];
    console.log(`✅ Found ${allBrands.length} brands`);

    // Create brand lookup
    const brandMap: Record<number, string> = {};
    allBrands.forEach((brand: { id: number; name: string }) => {
      brandMap[brand.id] = brand.name;
    });

    // STEP 3: Get all product templates with their attribute lines
    const productTemplatesPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          ODOO_DB,
          uid,
          password,
          'product.template',
          'search_read',
          [[]],
          { fields: ['id', 'name', 'attribute_line_ids'], limit: 10000 },
        ],
      },
      id: Date.now(),
    };
    const productTemplatesRes = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productTemplatesPayload),
    });
    const productTemplatesJson = await productTemplatesRes.json();
    const productTemplates = productTemplatesJson.result || [];
    console.log(`✅ Found ${productTemplates.length} product templates`);

    // Get all attribute line IDs
    const allAttributeLineIds: number[] = [];
    productTemplates.forEach((tmpl: { id: number; attribute_line_ids?: number[] }) => {
      if (tmpl.attribute_line_ids && Array.isArray(tmpl.attribute_line_ids)) {
        allAttributeLineIds.push(...tmpl.attribute_line_ids);
      }
    });

    // STEP 4: Get attribute lines to map templates to brands
    const attributeLinesPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          ODOO_DB,
          uid,
          password,
          'product.template.attribute.line',
          'search_read',
          [[['id', 'in', allAttributeLineIds], ['attribute_id', '=', merkAttributeId]]],
          { fields: ['id', 'attribute_id', 'value_ids', 'product_tmpl_id'], limit: 20000 },
        ],
      },
      id: Date.now(),
    };
    const attributeLinesRes = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attributeLinesPayload),
    });
    const attributeLinesJson = await attributeLinesRes.json();
    const attributeLines = attributeLinesJson.result || [];
    console.log(`✅ Found ${attributeLines.length} MERK attribute lines`);

    // Map product_tmpl_id to brand IDs
    const templateToBrand: Record<number, number> = {};
    attributeLines.forEach((line: { product_tmpl_id: [number, string]; value_ids?: number[] }) => {
      const tmplId = line.product_tmpl_id[0];
      if (line.value_ids && line.value_ids.length > 0) {
        templateToBrand[tmplId] = line.value_ids[0]; // Take first brand value
      }
    });

    // STEP 5: Get all product variants with their template references
    const productVariantsPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          ODOO_DB,
          uid,
          password,
          'product.product',
          'search_read',
          [[]],
          { fields: ['id', 'product_tmpl_id', 'standard_price', 'list_price'], limit: 20000 },
        ],
      },
      id: Date.now(),
    };
    const productVariantsRes = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productVariantsPayload),
    });
    const productVariantsJson = await productVariantsRes.json();
    const productVariants = productVariantsJson.result || [];
    console.log(`✅ Found ${productVariants.length} product variants`);

    // Map variant ID to brand ID and prices
    const variantToBrand: Record<number, { brandId: number; cost: number }> = {};
    productVariants.forEach((variant: { id: number; product_tmpl_id: [number, string]; standard_price?: number; list_price?: number }) => {
      const tmplId = variant.product_tmpl_id[0];
      const brandId = templateToBrand[tmplId];
      if (brandId) {
        variantToBrand[variant.id] = {
          brandId,
          cost: variant.standard_price || 0,
        };
      }
    });

    // STEP 6: Get orders for the year
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    
    const ordersPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          ODOO_DB,
          uid,
          password,
          'pos.order',
          'search_read',
          [[['date_order', '>=', startDate], ['date_order', '<=', endDate + ' 23:59:59']]],
          { fields: ['id', 'date_order'], limit: 50000 },
        ],
      },
      id: Date.now(),
    };
    const ordersRes = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ordersPayload),
    });
    const ordersJson = await ordersRes.json();
    const orders = ordersJson.result || [];
    console.log(`✅ Found ${orders.length} orders`);

      const orderIdToDate: Record<number, string> = {};
      const orderIds: number[] = orders.map((order: { id: number; date_order: string }) => {
        orderIdToDate[order.id] = order.date_order;
        return order.id;
      });

    if (orderIds.length === 0) {
      return res.status(200).json({
        year,
        periods: {
          winterSales: {},
          winterRegular: {},
          summerSales: {},
          summerRegular: {},
        },
        brandList: allBrands.map((b: { id: number; name: string }) => ({ id: b.id, name: b.name })),
        totalRevenue: 0,
      });
    }

    // STEP 7: Get order lines
    const linesPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          ODOO_DB,
          uid,
          password,
          'pos.order.line',
          'search_read',
          [[['order_id', 'in', orderIds]]],
          { fields: ['id', 'product_id', 'qty', 'order_id', 'price_subtotal_incl'], limit: 100000 },
        ],
      },
      id: Date.now(),
    };
    const linesRes = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(linesPayload),
    });
    const linesJson = await linesRes.json();
    const allLines = linesJson.result || [];
    console.log(`✅ Found ${allLines.length} order lines`);

    // STEP 8: Process data by period and brand
    const periods: PeriodData = {
      winterSales: {},
      winterRegular: {},
      summerSales: {},
      summerRegular: {},
    };

    // Initialize brand metrics
    const initBrandMetrics = (brandId: number): BrandMetrics => ({
      brandId,
      brandName: brandMap[brandId] || 'Unknown',
      revenue: 0,
      cost: 0,
      margin: 0,
      profitPercentage: 0,
      quantitySold: 0,
      avgSellingPrice: 0,
      productCount: 0,
    });

    // Track unique products per brand per period
    const periodProductSets: Record<string, Record<number, Set<number>>> = {
      winterSales: {},
      winterRegular: {},
      summerSales: {},
      summerRegular: {},
    };

    allLines.forEach((line: { order_id?: [number, string]; product_id?: [number, string]; qty?: number; price_subtotal_incl?: number }) => {
      const orderId = line.order_id?.[0];
      const productId = line.product_id?.[0];
      
      if (!orderId || !productId) return;

      const dateStr = orderIdToDate[orderId];
      if (!dateStr) return;

      const period = getPeriod(dateStr, year);
      if (!period) return;

      const brandInfo = variantToBrand[productId];
      if (!brandInfo) return; // Product doesn't have a brand

      const { brandId, cost } = brandInfo;
      const qty = line.qty || 0;
      const revenueInclTax = line.price_subtotal_incl || 0;
      // Exclude 21% BTW from revenue
      const revenue = revenueInclTax / 1.21;
      const totalCost = cost * qty;

      // Initialize brand metrics if not exists
      if (!periods[period][brandId]) {
        periods[period][brandId] = initBrandMetrics(brandId);
      }
      if (!periodProductSets[period][brandId]) {
        periodProductSets[period][brandId] = new Set();
      }

      // Accumulate metrics
      periods[period][brandId].revenue += revenue;
      periods[period][brandId].cost += totalCost;
      periods[period][brandId].quantitySold += qty;
      periodProductSets[period][brandId].add(productId);
    });

    // Calculate derived metrics
    let totalRevenue = 0;
    Object.keys(periods).forEach((periodKey) => {
      const period = periods[periodKey as keyof PeriodData];
      Object.keys(period).forEach((brandIdStr) => {
        const brandId = Number(brandIdStr);
        const metrics = period[brandId];
        
        metrics.margin = metrics.revenue - metrics.cost;
        metrics.profitPercentage = metrics.revenue > 0 ? (metrics.margin / metrics.revenue) * 100 : 0;
        metrics.avgSellingPrice = metrics.quantitySold > 0 ? metrics.revenue / metrics.quantitySold : 0;
        metrics.productCount = periodProductSets[periodKey as keyof typeof periodProductSets][brandId]?.size || 0;
        
        totalRevenue += metrics.revenue;
      });
    });

    console.log('✅ Brand performance calculated successfully!');

    const response: BrandPerformanceResponse = {
      year,
      periods,
      brandList: allBrands.map((b: { id: number; name: string }) => ({ id: b.id, name: b.name })),
      totalRevenue,
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('❌ API error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

