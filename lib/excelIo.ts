import ExcelJS from 'exceljs';

function triggerXlsxDownload(buffer: BlobPart, filename: string) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function cellToPlain(value: ExcelJS.CellValue): unknown {
  if (value == null || value === '') return '';
  if (typeof value === 'object' && value !== null) {
    if ('result' in value && (value as { result?: unknown }).result !== undefined) {
      return (value as { result: unknown }).result;
    }
    if ('richText' in value && Array.isArray((value as { richText: { text: string }[] }).richText)) {
      return (value as { richText: { text: string }[] }).richText.map((t) => t.text).join('');
    }
    if ('text' in value && typeof (value as { text?: string }).text === 'string') {
      return (value as { text: string }).text;
    }
    if (value instanceof Date) return value;
  }
  return value;
}

/** Safe sheet name length for Excel */
function trimSheetName(name: string): string {
  return name.length > 31 ? name.slice(0, 31) : name;
}

/**
 * Export plain objects (same keys per row) as .xlsx and trigger browser download.
 */
export async function downloadRowsAsXlsx(
  rows: Record<string, unknown>[],
  sheetName: string,
  filename: string,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(trimSheetName(sheetName));

  if (rows.length > 0) {
    const keys = Object.keys(rows[0]);
    ws.addRow(keys);
    for (const row of rows) {
      ws.addRow(keys.map((k) => row[k] ?? ''));
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  triggerXlsxDownload(buffer, filename);
}

/**
 * Read first worksheet; row 1 = headers. Returns objects compatible with prior SheetJS sheet_to_json.
 */
export async function readXlsxFirstSheetAsJsonRecords(
  data: ArrayBuffer,
): Promise<Record<string, unknown>[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const headerRow = ws.getRow(1);
  let maxCol = 0;
  headerRow.eachCell({ includeEmpty: true }, (_cell, colNumber) => {
    maxCol = Math.max(maxCol, colNumber);
  });
  if (maxCol === 0) return [];

  const headers: string[] = [];
  for (let c = 1; c <= maxCol; c++) {
    headers.push(String(cellToPlain(headerRow.getCell(c).value) ?? '').trim());
  }
  while (headers.length > 0 && headers[headers.length - 1] === '') {
    headers.pop();
  }
  if (headers.length === 0) return [];

  const out: Record<string, unknown>[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, unknown> = {};
    let any = false;
    for (let c = 1; c <= headers.length; c++) {
      const key = headers[c - 1];
      if (!key) continue;
      const val = cellToPlain(row.getCell(c).value);
      obj[key] = val;
      if (val !== '' && val != null) any = true;
    }
    if (any) out.push(obj);
  });

  return out;
}
