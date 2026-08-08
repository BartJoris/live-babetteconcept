/**
 * Generates the initial draft TypeScript source for a new supplier plugin.
 *
 * This is a pure code-generation function (no React, no fetch) so it can run
 * both in the browser (existing manual "supplier-onboarding" wizard) and on
 * the server (automatic PR-based onboarding via pages/api/suppliers/onboard.ts).
 * Kept intentionally simple/templated: it produces a *starting point*, not a
 * finished parser. Complex cases (PDFs, image-filename matching) are left as
 * clearly marked TODOs for a human or the GitHub Actions "Supplier Onboarding
 * Agent" (Claude Code) to fill in.
 */

import type { AISuggestion, OnboardingSourceFile } from './types';

export interface GeneratePluginCodeInput {
  config: AISuggestion;
  /** Map of CSV header -> our internal field name (reference, name, color, ...) */
  columnMappings: Record<string, string>;
  uploadedFiles: OnboardingSourceFile[];
  /** Raw image filenames (no binary content) collected via "ls images" input. */
  imageFilenames?: string[];
}

export interface GeneratePluginCodeResult {
  code: string;
  /** Where this file should live in the repo, e.g. lib/suppliers/acme/index.ts */
  filePath: string;
}

function buildImageUploadBlock(imageFilenames: string[] | undefined, indent: string): string {
  if (!imageFilenames || imageFilenames.length === 0) return '';

  const examples = Array.from(new Set(imageFilenames.map(f => f.trim()).filter(Boolean))).slice(0, 5);
  const examplesCode = examples.map(f => `'${f.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`).join(', ');

  return `
${indent}imageUpload: {
${indent}  enabled: true,
${indent}  instructions: 'TODO: leg uit hoe je de afbeeldingen van deze leverancier moet aanleveren (map of losse bestanden).',
${indent}  exampleFilenames: [${examplesCode}],
${indent}  filenameFilter: /\\.(jpg|jpeg|png|webp)$/i,
${indent}  // TODO(agent): implementeer op basis van samples/image-filenames.txt + de sample-productreferenties.
${indent}  // Zie lib/suppliers/tangerine/index.ts of lib/suppliers/jellymallow/index.ts voor voorbeelden.
${indent}  extractReference: (_filename: string, _relativePath?: string) => null,
${indent}},`;
}

