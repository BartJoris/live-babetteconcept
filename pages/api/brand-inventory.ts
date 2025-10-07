import type { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = process.env.ODOO_URL!;
const ODOO_DB = process.env.ODOO_DB!;

type BrandInventoryMetrics = {
  brandId: number;
  brandName: string;
  currentStock: number;
  openingStock: number; // Stock at period start (from stock.move)
  stockIn: number; // Total entries (purchases, adjustments in)
  stockInPurchases: number; // Purchases only
  stockInAdjustments: number; // Adjustments in
  stockOut: number; // Total exits (sales, adjustments out)
  stockOutSales: number; // Sales only (from POS)
  stockOutAdjustments: number; // Adjustments out
  soldRegular: number;
  soldSales: number;
  totalSold: number;
  sellThroughRate: number;
  stockValue: number;
  calculatedClosing: number; // Opening + In - Out
  stockDiscrepancy: number; // Difference between calculated and actual
  status: 'hit' | 'good' | 'slow' | 'dead';
  productCount: number;
};

type SeasonData = {
  winter: Record<number, BrandInventoryMetrics>;
  summer: Record<number, BrandInventoryMetrics>;
};

type BrandInventoryResponse = {
  year: number;
  seasons: SeasonData;
  brandList: Array<{ id: number; name: string }>;
  totalStockValue: number;
  avgSellThrough: number;
};

// Helper to determine period and season
function getPeriodAndSeason(dateStr: string, year: number): { 
  period: 'winterSales' | 'winterRegular' | 'summerSales' | 'summerRegular' | null;
  season: 'winter' | 'summer' | null;
} {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();
  
  // Winter Sales: Jan 2-31
  const jan2 = new Date(year, 0, 2);
  const winterSalesStart = jan2.getDay() === 0 ? 3 : 2;
  
  if (month === 1 && day >= winterSalesStart && day <= 31) {
    return { period: 'winterSales', season: 'winter' };
  }
  
  // Summer Sales: Jul 1-31 (or Jun 30)
  const jun30 = new Date(year, 5, 30);
  const summerSalesStartsInJune = jun30.getDay() === 0;
  
  if (summerSalesStartsInJune && month === 6 && day === 30) {
    return { period: 'summerSales', season: 'summer' };
  }
  if (month === 7 && day <= 31) {
    return { period: 'summerSales', season: 'summer' };
  }
  
  // Winter Regular: Feb 1 - Jun 30
  if (month >= 2 && month <= 6) {
    return { period: 'winterRegular', season: 'winter' };
  }
  
  // Summer Regular: Aug 1 - Dec 31
  if (month >= 8 && month <= 12) {
    return { period: 'summerRegular', season: 'summer' };
  }
  
  // Jan 1
  if (month === 1 && day === 1) {
    return { period: 'summerRegular', season: 'summer' };
  }
  
  return { period: null, season: null };
}

// Get season date ranges
function getSeasonDateRanges(year: number, season: 'winter' | 'summer') {
  if (season === 'winter') {
    const jan2 = new Date(year, 0, 2);
    const winterSalesStart = jan2.getDay() === 0 ? 3 : 2;
    return {
      start: `${year}-01-${String(winterSalesStart).padStart(2, '0')}`,
      end: `${year}-06-30`,
    };
  } else {
    const jun30 = new Date(year, 5, 30);
    const summerSalesStartsInJune = jun30.getDay() === 0;
    return {
      start: summerSalesStartsInJune ? `${year}-06-30` : `${year}-07-01`,
      end: `${year}-12-31`,
    };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, password, year, season } = req.body;

  if (!uid || !password || !year) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const selectedSeason: 'winter' | 'summer' | 'both' = season || 'both';

  try {
    console.log(`🔍 Fetching brand inventory for ${selectedSeason} ${year}...`);

    // STEP 1: Get MERK attribute and brands (reuse from brand-performance)
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

    const brandMap: Record<number, string> = {};
    allBrands.forEach((brand: any) => {
      brandMap[brand.id] = brand.name;
    });

    // STEP 3: Get product templates and map to brands
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
          { fields: ['id', 'attribute_line_ids'], limit: 10000 },
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

    const allAttributeLineIds: number[] = [];
    productTemplates.forEach((tmpl: any) => {
      if (tmpl.attribute_line_ids && Array.isArray(tmpl.attribute_line_ids)) {
        allAttributeLineIds.push(...tmpl.attribute_line_ids);
      }
    });

    // STEP 4: Get attribute lines for MERK
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
          { fields: ['id', 'value_ids', 'product_tmpl_id'], limit: 20000 },
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

    const templateToBrand: Record<number, number> = {};
    attributeLines.forEach((line: any) => {
      const tmplId = line.product_tmpl_id[0];
      if (line.value_ids && line.value_ids.length > 0) {
        templateToBrand[tmplId] = line.value_ids[0];
      }
    });

    // STEP 5: Get all product variants with stock and cost
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
          { fields: ['id', 'product_tmpl_id', 'standard_price', 'qty_available'], limit: 20000 },
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

    // Map variant to brand with stock and cost info
    const variantToBrand: Record<number, { 
      brandId: number; 
      cost: number; 
      currentStock: number;
    }> = {};
    
    productVariants.forEach((variant: any) => {
      const tmplId = variant.product_tmpl_id[0];
      const brandId = templateToBrand[tmplId];
      if (brandId) {
        variantToBrand[variant.id] = {
          brandId,
          cost: variant.standard_price || 0,
          currentStock: variant.qty_available || 0,
        };
      }
    });

    // STEP 6: Get sales data per season
    const seasons: SeasonData = {
      winter: {},
      summer: {},
    };

    const seasonsToProcess: Array<'winter' | 'summer'> = 
      selectedSeason === 'both' ? ['winter', 'summer'] : [selectedSeason];

    for (const currentSeason of seasonsToProcess) {
      const dateRange = getSeasonDateRanges(year, currentSeason);
      
      // Get orders for this season
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
            [[['date_order', '>=', dateRange.start], ['date_order', '<=', dateRange.end + ' 23:59:59']]],
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

      const orderIdToDate: Record<number, string> = {};
      const orderIds: number[] = orders.map((order: any) => {
        orderIdToDate[order.id] = order.date_order;
        return order.id;
      });

      if (orderIds.length === 0) continue;

      // Get order lines
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
            { fields: ['id', 'product_id', 'qty', 'order_id'], limit: 100000 },
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

      // Initialize metrics
      const initMetrics = (brandId: number): BrandInventoryMetrics => ({
        brandId,
        brandName: brandMap[brandId] || 'Unknown',
        currentStock: 0,
        openingStock: 0,
        stockIn: 0,
        stockInPurchases: 0,
        stockInAdjustments: 0,
        stockOut: 0,
        stockOutSales: 0,
        stockOutAdjustments: 0,
        soldRegular: 0,
        soldSales: 0,
        totalSold: 0,
        sellThroughRate: 0,
        stockValue: 0,
        calculatedClosing: 0,
        stockDiscrepancy: 0,
        status: 'dead',
        productCount: 0,
      });

      // Track products per brand
      const brandProducts: Record<number, Set<number>> = {};

      // STEP 6a: Get stock location IDs (we need to know warehouse locations)
      console.log('🔍 Fetching stock locations...');
      const locationsPayload = {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            ODOO_DB,
            uid,
            password,
            'stock.location',
            'search_read',
            [[['usage', '=', 'internal']]],
            { fields: ['id', 'name', 'complete_name'], limit: 100 },
          ],
        },
        id: Date.now(),
      };
      const locationsRes = await fetch(ODOO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(locationsPayload),
      });
      const locationsJson = await locationsRes.json();
      const locations = locationsJson.result || [];
      const internalLocationIds = locations.map((loc: any) => loc.id);
      console.log(`✅ Found ${internalLocationIds.length} internal locations`);

      // STEP 6b: Get stock moves for the period
      console.log('🔍 Fetching stock moves for period...');
      const periodStart = dateRange.start;
      const periodEnd = dateRange.end;
      
      // Get opening stock (stock at period start)
      // We need moves BEFORE the period to calculate opening balance
      const beforePeriodStart = `${year}-01-01`; // Start of year or earlier
      
      const stockMovesPayload = {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            ODOO_DB,
            uid,
            password,
            'stock.move',
            'search_read',
            [[
              ['date', '<=', periodEnd + ' 23:59:59'],
              ['state', '=', 'done'],
              '|',
              ['location_id', 'in', internalLocationIds],
              ['location_dest_id', 'in', internalLocationIds]
            ]],
            { 
              fields: [
                'id', 'product_id', 'product_qty', 'date', 
                'location_id', 'location_dest_id', 
                'picking_id', 'origin', 'reference'
              ], 
              limit: 100000 
            },
          ],
        },
        id: Date.now(),
      };
      const stockMovesRes = await fetch(ODOO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stockMovesPayload),
      });
      const stockMovesJson = await stockMovesRes.json();
      const stockMoves = stockMovesJson.result || [];
      console.log(`✅ Found ${stockMoves.length} stock moves`);

      // Process stock moves
      const productStockHistory: Record<number, {
        openingStock: number;
        movesIn: number;
        movesOut: number;
        purchasesIn: number;
        adjustmentsIn: number;
        salesOut: number;
        adjustmentsOut: number;
      }> = {};

      stockMoves.forEach((move: any) => {
        const productId = move.product_id?.[0];
        if (!productId) return;

        const brandInfo = variantToBrand[productId];
        if (!brandInfo) return;

        const moveDate = move.date;
        const qty = move.product_qty || 0;
        const locationId = move.location_id?.[0];
        const destLocationId = move.location_dest_id?.[0];
        const origin = (move.origin || '').toLowerCase();
        const reference = (move.reference || '').toLowerCase();

        if (!productStockHistory[productId]) {
          productStockHistory[productId] = {
            openingStock: 0,
            movesIn: 0,
            movesOut: 0,
            purchasesIn: 0,
            adjustmentsIn: 0,
            salesOut: 0,
            adjustmentsOut: 0,
          };
        }

        const isInternal = internalLocationIds.includes(locationId);
        const isDestInternal = internalLocationIds.includes(destLocationId);
        const isBeforePeriod = moveDate < periodStart;
        const isInPeriod = moveDate >= periodStart && moveDate <= periodEnd + ' 23:59:59';

        // Determine move type
        const isPurchase = reference.includes('receipt') || reference.includes('in/') || origin.includes('purchase');
        const isSale = reference.includes('pos') || reference.includes('out/') || origin.includes('pos');
        const isAdjustment = reference.includes('adj') || reference.includes('inventory') || origin.includes('inventory');

        if (isBeforePeriod) {
          // Movements before period affect opening stock
          if (!isInternal && isDestInternal) {
            // Stock coming in
            productStockHistory[productId].openingStock += qty;
          } else if (isInternal && !isDestInternal) {
            // Stock going out
            productStockHistory[productId].openingStock -= qty;
          }
        } else if (isInPeriod) {
          // Movements during period
          if (!isInternal && isDestInternal) {
            // Stock coming in during period
            productStockHistory[productId].movesIn += qty;
            if (isPurchase) {
              productStockHistory[productId].purchasesIn += qty;
            } else if (isAdjustment) {
              productStockHistory[productId].adjustmentsIn += qty;
            }
          } else if (isInternal && !isDestInternal) {
            // Stock going out during period
            productStockHistory[productId].movesOut += qty;
            if (isSale) {
              productStockHistory[productId].salesOut += qty;
            } else if (isAdjustment) {
              productStockHistory[productId].adjustmentsOut += qty;
            }
          }
        }
      });

      // Process sales data from POS
      allLines.forEach((line: any) => {
        const orderId = line.order_id?.[0];
        const productId = line.product_id?.[0];
        
        if (!orderId || !productId) return;

        const dateStr = orderIdToDate[orderId];
        if (!dateStr) return;

        const { period } = getPeriodAndSeason(dateStr, year);
        if (!period) return;

        const brandInfo = variantToBrand[productId];
        if (!brandInfo) return;

        const { brandId } = brandInfo;
        const qty = line.qty || 0;

        if (!seasons[currentSeason][brandId]) {
          seasons[currentSeason][brandId] = initMetrics(brandId);
        }
        if (!brandProducts[brandId]) {
          brandProducts[brandId] = new Set();
        }

        brandProducts[brandId].add(productId);
        seasons[currentSeason][brandId].totalSold += qty;

        // Separate regular vs sales period
        if (period.includes('Sales')) {
          seasons[currentSeason][brandId].soldSales += qty;
        } else {
          seasons[currentSeason][brandId].soldRegular += qty;
        }
      });

      // Aggregate stock movement data by brand
      Object.entries(productStockHistory).forEach(([productIdStr, history]) => {
        const productId = Number(productIdStr);
        const brandInfo = variantToBrand[productId];
        if (!brandInfo) return;

        const { brandId, cost, currentStock } = brandInfo;

        if (!seasons[currentSeason][brandId]) {
          seasons[currentSeason][brandId] = initMetrics(brandId);
        }
        if (!brandProducts[brandId]) {
          brandProducts[brandId] = new Set();
        }

        brandProducts[brandId].add(productId);

        // Aggregate opening stock
        seasons[currentSeason][brandId].openingStock += history.openingStock;
        
        // Aggregate stock movements
        seasons[currentSeason][brandId].stockIn += history.movesIn;
        seasons[currentSeason][brandId].stockInPurchases += history.purchasesIn;
        seasons[currentSeason][brandId].stockInAdjustments += history.adjustmentsIn;
        
        seasons[currentSeason][brandId].stockOut += history.movesOut;
        seasons[currentSeason][brandId].stockOutSales += history.salesOut;
        seasons[currentSeason][brandId].stockOutAdjustments += history.adjustmentsOut;

        // Add current stock and value
        seasons[currentSeason][brandId].currentStock += currentStock;
        seasons[currentSeason][brandId].stockValue += currentStock * cost;
      });

      // Calculate derived metrics
      Object.keys(seasons[currentSeason]).forEach((brandIdStr) => {
        const brandId = Number(brandIdStr);
        const metrics = seasons[currentSeason][brandId];
        
        // Calculated closing = opening + in - out
        metrics.calculatedClosing = metrics.openingStock + metrics.stockIn - metrics.stockOut;
        
        // Discrepancy = actual vs calculated
        metrics.stockDiscrepancy = metrics.currentStock - metrics.calculatedClosing;
        
        // Sell-through rate based on opening stock + purchases
        const availableStock = metrics.openingStock + metrics.stockIn;
        metrics.sellThroughRate = availableStock > 0 
          ? (metrics.totalSold / availableStock) * 100 
          : 0;

        metrics.productCount = brandProducts[brandId]?.size || 0;

        // Determine status
        if (metrics.sellThroughRate >= 80) {
          metrics.status = 'hit';
        } else if (metrics.sellThroughRate >= 60) {
          metrics.status = 'good';
        } else if (metrics.sellThroughRate >= 40) {
          metrics.status = 'slow';
        } else {
          metrics.status = 'dead';
        }
      });
    }

    // Calculate summary stats
    let totalStockValue = 0;
    let totalSellThrough = 0;
    let brandCount = 0;

    Object.values(seasons).forEach(season => {
      Object.values(season).forEach(metrics => {
        totalStockValue += metrics.stockValue;
        totalSellThrough += metrics.sellThroughRate;
        brandCount++;
      });
    });

    const avgSellThrough = brandCount > 0 ? totalSellThrough / brandCount : 0;

    console.log('✅ Brand inventory calculated successfully!');

    const response: BrandInventoryResponse = {
      year,
      seasons,
      brandList: allBrands.map((b: any) => ({ id: b.id, name: b.name })),
      totalStockValue,
      avgSellThrough,
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

