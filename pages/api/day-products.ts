import type { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = process.env.ODOO_URL!;
const ODOO_DB = process.env.ODOO_DB!;

type OrderLine = {
  id: number;
  product_id?: [number, string];
  qty: number;
  order_id?: [number, string];
  price_unit?: number;
  price_subtotal?: number;
  price_subtotal_incl?: number;
  discount?: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  const { uid, password, date } = req.body;

  if (!uid || !password || !date) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
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
    const mainCategories = (mainCategoryJson.result || []) as { id: number; name: string }[];
    if (!mainCategories.length) {
      return res.status(200).json([]);
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
    const subCategories = (subCategoryJson.result || []) as { id: number; name: string; parent_id: [number, string] }[];
    const salesCategoryIds = [mainCategoryId, ...subCategories.map(c => c.id)];

    // 3. Haal alle orders op van de geselecteerde dag
    const dayStart = `${date} 00:00:00`;
    const dayEnd = `${date} 23:59:59`;
    
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
          [[['date_order', '>=', dayStart], ['date_order', '<=', dayEnd]]],
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
      return res.status(200).json([]);
    }

    // 4. Haal alle order lines op voor deze orders
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
          { fields: ['id', 'product_id', 'qty', 'order_id', 'price_unit', 'price_subtotal_incl', 'price_subtotal', 'discount'], limit: 10000 },
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

    // 5. Haal alle producten op om categorieën te bepalen
    const productIds = allLines.map(line => line.product_id?.[0]).filter(Boolean);
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
          [[['id', 'in', productIds]]],
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
    const products = (productsJson.result || []) as { id: number; name: string; categ_id: [number, string] }[];
    
    // Maak een map van product ID naar categorie en een set van sales-product-IDs
    const productToCategory: Record<number, string> = {};
    const salesProductIds = new Set<number>();
    products.forEach(product => {
      if (product.categ_id) {
        productToCategory[product.id] = product.categ_id[1];
        if (salesCategoryIds.includes(product.categ_id[0])) {
          salesProductIds.add(product.id);
        }
      }
    });

    // 6. Verwerk de order lines tot product details
    type ProductDetail = {
      id: number;
      name: string;
      qty: number;
      price_unit: number;
      price_subtotal: number;
      is_sales: boolean;
      category: string;
      order_id: number;
      order_time: string;
      price_with_discount: number;
    };

    const productDetails: ProductDetail[] = [];
    
    // Group lines by order_id to see the full order structure
    const orderGroups: Record<number, OrderLine[]> = {};
    allLines.forEach(line => {
      const orderId = line.order_id?.[0];
      if (!orderId) return;
      if (!orderGroups[orderId]) orderGroups[orderId] = [];
      orderGroups[orderId].push(line);
    });
    
    // Process each order separately to handle both discount methods
    Object.entries(orderGroups).forEach(([orderId, lines]) => {
      const orderDate = orderIdToDate[parseInt(orderId)];
      
      // Separate product lines from discount lines
      const productLines = lines.filter(line => {
        const name = line.product_id?.[1] || '';
        return !name.toLowerCase().includes('summersales') && 
               !name.toLowerCase().includes('korting') &&
               !name.toLowerCase().includes('discount');
      });
      
      const discountLines = lines.filter(line => {
        const name = line.product_id?.[1] || '';
        return name.toLowerCase().includes('summersales') || 
               name.toLowerCase().includes('korting') ||
               name.toLowerCase().includes('discount');
      });
      
      // Calculate total discount amount from discount lines
      const totalDiscountAmount = discountLines.reduce((sum, line) => {
        const priceUnit = (line as OrderLine & { price_unit?: number }).price_unit || 0;
        return sum + Math.abs(priceUnit);
      }, 0);
      
      // Calculate total original value of sales products in this order
      const salesProductLines = productLines.filter(line => {
        const productId = line.product_id?.[0];
        const product = products.find(p => p.id === productId);
        const categoryId = product?.categ_id?.[0];
        return categoryId ? salesCategoryIds.includes(categoryId) : false;
      });
      
      const totalSalesValue = salesProductLines.reduce((sum, line) => {
        const priceUnit = (line as OrderLine & { price_unit?: number }).price_unit || 0;
        const qty = line.qty || 0;
        return sum + (priceUnit * qty);
      }, 0);
      
      // Process each product line
      productLines.forEach(line => {
        const productId = line.product_id?.[0];
        if (!productId) return;
        
        const name = line.product_id?.[1] || '';
        const qty = line.qty || 0;
        if (qty === 0) return;
        
        const priceUnit = (line as OrderLine & { price_unit?: number }).price_unit || 0;
        const priceSubtotalIncl = (line as OrderLine & { price_subtotal_incl?: number }).price_subtotal_incl || 0;
        const discount = (line as OrderLine & { discount?: number }).discount || 0;
        
        // Determine if this is a sales product
        const product = products.find(p => p.id === productId);
        const categoryId = product?.categ_id?.[0];
        const isSalesCategory = categoryId ? salesCategoryIds.includes(categoryId) : false;
        
        // A product is considered "sales" if:
        // 1. It's in a sales category, OR
        // 2. It has direct discount applied (discount > 0)
        const isSales = isSalesCategory || discount > 0;
        
        const category = productToCategory[productId] || 'Onbekend';
        
        // Calculate price with discount
        let priceWithDiscount = priceSubtotalIncl / qty;
        
        // Method 1: Direct product discount (discount field > 0)
        if (discount > 0) {
          priceWithDiscount = priceUnit * (1 - discount / 100);
        }
        // Method 2: Order-level discount distribution (for sales products with no direct discount)
        else if (isSales && totalDiscountAmount > 0 && totalSalesValue > 0) {
          const productValue = priceUnit * qty;
          const proportionalDiscount = (productValue / totalSalesValue) * totalDiscountAmount;
          priceWithDiscount = priceUnit - (proportionalDiscount / qty);
        }
        
        productDetails.push({
          id: line.id,
          name,
          qty,
          price_unit: priceUnit,
          price_subtotal: priceSubtotalIncl,
          is_sales: isSales,
          category,
          order_id: parseInt(orderId),
          order_time: orderDate || '',
          price_with_discount: priceWithDiscount,
        });
      });
    });

    // Sorteer op tijd
    productDetails.sort((a, b) => new Date(a.order_time).getTime() - new Date(b.order_time).getTime());

    // 7. Return the product details
    return res.status(200).json(productDetails);

  } catch (error) {
    console.error('❌ API error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
} 