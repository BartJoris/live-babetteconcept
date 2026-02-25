import type { NextApiRequest, NextApiResponse } from 'next';

interface ColumnAnalysis {
  header: string;
  sampleValues: string[];
  suggestedMapping: string | null;
  confidence: number;
}

interface FileAnalysis {
  fileId: string;
  fileName: string;
  fileType: 'csv' | 'pdf' | 'unknown';
  delimiter?: string;
  rowCount?: number;
  headers?: string[];
  sampleRows?: string[][];
  columnAnalysis?: ColumnAnalysis[];
  /** Role guessed from filename/content: main_csv, ean_csv, tarif_csv, pdf_invoice, etc. */
  suggestedRole: string;
  suggestedRoleLabel: string;
}

interface AISuggestion {
  id: string;
  displayName: string;
  brandName: string;
  fileInputs: Array<{
    id: string;
    label: string;
    accept: string;
    required: boolean;
    type: 'csv' | 'pdf';
  }>;
  csvConfig?: {
    delimiter: string;
    skipRows: number;
    columnMapping: Record<string, string>;
    priceFormat: 'european' | 'standard';
    sizeFormat: string;
  };
  nameTemplate: string;
  nameCasing?: Record<string, string>;
  groupBy: string;
  rrpMultiplier?: number;
  hasPdf: boolean;
  pdfParseEndpoint?: string;
}

interface AnalysisResponse {
  success: boolean;
  files: FileAnalysis[];
  aiSuggestion?: AISuggestion;
  error?: string;
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

function analyzeColumn(header: string, values: string[]): ColumnAnalysis {
  const headerLower = header.toLowerCase().trim();
  const nonEmpty = values.filter(v => v.trim());

  const mappings: Record<string, string[]> = {
    reference: ['reference', 'ref', 'product reference', 'style', 'style no', 'article', 'item number', 'sku', 'art. no', 'referencia'],
    name: ['description', 'product name', 'style name', 'name', 'designation', 'désignation'],
    color: ['color', 'colour', 'color name', 'colour name'],
    size: ['size', 'size name', 'taille', 'variante'],
    material: ['quality', 'composition', 'textile content', 'material'],
    ean: ['ean', 'ean13', 'ean barcode', 'barcode', 'ean code', 'gencod'],
    price: ['price', 'unit price', 'wholesale', 'wsp', 'wholesale price', 'wholesale price eur', 'whl price'],
    rrp: ['rrp', 'retail', 'retail price', 'recommended retail price', 'recommended retail price eur', 'srp', 'rrp eur'],
    quantity: ['quantity', 'qty', 'line quantity', 'sales order quantity', 'cant'],
    category: ['category', 'type', 'product category'],
  };

  let suggestedMapping: string | null = null;
  let confidence = 0;

  for (const [field, keywords] of Object.entries(mappings)) {
    for (const keyword of keywords) {
      if (headerLower === keyword) {
        suggestedMapping = field;
        confidence = 1.0;
        break;
      }
      if (headerLower.includes(keyword)) {
        if (confidence < 0.7) {
          suggestedMapping = field;
          confidence = 0.7;
        }
      }
    }
    if (confidence === 1.0) break;
  }

  if (!suggestedMapping && nonEmpty.length > 0) {
    const allEAN = nonEmpty.every(v => /^\d{8,14}$/.test(v.trim()));
    const hasSizes = nonEmpty.some(v => /^(XS|S|M|L|XL|XXL|\d+Y|\d+M|\d{2,3})$/i.test(v.trim()));
    const allNumeric = nonEmpty.every(v => /^[\d.,€\s]+$/.test(v));

    if (allEAN) { suggestedMapping = 'ean'; confidence = 0.8; }
    else if (hasSizes) { suggestedMapping = 'size'; confidence = 0.6; }
    else if (allNumeric) { suggestedMapping = 'price'; confidence = 0.4; }
  }

  return { header, sampleValues: nonEmpty.slice(0, 5), suggestedMapping, confidence };
}

function guessFileRole(fileName: string, headers?: string[]): { role: string; label: string } {
  const lower = fileName.toLowerCase();
  const headerStr = (headers || []).join(' ').toLowerCase();

  if (lower.endsWith('.pdf')) {
    if (lower.includes('invoice') || lower.includes('order') || lower.includes('confirmation') || lower.includes('fact'))
      return { role: 'pdf_invoice', label: 'PDF Factuur / Order' };
    if (lower.includes('price') || lower.includes('catalog'))
      return { role: 'pdf_prices', label: 'PDF Prijslijst / Catalogus' };
    return { role: 'pdf_invoice', label: 'PDF Bestand' };
  }

  // CSV role detection based on headers
  if (headerStr.includes('ean') && headerStr.includes('barcode') && !headerStr.includes('product name'))
    return { role: 'ean_csv', label: 'EAN / Barcode CSV' };
  if (headerStr.includes('rrp eur') && headerStr.includes('gencod'))
    return { role: 'tarif_csv', label: 'TARIF / Prijzen CSV' };
  if (headerStr.includes('srp') && headerStr.includes('referencia'))
    return { role: 'confirmation_csv', label: 'Order Confirmation CSV' };
  if (lower.includes('ean') || lower.includes('barcode'))
    return { role: 'ean_csv', label: 'EAN / Barcode CSV' };
  if (lower.includes('tarif') || lower.includes('price'))
    return { role: 'tarif_csv', label: 'TARIF / Prijzen CSV' };
  if (lower.includes('description'))
    return { role: 'descriptions_csv', label: 'Beschrijvingen CSV' };
  if (lower.includes('confirmation'))
    return { role: 'confirmation_csv', label: 'Order Confirmation CSV' };
  if (lower.includes('export'))
    return { role: 'main_csv', label: 'Export / Hoofd CSV' };

  return { role: 'main_csv', label: 'Hoofd CSV (productdata)' };
}

function analyzeCSV(fileId: string, fileName: string, content: string): FileAnalysis {
  const delimiter = detectDelimiter(content);
  const lines = content.trim().split('\n');

  if (lines.length < 2) {
    return {
      fileId, fileName, fileType: 'csv', delimiter, rowCount: 0,
      headers: [], sampleRows: [], columnAnalysis: [],
      suggestedRole: 'main_csv', suggestedRoleLabel: 'Hoofd CSV',
    };
  }

  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  const sampleRows = lines.slice(1, 6).map(line =>
    line.split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''))
  );

  const columnValues: string[][] = headers.map((_, colIdx) =>
    sampleRows.map(row => row[colIdx] || '')
  );
  const columnAnalysis = headers.map((header, idx) =>
    analyzeColumn(header, columnValues[idx])
  );

  const { role, label } = guessFileRole(fileName, headers);

  return {
    fileId, fileName, fileType: 'csv', delimiter,
    rowCount: lines.length - 1, headers, sampleRows, columnAnalysis,
    suggestedRole: role, suggestedRoleLabel: label,
  };
}