export function generatePluginCode(input: GeneratePluginCodeInput): GeneratePluginCodeResult {
  const { config, columnMappings, uploadedFiles, imageFilenames } = input;

  const finalMapping: Record<string, string> = {};
  for (const [header, field] of Object.entries(columnMappings)) {
    if (field && !finalMapping[field]) {
      finalMapping[field] = header;
    }
  }

  const hasPdf = uploadedFiles.some(f => f.isPdf);
  const hasMultipleCSVs = uploadedFiles.filter(f => !f.isPdf).length > 1;
  const hasRRP = !!finalMapping['rrp'];
  const priceFormat = config.csvConfig?.priceFormat || 'european';
  const filePath = `lib/suppliers/${config.id}/index.ts`;

  // Simple single-CSV supplier: use the createCSVSupplier factory.
  if (!hasPdf && !hasMultipleCSVs) {
    const columnsCode = Object.entries(finalMapping)
      .map(([field, header]) => {
        if (field === 'price' || field === 'rrp') {
          return `      ${field}: { column: '${header}', format: '${priceFormat}' },`;
        }
        return `      ${field}: '${header}',`;
      })
      .join('\n');

    const imageBlock = buildImageUploadBlock(imageFilenames, '  ');

    const code = `import { createCSVSupplier } from '@/lib/suppliers/create-csv-supplier';

/**
 * ${config.displayName} supplier - auto-generated configuration.
 * Gegenereerd via "Slim uploaden" onboarding. Review de TODO's voordat je merget.
 */
export default createCSVSupplier({
  id: '${config.id}',
  displayName: '${config.displayName}',
  brandName: '${config.brandName}',
  csv: {
    delimiter: '${config.csvConfig?.delimiter || ';'}',${config.csvConfig?.skipRows ? `\n    skipRows: ${config.csvConfig.skipRows},` : ''}
    columns: {
${columnsCode}
    },
  },
  nameTemplate: '${config.nameTemplate}',${config.nameCasing ? `\n  nameCasing: ${JSON.stringify(config.nameCasing)},` : ''}
  sizeFormat: '${config.csvConfig?.sizeFormat || 'raw'}',
  groupBy: '${config.groupBy || 'reference'}',${!hasRRP && config.rrpMultiplier ? `\n  rrpMultiplier: ${config.rrpMultiplier},` : ''}${imageBlock}
});
`;
    return { code, filePath };
  }

  // Complex supplier (multiple files and/or PDF): generate a full SupplierPlugin implementation.
  const fileInputsCode = (config.fileInputs || []).map(fi =>
    `    { id: '${fi.id}', label: '${fi.label}', accept: '${fi.accept}', required: ${fi.required}, type: '${fi.type}' as const },`
  ).join('\n');

  const columnsCode = Object.entries(finalMapping)
    .map(([field, header]) => {
      if (field === 'price' || field === 'rrp') {
        return `      const ${field} = parseEuroPrice(row['${header}'] || '');`;
      }
      if (field === 'quantity') {
        return `      const ${field} = parseInt(row['${header}'] || '0') || 0;`;
      }
      return `      const ${field} = row['${header}'] || '';`;
    })
    .join('\n');

  const pdfSection = hasPdf ? `
  serverSideFileInputs: ['pdf_invoice'],
  pdfParseEndpoint: '${config.pdfParseEndpoint || `/api/parse-${config.id}-pdf`}',

  processPdfResults(pdfData, existingProducts, context) {
    // TODO: Implement PDF result processing for ${config.displayName}
    // pdfData contains the parsed PDF response from the server
    // Return { products: [...], message: '...' }
    return { products: existingProducts, message: 'PDF data ontvangen.' };
  },` : '';

  const imageBlock = buildImageUploadBlock(imageFilenames, '  ');

  const code = `import { parseCSV, rowToObject, parseEuroPrice, convertSize, determineSizeAttribute, toSentenceCase } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

/**
 * ${config.displayName} supplier plugin.
 * Auto-generated via "Slim uploaden" onboarding - review and adjust as needed.
 *
 * File inputs: ${(config.fileInputs || []).map(fi => fi.label).join(', ')}
 */

function parseMainCSV(text: string, context: ParseContext): ParsedProduct[] {
  const { headers, rows } = parseCSV(text, { delimiter: '${config.csvConfig?.delimiter || ';'}' });
  if (headers.length === 0) return [];

  const brand = context.findBrand('${config.brandName.toLowerCase()}');
  const products: Record<string, ParsedProduct> = {};

  for (const values of rows) {
    const row = rowToObject(headers, values);

${columnsCode}

    if (!reference) continue;

    const groupKey = ${config.groupBy === 'reference-color' ? "`${reference}_${color}`" : 'reference'};

    if (!products[groupKey]) {
      const name = toSentenceCase(${finalMapping['name'] ? `row['${finalMapping['name']}']` : "''"} || '');
      const formattedName = \`${config.nameTemplate.replace(/\{brand\}/g, '${config.brandName}').replace(/\{name\}/g, '${name}').replace(/\{color\}/g, "${config.groupBy === 'reference-color' ? '${toSentenceCase(color)}' : ''}")}\`;

      products[groupKey] = {
        reference: groupKey,
        name: formattedName,
        originalName: ${finalMapping['name'] ? `row['${finalMapping['name']}']` : "''"} || '',
        material: ${finalMapping['material'] ? `row['${finalMapping['material']}']` : "''"} || '',
        color: ${finalMapping['color'] ? 'color' : "''"},
        variants: [],
        suggestedBrand: brand?.name,
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      };
    }

    products[groupKey].variants.push({
      size: ${config.csvConfig?.sizeFormat === 'eu' ? `convertSize(${finalMapping['size'] ? `row['${finalMapping['size']}']` : "''"} || '')` : `${finalMapping['size'] ? `row['${finalMapping['size']}']` : "''"} || ''`},
      quantity: ${finalMapping['quantity'] ? 'quantity' : '0'},
      ean: ${finalMapping['ean'] ? `row['${finalMapping['ean']}']` : "''"} || '',
      price: ${finalMapping['price'] ? 'price' : '0'},
      rrp: ${finalMapping['rrp'] ? 'rrp' : `${finalMapping['price'] ? `price * ${config.rrpMultiplier || 2.5}` : '0'}`},
    });
  }

  const productList = Object.values(products);
  productList.forEach(p => { p.sizeAttribute = determineSizeAttribute(p.variants); });
  return productList;
}

const plugin: SupplierPlugin = {
  id: '${config.id}',
  displayName: '${config.displayName}',
  brandName: '${config.brandName}',

  fileInputs: [
${fileInputsCode}
  ],

  parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
    const csvText = files['main_csv'] as string;
    if (!csvText) return [];
    return parseMainCSV(csvText, context);
  },
${pdfSection}${imageBlock}
};

export default plugin;
`;

  return { code, filePath };
}
