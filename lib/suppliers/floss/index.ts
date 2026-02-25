import { parseCSV, rowToObject, parseEuroPrice, convertSize, determineSizeAttribute, toSentenceCase } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext, EnrichmentResult } from '@/lib/suppliers/types';

interface FlossPdfProduct {
  styleNo: string;
  styleName: string;
  quality: string;
  price: number;
  rrp: number;
  total: number;
  totalQty: number;
  colors: Array<{
    color: string;
    sizes: Array<{ size: string; qty: number }>;
  }>;
}

function parseFlossCSV(text: string, context: ParseContext): ParsedProduct[] {
  const { headers, rows } = parseCSV(text, {
    delimiter: ';',
    multilineQuotes: true,
  });

  if (headers.length === 0 || rows.length === 0) {
    // Try with skipRows=1 for old format with "Table 1" prefix
    const retried = parseCSV(text, {
      delimiter: ';',
      multilineQuotes: true,
      skipRows: 1,
    });
    if (retried.headers.length === 0 || retried.rows.length === 0) return [];
    return parseFlossRows(retried.headers, retried.rows, context);
  }

  // Auto-detect: if first "header" row doesn't contain expected columns, it's old format
  if (!headers.includes('Style No') && !headers.includes('Style Name')) {
    const retried = parseCSV(text, {
      delimiter: ';',
      multilineQuotes: true,
      skipRows: 1,
    });
    if (retried.headers.length === 0) return [];
    return parseFlossRows(retried.headers, retried.rows, context);
  }

  return parseFlossRows(headers, rows, context);
}

function parseFlossRows(headers: string[], rows: string[][], context: ParseContext): ParsedProduct[] {
  if (!headers.includes('Style No') || !headers.includes('Style Name')) return [];

  const isBrunobruno = context.vendorId === 'brunobruno';
  const brandName = isBrunobruno ? 'Brunobruno' : 'Flöss';
  const brand = isBrunobruno
    ? context.findBrand('brunobruno', 'bruno bruno')
    : context.findBrand('flöss', 'floss');

  const products: Record<string, ParsedProduct> = {};

  for (const values of rows) {
    const row = rowToObject(headers, values);

    const styleNo = row['Style No'] || '';
    const styleName = row['Style Name'] || '';
    const color = row['Color'] || '';
    const rawSize = row['Size'] || '';
    const quantity = parseInt(row['Qty'] || '0') || 0;
    const barcode = row['Barcode'] || '';
    const quality = row['Quality'] || '';
    const description = row['Description'] || '';
    const productType = row['Type'] || '';

    const validStyleNo = isBrunobruno ? /^\d{6}-/.test(styleNo) : /^F\d+/.test(styleNo);
    if (!styleNo || !validStyleNo || !styleName) continue;

    const price = parseEuroPrice(row['Wholesale Price EUR'] || '0');
    const rrp = parseEuroPrice(row['Recommended Retail Price EUR'] || '0');
    const size = convertSize(rawSize);

    const colorCode = color.match(/^(\d+)/)?.[1] || '';
    const colorKey = isBrunobruno
      ? colorCode
      : color.trim().toLowerCase().replace(/\s+/g, '-');
    const reference = colorKey ? `${styleNo}_${colorKey}` : styleNo;

    if (!products[reference]) {
      const formattedName = `${brandName} - ${toSentenceCase(styleName)} - ${toSentenceCase(color)}`;
      const ecommerceDesc = [description, quality].filter(Boolean).join('\n').trim();

      products[reference] = {
        reference,
        name: formattedName,
        originalName: styleName,
        material: quality,
        color,
        csvCategory: productType,
        ecommerceDescription: ecommerceDesc,
        variants: [],
        suggestedBrand: brand?.name,
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      };
    }

    products[reference].variants.push({
      size,
      quantity,
      ean: barcode,
      price,
      rrp,
    });
  }

  const productList = Object.values(products);
  productList.forEach(p => {
    p.sizeAttribute = determineSizeAttribute(p.variants);
  });
  return productList;
}

