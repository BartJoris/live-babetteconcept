import type { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = process.env.ODOO_URL!;
const ODOO_DB = process.env.ODOO_DB!;

type SalesProductData = {
  total_sales_products: number;
  total_regular_products: number;
  sales_percentage: number;
  average_sales_per_order: number;
  daily_sales_products: DailySalesProduct[];
  original_sales_value: number;
  received_sales_value: number;
  regular_value: number;
  total_discount: number;
};

type DailySalesProduct = {
  date: string;
  sales_products_count: number;
  total_products_count: number;
  sales_percentage: number;
  order_count: number;
  original_sales_value: number;
  received_sales_value: number;
  regular_value: number;
  total_discount: number;
};

type Category = {
  id: number;
  name: string;
};

type Product = {
  id: number;
  name: string;
  categ_id?: [number, string];
};

type OrderLine = {
  id: number;
  product_id?: [number, string];
  qty: number;
  order_id?: [number, string];
};



export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  const { uid, password, selectedMonth } = req.body;

  if (!uid || !password || !selectedMonth) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    // Haal alle categorieën op
    const allCategoriesPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          ODOO_DB,
          uid,
          password,
          'product.category',
          'search_read',
          [],
          { fields: ['id', 'name'], limit: 1000 },
        ],
      },
      id: Date.now(),
    };
    const allCategoriesRes = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(allCategoriesPayload),
    });
    const allCategoriesJson = await allCategoriesRes.json();
    if (!allCategoriesJson.result) {
      return res.status(500).json({ error: 'Odoo gaf geen categorie-resultaat', odoo: allCategoriesJson });
    }
    // allCategories wordt gebruikt voor debug doeleinden maar is nu verwijderd
    // const allCategories = allCategoriesJson.result as Category[];

    // 1. Zoek de hoofdcategorie 'Solden zomer 2025'
    const mainCategoryPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          ODOO_DB,
          uid,
          password,
          'product.category',
          'search_read',
          [[['name', '=', 'Solden zomer 2025']]],
          { fields: ['id', 'name'], limit: 10 },
        ],
      },
      id: Date.now(),
    };
    const mainCategoryRes = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mainCategoryPayload),
    });
    const mainCategoryJson = await mainCategoryRes.json();
    const mainCategories = (mainCategoryJson.result || []) as Category[];
    if (!mainCategories.length) {
      return res.status(200).json({
        total_sales_products: 0,
        total_regular_products: 0,
        sales_percentage: 0,
        average_sales_per_order: 0,
        daily_sales_products: [],
        original_sales_value: 0,
        received_sales_value: 0,
        regular_value: 0,
        total_discount: 0,
      });
    }
    const mainCategoryId = mainCategories[0].id;

    // 2. Zoek alle subcategorieën waarvan parent_id deze hoofdcategorie is
    const subCategoryPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          ODOO_DB,
          uid,
          password,
          'product.category',
          'search_read',
          [[['parent_id', '=', mainCategoryId]]],
          { fields: ['id', 'name', 'parent_id'], limit: 100 },
        ],
      },
      id: Date.now(),
    };
    const subCategoryRes = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subCategoryPayload),
    });
    const subCategoryJson = await subCategoryRes.json();
    const subCategories = (subCategoryJson.result || []) as Category[];
    // Gebruik de subcategorieën (en eventueel de hoofdcategorie zelf)
    const salesCategoryIds = [mainCategoryId, ...subCategories.map(c => c.id)];

    if (salesCategoryIds.length === 0) {
      return res.status(200).json({
        total_sales_products: 0,
        total_regular_products: 0,
        sales_percentage: 0,
        average_sales_per_order: 0,
        daily_sales_products: [],
        original_sales_value: 0,
        received_sales_value: 0,
        regular_value: 0,
        total_discount: 0,
      });
    }

    // 1. Bepaal de maandgrenzen
    const [year, month] = selectedMonth.split('-').map(Number);
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEnd = new Date(year, month, 0).toISOString().split('T')[0];

    // 2. Haal alle orders op van de geselecteerde maand
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
          [[['date_order', '>=', monthStart], ['date_order', '<=', monthEnd + ' 23:59:59']]],
          { fields: ['id', 'date_order'], context: {} },
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
    const orderIds = orders.map((order: { id: number; date_order: string }) => {
      orderIdToDate[order.id] = order.date_order;
      return order.id;
    });

    if (orderIds.length === 0) {
      return res.status(200).json({
        total_sales_products: 0,
        total_regular_products: 0,
        sales_percentage: 0,
        average_sales_per_order: 0,
        daily_sales_products: [],
        original_sales_value: 0,
        received_sales_value: 0,
        regular_value: 0,
        total_discount: 0,
      });
    }

    // 3. Haal alleen order lines op waarvan order_id in deze lijst zit
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
          { fields: ['id', 'product_id', 'qty', 'order_id', 'price_unit', 'price_subtotal_incl'], limit: 10000 },
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
    const allLines = (linesJson.result || []) as OrderLine[];

    // 4. Haal sales-producten op
    const productsPayload = {
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
          [[['categ_id', 'in', salesCategoryIds]]],
          { fields: ['id', 'name', 'categ_id'], limit: 10000 },
        ],
      },
      id: Date.now(),
    };
    const productsRes = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productsPayload),
    });
    const productsJson = await productsRes.json();
    const salesProducts = (productsJson.result || []) as Product[];
    const salesProductIds = salesProducts.map((prod: Product) => prod.id);

    // 5. Analyse/groepering per dag
    const dailyData: Record<string, { salesProducts: number; regularProducts: number; orderIds: Set<number> }> = {};
    allLines.forEach((line: OrderLine) => {
      const orderId = line.order_id?.[0];
      if (!orderId) return;
      const dateStr = orderIdToDate[orderId];
      if (!dateStr) return;
      let datePart = '';
      if (dateStr.includes('T')) {
        datePart = dateStr.split('T')[0];
      } else if (dateStr.includes(' ')) {
        datePart = dateStr.split(' ')[0];
      } else {
        datePart = dateStr;
      }
      // Filter kortingregels uit
      const name = (line.product_id?.[1] || '').toLowerCase();
      const isDiscount = name.includes('summersales') || name.includes('korting');
      if (isDiscount) return;
      if (!dailyData[datePart]) {
        dailyData[datePart] = { salesProducts: 0, regularProducts: 0, orderIds: new Set() };
      }
      const productId = line.product_id?.[0];
      const qty = line.qty || 0;
      if (productId && salesProductIds.includes(productId)) {
        dailyData[datePart].salesProducts += qty;
      } else {
        dailyData[datePart].regularProducts += qty;
      }
      dailyData[datePart].orderIds.add(orderId);
    });
    const dailySalesProducts: DailySalesProduct[] = Object.entries(dailyData)
      .map(([date, data]) => {
        // Verzamel alle order lines van deze dag
        const linesOnDay = allLines.filter((line: OrderLine) => {
          const orderId = line.order_id?.[0];
          if (!orderId) return false;
          const dateStr = orderIdToDate[orderId];
          if (!dateStr) return false;
          let datePart = '';
          if (dateStr.includes('T')) {
            datePart = dateStr.split('T')[0];
          } else if (dateStr.includes(' ')) {
            datePart = dateStr.split(' ')[0];
          } else {
            datePart = dateStr;
          }
          return datePart === date;
        });
        let salesValue = 0;
        let regularValue = 0;
        let totalDiscount = 0;
        linesOnDay.forEach(line => {
          const productId = line.product_id?.[0];
          const isSales = productId ? salesProductIds.includes(productId) : false;
          const qty = line.qty || 0;
          const name = (line.product_id?.[1] || '').toLowerCase();
          const subtotal = (typeof (line as OrderLine & { price_subtotal_incl?: number; price_unit?: number }).price_subtotal_incl === 'number'
            ? (line as OrderLine & { price_subtotal_incl?: number; price_unit?: number }).price_subtotal_incl
            : ((line as OrderLine & { price_subtotal_incl?: number; price_unit?: number }).price_unit || 0) * qty) || 0;
          const isDiscount = name.includes('summersales') || name.includes('korting');
          if (isDiscount) {
            totalDiscount += subtotal;
          } else if (isSales) {
            salesValue += subtotal;
          } else {
            regularValue += subtotal;
          }
        });
        const ontvangenSales = salesValue + totalDiscount;
        return {
          date,
          sales_products_count: data.salesProducts,
          total_products_count: data.salesProducts + data.regularProducts,
          sales_percentage: data.salesProducts + data.regularProducts > 0
            ? (data.salesProducts / (data.salesProducts + data.regularProducts)) * 100
            : 0,
          order_count: data.orderIds.size,
          original_sales_value: salesValue,
          received_sales_value: ontvangenSales,
          regular_value: regularValue,
          total_discount: totalDiscount,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    const totalSalesProducts = dailySalesProducts.reduce((sum, day) => sum + day.sales_products_count, 0);
    const totalRegularProducts = dailySalesProducts.reduce((sum, day) => sum + (day.total_products_count - day.sales_products_count), 0);
    const totalProducts = totalSalesProducts + totalRegularProducts;
    const salesPercentage = totalProducts > 0 ? (totalSalesProducts / totalProducts) * 100 : 0;
    const totalOrders = dailySalesProducts.reduce((sum, day) => sum + day.order_count, 0);
    const averageSalesPerOrder = totalOrders > 0 ? totalSalesProducts / totalOrders : 0;

    // Bereken waardes over alle order lines van de maand
    let salesValue = 0;
    let regularValue = 0;
    let totalDiscount = 0;
    allLines.forEach(line => {
      const productId = line.product_id?.[0];
      const isSales = productId ? salesProductIds.includes(productId) : false;
      const qty = line.qty || 0;
      const name = (line.product_id?.[1] || '').toLowerCase();
      // Gebruik price_subtotal_incl indien beschikbaar
      const subtotal = (typeof (line as OrderLine & { price_subtotal_incl?: number; price_unit?: number }).price_subtotal_incl === 'number'
        ? (line as OrderLine & { price_subtotal_incl?: number; price_unit?: number }).price_subtotal_incl
        : ((line as OrderLine & { price_subtotal_incl?: number; price_unit?: number }).price_unit || 0) * qty) || 0;
      // Kortingregel?
      const isDiscount = name.includes('summersales') || name.includes('korting');
      if (isDiscount) {
        totalDiscount += subtotal;
      } else if (isSales) {
        salesValue += subtotal;
      } else {
        regularValue += subtotal;
      }
    });
    const ontvangenSales = salesValue + totalDiscount;

    const result: SalesProductData = {
      total_sales_products: totalSalesProducts,
      total_regular_products: totalRegularProducts,
      sales_percentage: salesPercentage,
      average_sales_per_order: averageSalesPerOrder,
      daily_sales_products: dailySalesProducts,
      original_sales_value: salesValue,
      received_sales_value: ontvangenSales,
      regular_value: regularValue,
      total_discount: totalDiscount,
    };

    return res.status(200).json(result);

  } catch (error) {
    console.error('❌ API error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
} 