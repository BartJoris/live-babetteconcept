export { parseCSV, rowToObject, findHeader } from './csv-utils';
export type { CSVParseOptions, CSVParseResult } from './csv-utils';

export { parseEuroPrice } from './price-utils';

export {
  convertSize,
  mapSizeToOdooFormat,
  determineSizeAttribute,
  isUnitSize,
} from './size-utils';
export type { SizeAttribute } from './size-utils';

export {
  toTitleCase,
  toSentenceCase,
  formatProductName,
  productNameTemplateData,
  DEFAULT_PRODUCT_NAME_TEMPLATE,
} from './name-utils';
export type { NameCasingMode, NameTemplateCasing } from './name-utils';

export {
  generateEAN13,
  generateUniqueEAN13Batch,
  isValidEAN13,
} from './ean-utils';

export {
  parseSpreadsheetFile,
  suggestColumnMapping,
  tableToProducts,
  tableToDelimitedText,
} from './spreadsheet-utils';
export type { ExtractedTable } from './spreadsheet-utils';

export {
  normalizeCategoryPath,
  categoryPathExists,
  findCategoriesMatchingBrand,
  suggestCategoriesForBrand,
  resolveTypedCategoryPath,
} from './category-suggest';
export type {
  CategoryLike,
  CategorySuggestion,
} from './category-suggest';

export { toEcommerceHtml } from './ecommerce-html';
