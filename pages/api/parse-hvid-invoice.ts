import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import { parseStringPromise } from 'xml2js';

export const config = {
  api: {
    bodyParser: false,
  },
};

interface ProductLine {
  barcode: string;
  sku: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable({});
    const [, files] = await form.parse(req);

    const file = files.file?.[0];
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Read the PDF file
    const pdfBuffer = fs.readFileSync(file.filepath);
    const pdfContent = pdfBuffer.toString('utf-8');

    // Extract XML from PDF (Factur-X format)
    const xmlMatch = pdfContent.match(/<\?xml version.*?<\/rsm:CrossIndustryInvoice>/s);
    
    if (!xmlMatch) {
      return res.status(400).json({ error: 'No embedded XML found in PDF' });
    }

    const xmlContent = xmlMatch[0];
    
    // Parse XML
    const result = await parseStringPromise(xmlContent);
    
    // Extract product lines
    const products: ProductLine[] = [];
    const lineItems = result['rsm:CrossIndustryInvoice']?.['rsm:SupplyChainTradeTransaction']?.[0]?.['ram:IncludedSupplyChainTradeLineItem'];

    if (lineItems) {
      for (const item of lineItems) {
        const product = item['ram:SpecifiedTradeProduct']?.[0];
        const delivery = item['ram:SpecifiedLineTradeDelivery']?.[0];
        const agreement = item['ram:SpecifiedLineTradeAgreement']?.[0];
        const settlement = item['ram:SpecifiedLineTradeSettlement']?.[0];

        const barcode = product?.['ram:GlobalID']?.[0]?.['_'] || product?.['ram:GlobalID']?.[0] || '';
        const sku = product?.['ram:SellerAssignedID']?.[0] || '';
        const name = product?.['ram:Name']?.[0] || '';
        const quantity = parseFloat(delivery?.['ram:BilledQuantity']?.[0]?.['_'] || delivery?.['ram:BilledQuantity']?.[0] || '0');
        const price = parseFloat(agreement?.['ram:NetPriceProductTradePrice']?.[0]?.['ram:ChargeAmount']?.[0] || '0');
        const total = parseFloat(settlement?.['ram:SpecifiedTradeSettlementLineMonetarySummation']?.[0]?.['ram:LineTotalAmount']?.[0] || '0');

        if (barcode) {
          products.push({
            barcode,
            sku,
            name,
            quantity,
            price,
            total
          });
        }
      }
    }

    // Convert to CSV format
    const csvHeader = 'Barcode,SKU,Product Name,Quantity,Price,Total\n';
    const csvRows = products.map(p => 
      `${p.barcode},"${p.sku}","${p.name}",${p.quantity},${p.price},${p.total}`
    ).join('\n');
    const csvContent = csvHeader + csvRows;

    res.status(200).json({
      success: true,
      products,
      csv: csvContent,
      totalProducts: products.length
    });

  } catch (error: any) {
    console.error('Error parsing PDF:', error);
    res.status(500).json({ 
      error: 'Failed to parse PDF', 
      details: error.message 
    });
  }
}