function processFlossPdfResults(
  pdfData: Record<string, unknown>,
  existingProducts: ParsedProduct[],
  context: ParseContext
): EnrichmentResult {
  const pdfProducts = (pdfData.products || []) as FlossPdfProduct[];
  if (!pdfProducts.length) return { products: existingProducts, message: 'No products found in PDF.' };

  const isBrunobruno = context.vendorId === 'brunobruno';
  const brandName = isBrunobruno ? 'Brunobruno' : 'Flöss';
  const brand = isBrunobruno
    ? context.findBrand('brunobruno', 'bruno bruno')
    : context.findBrand('flöss', 'floss');

  if (existingProducts.length > 0) {
    let matchCount = 0;
    const mismatchDetails: string[] = [];

    for (const pdfProduct of pdfProducts) {
      const csvProduct = existingProducts.find(p => p.reference === pdfProduct.styleNo);
      if (csvProduct) {
        matchCount++;
        const csvTotalQty = csvProduct.variants.reduce((sum, v) => sum + v.quantity, 0);
        if (csvTotalQty !== pdfProduct.totalQty) {
          mismatchDetails.push(`${pdfProduct.styleNo}: CSV=${csvTotalQty}, PDF=${pdfProduct.totalQty}`);
        }
      }
    }

    const mismatchSummary = mismatchDetails.length > 0
      ? `Quantity mismatch for ${mismatchDetails.length} product(s).`
      : 'All quantities match.';

    return {
      products: existingProducts,
      message: `PDF verified: ${pdfProducts.length} products found, ${matchCount}/${existingProducts.length} matched. ${mismatchSummary}`,
    };
  }

  // No CSV — build products from PDF
  const products: Record<string, ParsedProduct> = {};

  for (const pdfProduct of pdfProducts) {
    const reference = pdfProduct.styleNo;
    const validRef = isBrunobruno ? /^\d{6}-/.test(reference) : /^F\d+/.test(reference);
    if (!reference || !validRef) continue;

    for (const colorData of pdfProduct.colors) {
      const colorCode = colorData.color.match(/^(\d+)/)?.[1] || '';
      const productKey = (isBrunobruno && colorCode)
        ? `${reference}_${colorCode}`
        : `${reference}_${colorData.color.replace(/[^a-zA-Z0-9]/g, '')}`;
      const productRef = (isBrunobruno && colorCode) ? `${reference}_${colorCode}` : reference;

      const formattedName = `${brandName} - ${toSentenceCase(pdfProduct.styleName)} - ${toSentenceCase(colorData.color)}`;

      if (!products[productKey]) {
        products[productKey] = {
          reference: productRef,
          name: formattedName,
          originalName: pdfProduct.styleName,
          material: pdfProduct.quality,
          color: colorData.color,
          ecommerceDescription: '',
          variants: [],
          suggestedBrand: brand?.name,
          selectedBrand: brand,
          publicCategories: [],
          productTags: [],
          isFavorite: false,
          isPublished: true,
        };
      }

      for (const sizeData of colorData.sizes) {
        products[productKey].variants.push({
          size: convertSize(sizeData.size),
          quantity: sizeData.qty,
          ean: '',
          price: pdfProduct.price,
          rrp: pdfProduct.rrp,
        });
      }
    }
  }

  const productList = Object.values(products);
  productList.forEach(p => {
    p.sizeAttribute = determineSizeAttribute(p.variants);
  });

  return {
    products: productList,
    message: `${pdfProducts.length} products loaded from PDF. Barcodes (EAN) are not available — upload CSV for complete data.`,
  };
}

const flossPlugin: SupplierPlugin = {
  id: 'floss',
  displayName: 'Flöss / Brunobruno',
  brandName: 'Flöss',

  fileInputs: [
    { id: 'main_csv', label: 'Style Details CSV', accept: '.csv', required: false, type: 'csv' },
    { id: 'pdf_invoice', label: 'Sales Order PDF', accept: '.pdf', required: false, type: 'pdf' },
  ],

  serverSideFileInputs: ['pdf_invoice'],
  pdfParseEndpoint: '/api/parse-floss-pdf',

  parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
    const csvText = files['main_csv'] as string;
    if (!csvText) return [];
    return parseFlossCSV(csvText, context);
  },

  processPdfResults: processFlossPdfResults,

  imageUpload: {
    enabled: true,
    instructions: 'Upload afbeeldingen van je Flöss/Brunobruno order folder. Bestandsnamen moeten beginnen met het Style No.',
    exampleFilenames: ['F10841 - Robin Dress - Blue-tangerine Stripe - Main.jpg', 'F10841 - Robin Dress - Blue-tangerine Stripe - Extra 0.jpg'],
    filenameFilter: /\.(jpg|jpeg|png)$/i,
    extractReference: (filename: string) => {
      const match = filename.match(/^(F\d+|\d{6}-\d+)\s*-/);
      return match ? match[1] : null;
    },
    mapFilename: (filename: string, reference: string) => {
      const isMain = /Main\./i.test(filename);
      const extraMatch = filename.match(/Extra\s*(\d+)/i);
      if (isMain) return `${reference} - Main.jpg`;
      if (extraMatch) return `${reference} - Extra ${extraMatch[1]}.jpg`;
      return filename;
    },
  },
};

export default flossPlugin;