async function generateAISuggestion(
  files: FileAnalysis[]
): Promise<AISuggestion | undefined> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return undefined;

  const pdfFiles = files.filter(f => f.fileType === 'pdf');

  const fileDescriptions = files.map(f => {
    if (f.fileType === 'pdf') {
      return `- PDF file: "${f.fileName}" (role: ${f.suggestedRole})`;
    }
    return `- CSV file: "${f.fileName}" (role: ${f.suggestedRole}, delimiter: "${f.delimiter}", ${f.rowCount} rows)
  Headers: ${JSON.stringify(f.headers)}
  Sample data: ${JSON.stringify(f.sampleRows?.slice(0, 2))}
  Column hints: ${f.columnAnalysis?.map(c => `"${c.header}"=${c.suggestedMapping || '?'}`).join(', ')}`;
  }).join('\n\n');

  const prompt = `Analyze these files from a fashion/clothing supplier and suggest a complete parser configuration.

FILES:
${fileDescriptions}

Based on ALL these files, provide a JSON configuration for this supplier. The configuration must include:

1. "id": lowercase kebab-case identifier
2. "displayName": human-readable name  
3. "brandName": brand name (detect from data if possible)
4. "fileInputs": array of objects, one per file type this supplier needs. Each: { "id": string, "label": string (Dutch), "accept": ".csv" or ".pdf", "required": boolean, "type": "csv" or "pdf" }
5. "csvConfig": for the main CSV: { "delimiter", "skipRows", "columnMapping" (maps our fields to header names), "priceFormat" ("european"/"standard"), "sizeFormat" ("eu"/"age"/"y-suffix"/"raw") }
6. "nameTemplate": e.g. "{brand} - {name} - {color}"
7. "nameCasing": e.g. { "name": "sentence", "color": "sentence" }
8. "groupBy": "reference" or "reference-color"
9. "rrpMultiplier": if no RRP column, suggest a multiplier
10. "hasPdf": ${pdfFiles.length > 0}
${pdfFiles.length > 0 ? '11. "pdfParseEndpoint": suggest an API path like "/api/parse-{supplier}-pdf"' : ''}

Important: if there are multiple CSV files, describe how they relate (e.g. one has product data, another has EAN codes, another has prices).

Respond with ONLY valid JSON, no markdown.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an expert at analyzing file formats from fashion suppliers. You understand CSV and PDF invoice formats. You output only valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) return undefined;

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim();
    if (!content) return undefined;

    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error('AI suggestion error:', error);
    return undefined;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<AnalysisResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, files: [], error: 'Method not allowed' });
  }

  try {
    const { files: inputFiles } = req.body as {
      files: Array<{ fileId: string; fileName: string; content?: string; isPdf?: boolean }>;
    };

    if (!inputFiles || inputFiles.length === 0) {
      return res.status(400).json({ success: false, files: [], error: 'No files provided' });
    }

    const analyzedFiles: FileAnalysis[] = [];

    for (const input of inputFiles) {
      if (input.isPdf) {
        const { role, label } = guessFileRole(input.fileName);
        analyzedFiles.push({
          fileId: input.fileId,
          fileName: input.fileName,
          fileType: 'pdf',
          suggestedRole: role,
          suggestedRoleLabel: label,
        });
      } else if (input.content) {
        analyzedFiles.push(analyzeCSV(input.fileId, input.fileName, input.content));
      }
    }

    const aiSuggestion = await generateAISuggestion(analyzedFiles);

    return res.status(200).json({
      success: true,
      files: analyzedFiles,
      aiSuggestion,
    });
  } catch (error) {
    console.error('Analysis error:', error);
    return res.status(500).json({
      success: false,
      files: [],
      error: (error as Error).message,
    });
  }
}
