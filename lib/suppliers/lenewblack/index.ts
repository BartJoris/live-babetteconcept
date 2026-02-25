import { parseEuroPrice, determineSizeAttribute, toTitleCase, toSentenceCase } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const text = files['main_csv'] as string;
  if (!text) return [];

  const lines = text.trim().split('\n');
  if (lines.length < 3) return [];

  // First line is order reference (skip), second line is headers, data from line 3
  const headers = lines[1].split(';');
  const products: Record<string, ParsedProduct> = {};

  // Optional price CSV: SKU -> price mapping
  const pdfPrices = new Map<string, number>();
  const priceText = files['price_csv'] as string | undefined;
  if (priceText) {
    const priceLines = priceText.trim().split('\n');
    if (priceLines.length >= 2) {
      const priceHeaders = priceLines[0].split(';').map(h => h.trim());
      const skuColIdx = priceHeaders.findIndex(h => h.toLowerCase() === 'sku');
      const priceColIdx = priceHeaders.findIndex(h =>
        h.toLowerCase() === 'price' || h.toLowerCase() === 'unit price' || h.toLowerCase() === 'net amount'
      );
      if (skuColIdx !== -1 && priceColIdx !== -1) {
        for (let i = 1; i < priceLines.length; i++) {
          const vals = priceLines[i].split(';').map(v => v.trim());
          const sku = vals[skuColIdx] || '';
          const price = parseEuroPrice(vals[priceColIdx] || '0');
          if (sku && price > 0) {
            pdfPrices.set(sku, price);
          }
        }
      }
    }
  }

  for (let i = 2; i < lines.length; i++) {
    const values = lines[i].split(';');
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header.trim()] = values[idx]?.trim() || '';
    });

    const reference = row['Product reference'] || row['SKU'];
    if (!reference) continue;

    if (!products[reference]) {
      const fullName = row['Product name'] || '';
      const color = row['Color name'] || '';
      const description = row['Description'] || '';
      const brandName = row['Brand name'] || '';

      const formattedBrandName = brandName ? toTitleCase(brandName) : '';
      const formattedProductName = fullName ? toSentenceCase(fullName) : '';
      const combinedName = formattedBrandName
        ? `${formattedBrandName} - ${formattedProductName}`
        : formattedProductName;

      const nameLower = brandName.toLowerCase() || fullName.toLowerCase();
      const suggestedBrand = context.brands.find(b =>
        nameLower.includes(b.name.toLowerCase())
      );

      products[reference] = {
        reference,
        name: combinedName,
        originalName: fullName,
        material: description,
        color,
        ecommerceDescription: description,
        variants: [],
        suggestedBrand: suggestedBrand?.name,
        selectedBrand: suggestedBrand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      };
    }

    const netAmount = parseEuroPrice(row['Net amount'] || '0');
    const sku = row['SKU'] || '';
    const pdfPrice = sku && pdfPrices.has(sku) ? pdfPrices.get(sku)! : null;
    const costPrice = pdfPrice || netAmount;

    products[reference].variants.push({
      size: row['Size name'] || '',
      quantity: 0,
      ean: row['EAN13'] || '',
      sku,
      price: costPrice,
      rrp: netAmount * 2.5,
    });
  }

  const productList = Object.values(products);
  productList.forEach(product => {
    product.sizeAttribute = determineSizeAttribute(product.variants);
  });

  return productList;
}

const leNewBlackPlugin: SupplierPlugin = {
  id: 'lenewblack',
  displayName: 'Le New Black',
  brandName: 'Le New Black',
  fileInputs: [
    { id: 'main_csv', label: 'Le New Black CSV', accept: '.csv', required: true, type: 'csv' },
    { id: 'price_csv', label: 'Prijzen CSV (optioneel)', accept: '.csv', required: false, type: 'csv' },
  ],
  parse,
};

export default leNewBlackPlugin;
