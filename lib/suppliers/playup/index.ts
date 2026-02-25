import { parseEuroPrice, determineSizeAttribute } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, ProductVariant, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

/**
 * Play UP supplier plugin.
 * Comma-separated CSV with quoted fields.
 * Optionally enriched with EAN retail list CSV and website prices CSV.
 */

function formatDescription(desc: string): string {
  const words = desc.split(' ');
  return words.map((word, index) => {
    if (index === 0) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
    if (word === 'LS' || (word.length === 2 && word === word.toUpperCase())) {
      return word;
    }
    return word.toLowerCase();
  }).join(' ');
}

function formatSizeForOdoo(eanSize: string): string {
  const adultSizes: Record<string, string> = {
    'XXS': 'XXS - 32', 'XS': 'XS - 34', 'S': 'S - 36',
    'M': 'M - 38', 'L': 'L - 40', 'XL': 'XL - 42', 'XXL': 'XXL - 44',
  };
  if (adultSizes[eanSize.toUpperCase()]) return adultSizes[eanSize.toUpperCase()];
  if (/^\d+M$/i.test(eanSize)) return eanSize.slice(0, -1) + ' maand';
  if (/^\d+Y$/i.test(eanSize)) return eanSize.slice(0, -1) + ' jaar';
  return eanSize;
}

interface EANProduct {
  reference: string;
  description: string;
  size: string;
  colourCode: string;
  colourDescription: string;
  price: string;
  retailPrice: string;
  eanCode: string;
}

function parseQuotedCSVLine(line: string): string[] {
  const values: string[] = [];
  let currentValue = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(currentValue);
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  values.push(currentValue);
  return values;
}

function parseEANCSV(text: string): EANProduct[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const products: EANProduct[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseQuotedCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });

    const ref = row['Reference'] || '';
    if (!ref) continue;

    products.push({
      reference: ref,
      description: row['Description'] || '',
      size: row['Size'] || '',
      colourCode: row['Colour Code'] || '',
      colourDescription: row['Colour Description'] || '',
      price: row['Price'] || '0',
      retailPrice: row['Retail Price'] || '0',
      eanCode: row['EAN Code'] || '',
    });
  }
  return products;
}

const playup: SupplierPlugin = {
  id: 'playup',
  displayName: 'Play UP',
  brandName: 'Play Up',

  fileInputs: [
    { id: 'main_csv', label: 'Delivery CSV', accept: '.csv', required: true, type: 'csv' },
    { id: 'ean_csv', label: 'EAN Retail CSV', accept: '.csv', required: false, type: 'csv' },
    { id: 'price_csv', label: 'Website Prices CSV', accept: '.csv', required: false, type: 'csv' },
  ],

  parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
    const text = files['main_csv'] as string;
    if (!text) return [];

    // Parse EAN products if available
    const eanText = files['ean_csv'] as string;
    const eanProducts = eanText ? parseEANCSV(eanText) : [];

    // Parse website prices if available
    const priceText = files['price_csv'] as string;
    const websitePrices = new Map<string, number>();
    if (priceText) {
      const priceLines = priceText.trim().split('\n');
      for (let i = 1; i < priceLines.length; i++) {
        const parts = priceLines[i].split(',');
        if (parts.length >= 2) {
          const sku = parts[0].trim();
          const price = parseFloat(parts[1].trim().replace(',', '.'));
          if (sku && !isNaN(price) && price > 0) websitePrices.set(sku, price);
        }
      }
    }

    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    if (!headers.includes('Article') || !headers.includes('Description')) return [];

    const products: Record<string, ParsedProduct> = {};
    const brand = context.findBrand('play up');

    const normalizeDeliverySize = (s: string): string => {
      if (s.includes('maand')) return s.split(' ')[0] + 'M';
      if (s.includes('jaar')) return s.split(' ')[0] + 'Y';
      return s.toUpperCase();
    };

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = parseQuotedCSVLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });

      const article = row['Article'] || '';
      const color = row['Color'] || '';
      const description = row['Description'] || '';
      const size = row['Size'] || '';
      const quantity = parseInt(row['Quantity'] || '0');
      const price = parseFloat(row['Price'] || '0');

      if (!article) continue;

      const reference = `${article}_${color}`;

      if (!products[reference]) {
        const eanSample = eanProducts.find(ean => {
          const eanArticle = ean.reference.split('/')[1];
          return eanArticle === article && ean.colourCode === color;
        });

        const productDescription = eanSample ? eanSample.description : description;
        const colorDescription = eanSample ? eanSample.colourDescription.toLowerCase() : color;
        const formattedDescription = formatDescription(productDescription);
        const formattedName = `Play Up - ${formattedDescription} (${colorDescription})`;

        products[reference] = {
          reference,
          name: formattedName,
          originalName: productDescription,
          material: color,
          color: colorDescription,
          ecommerceDescription: productDescription,
          variants: [],
          suggestedBrand: brand?.name,
          selectedBrand: brand,
          publicCategories: [],
          productTags: [],
          isFavorite: false,
          isPublished: true,
        };
      }

      const websitePrice = websitePrices.get(article) ?? null;
      const costPrice = websitePrice || price;
      const normalizedDeliverySize = normalizeDeliverySize(size);

      const eanMatch = eanProducts.find(ean => {
        const eanArticle = ean.reference.split('/')[1];
        return eanArticle === article && ean.colourCode === color && ean.size === normalizedDeliverySize;
      });

      const formattedSize = eanMatch ? formatSizeForOdoo(eanMatch.size) : size;

      const variant: ProductVariant = {
        size: formattedSize,
        quantity,
        ean: eanMatch?.eanCode || '',
        sku: `${article}_${color}`,
        price: eanMatch ? parseEuroPrice(eanMatch.price) : costPrice,
        rrp: eanMatch ? parseEuroPrice(eanMatch.retailPrice) : (price * 2.4),
      };

      products[reference].variants.push(variant);

      if (eanMatch && !products[reference].color.includes(' ')) {
        products[reference].color = eanMatch.colourDescription;
      }
    }

    const productList = Object.values(products);
    productList.forEach(p => {
      p.sizeAttribute = determineSizeAttribute(p.variants);
    });

    return productList;
  },

  imageUpload: {
    enabled: true,
    instructions: 'Upload product afbeeldingen via de dedicated pagina.',
    exampleFilenames: [],
    filenameFilter: /\.(jpg|jpeg|png)$/i,
    extractReference: (filename: string) => {
      const match = filename.match(/^(\w+)[-_]/);
      return match ? match[1] : null;
    },
    dedicatedPageUrl: '/playup-images-import',
    dedicatedPageLabel: 'Upload Play UP Afbeeldingen',
  },
};

export default playup;
