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
} from './name-utils';

export {
  generateEAN13,
  generateUniqueEAN13Batch,
  isValidEAN13,
} from './ean-utils';
