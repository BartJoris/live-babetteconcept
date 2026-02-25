/**
 * Factory for creating declarative CSV-based supplier plugins.
 * Handles ~60% of suppliers that follow a standard CSV pattern.
 */

import type {
  SupplierPlugin,
  DeclarativeCSVConfig,
  ColumnMapping,
  ParsedProduct,
  ProductVariant,
  SupplierFiles,
  ParseContext,
} from './types';
import { parseCSV, rowToObject } from '@/lib/import/shared/csv-utils';
import { parseEuroPrice } from '@/lib/import/shared/price-utils';
import { convertSize, determineSizeAttribute } from '@/lib/import/shared/size-utils';
import { formatProductName, toSentenceCase, toTitleCase } from '@/lib/import/shared/name-utils';

function resolveColumn(mapping: string | ColumnMapping): { column: string; format?: string; transform?: (v: string) => string } {
  if (typeof mapping === 'string') {
    return { column: mapping };
  }
  return mapping;
}

function getColumnValue(row: Record<string, string>, mapping: string | ColumnMapping | undefined): string {
  if (!mapping) return '';
  const { column, transform } = resolveColumn(mapping);
  const raw = row[column] || '';
  return transform ? transform(raw) : raw;
}

function parsePrice(value: string, format?: string): number {
  if (!value) return 0;
  if (format === 'standard') {
    return parseFloat(value) || 0;
  }
  return parseEuroPrice(value);
}

function applyNameCasing(value: string, casing?: string): string {
  if (!casing || casing === 'none') return value;
  if (casing === 'title') return toTitleCase(value);
  if (casing === 'sentence') return toSentenceCase(value);
  return value;
}

function applySizeConversion(size: string, format?: string): string {
  if (!format || format === 'raw') return size;
  return convertSize(size);
}

export function createCSVSupplier(config: DeclarativeCSVConfig): SupplierPlugin {
  const mainFileInput = {
    id: 'main_csv',
    label: `${config.displayName} CSV`,
    accept: '.csv',
    required: true,
    type: 'csv' as const,
  };

  const fileInputs = [mainFileInput, ...(config.additionalFileInputs || [])];

  const parse = (files: SupplierFiles, context: ParseContext): ParsedProduct[] => {
    const text = files['main_csv'] as string;
    if (!text) return [];

    const { headers, rows } = parseCSV(text, {
      delimiter: config.csv.delimiter,
      skipRows: config.csv.skipRows,
    });

    if (headers.length === 0 || rows.length === 0) return [];

    const products: Record<string, ParsedProduct> = {};
    const cols = config.csv.columns;

    const brand = context.findBrand(config.brandName);

    for (const values of rows) {
      const row = rowToObject(headers, values);

      const reference = getColumnValue(row, cols.reference);
      if (!reference) continue;

      const name = getColumnValue(row, cols.name);
      const color = getColumnValue(row, cols.color);
      const rawSize = getColumnValue(row, cols.size);
      const material = getColumnValue(row, cols.material);
      const description = getColumnValue(row, cols.description);
      const category = getColumnValue(row, cols.category);
      const ean = getColumnValue(row, cols.ean);
      const sku = getColumnValue(row, cols.sku);
      const qtyStr = getColumnValue(row, cols.quantity);

      const priceCol = resolveColumn(cols.price);
      const rrpCol = resolveColumn(cols.rrp);
      const priceVal = row[priceCol.column] || '';
      const rrpVal = row[rrpCol.column] || '';

      const price = parsePrice(priceVal, priceCol.format);
      const rrpParsed = parsePrice(rrpVal, rrpCol.format);
      const rrp = rrpParsed || (config.rrpMultiplier ? price * config.rrpMultiplier : 0);

      const size = applySizeConversion(rawSize, config.sizeFormat);
      const quantity = parseInt(qtyStr) || 0;

      // Determine product grouping key
      const groupKey = config.groupBy === 'reference-color'
        ? `${reference}_${color.trim().toLowerCase().replace(/\s+/g, '-')}`
        : reference;

      if (!products[groupKey]) {
        const nameData: Record<string, string> = {
          brand: config.brandName,
          name,
          color,
        };

        // Apply casing to name data
        if (config.nameCasing) {
          for (const [key, casing] of Object.entries(config.nameCasing)) {
            if (nameData[key]) {
              nameData[key] = applyNameCasing(nameData[key], casing);
            }
          }
        }

        const formattedName = formatProductName(config.nameTemplate, nameData);

        products[groupKey] = {
          reference: groupKey,
          name: formattedName,
          originalName: name,
          material,
          color,
          csvCategory: category,
          ecommerceDescription: description || formattedName,
          variants: [],
          suggestedBrand: brand?.name,
          selectedBrand: brand,
          publicCategories: [],
          productTags: [],
          isFavorite: false,
          isPublished: true,
        };
      }

      const variant: ProductVariant = {
        size,
        quantity,
        ean,
        sku: sku || undefined,
        price,
        rrp,
      };

      products[groupKey].variants.push(variant);
    }

    const productList = Object.values(products);

    productList.forEach(product => {
      product.sizeAttribute = determineSizeAttribute(product.variants);
    });

    return productList;
  };

  return {
    id: config.id,
    displayName: config.displayName,
    brandName: config.brandName,
    fileInputs,
    fileDetection: config.fileDetection,
    parse,
    imageMatching: config.imageMatching,
  };
}
