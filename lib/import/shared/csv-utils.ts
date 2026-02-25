/**
 * Unified CSV parsing utilities.
 * Replaces 23+ different CSV parsing implementations across supplier parsers.
 */

export interface CSVParseOptions {
  delimiter?: string | 'auto';
  hasHeader?: boolean;
  skipRows?: number;
  quoteChar?: string;
  multilineQuotes?: boolean;
}

export interface CSVParseResult {
  headers: string[];
  rows: string[][];
  headerRow: Record<string, number>;
}

function detectDelimiter(text: string): string {
  const firstLines = text.split('\n').slice(0, 5).join('\n');
  const semicolonCount = (firstLines.match(/;/g) || []).length;
  const commaCount = (firstLines.match(/,/g) || []).length;
  const tabCount = (firstLines.match(/\t/g) || []).length;

  if (tabCount > semicolonCount && tabCount > commaCount) return '\t';
  if (semicolonCount > commaCount) return ';';
  return ',';
}

/**
 * Parse CSV text with full support for:
 * - Configurable delimiters (or auto-detection)
 * - Quoted fields (including escaped quotes "")
 * - Multi-line quoted fields
 * - Skipping rows (for formats like "Table 1" prefix or order reference lines)
 */
export function parseCSV(text: string, options: CSVParseOptions = {}): CSVParseResult {
  const {
    delimiter: delimiterOpt = 'auto',
    hasHeader = true,
    skipRows = 0,
    quoteChar = '"',
    multilineQuotes = true,
  } = options;

  const delimiter = delimiterOpt === 'auto' ? detectDelimiter(text) : delimiterOpt;

  const rows = multilineQuotes
    ? parseWithMultilineQuotes(text, delimiter, quoteChar)
    : parseSimple(text, delimiter);

  const dataRows = rows.slice(skipRows);

  if (dataRows.length === 0) {
    return { headers: [], rows: [], headerRow: {} };
  }

  if (hasHeader) {
    const headers = dataRows[0].map(h => h.trim());
    const headerRow: Record<string, number> = {};
    headers.forEach((h, i) => { headerRow[h] = i; });

    return {
      headers,
      rows: dataRows.slice(1),
      headerRow,
    };
  }

  return {
    headers: [],
    rows: dataRows,
    headerRow: {},
  };
}

function parseWithMultilineQuotes(text: string, delimiter: string, quoteChar: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === quoteChar) {
      if (inQuotes && nextChar === quoteChar) {
        currentField += quoteChar;
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      }
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
    } else if (char !== '\r') {
      currentField += char;
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function parseSimple(text: string, delimiter: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/)
    .filter(line => line.trim())
    .map(line => line.split(delimiter).map(field => field.trim()));
}

/**
 * Build a row object from headers and values (like a dictionary).
 * Handles missing values gracefully.
 */
export function rowToObject(headers: string[], values: string[]): Record<string, string> {
  const row: Record<string, string> = {};
  headers.forEach((header, idx) => {
    row[header] = values[idx]?.trim() || '';
  });
  return row;
}

/**
 * Find a header index by trying multiple possible names (case-insensitive).
 * Returns -1 if none found.
 */
export function findHeader(headers: string[], ...candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headers.findIndex(h => h.toLowerCase().trim() === candidate.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}
