import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Supplier detection rules.
 * Each rule tries to identify a supplier from CSV headers and content patterns.
 * Rules are ordered by specificity (most specific first).
 */

interface DetectionMatch {
  supplierId: string;
  supplierName: string;
  fileInputId: string;
  fileInputLabel: string;
  confidence: number;
  reason: string;
}

interface FileDetectionInput {
  fileId: string;
  fileName: string;
  content?: string;
  isPdf: boolean;
}

interface FileDetectionResult {
  fileId: string;
  fileName: string;
  isPdf: boolean;
  matches: DetectionMatch[];
  bestMatch: DetectionMatch | null;
}

interface DetectionResponse {
  success: boolean;
  files: FileDetectionResult[];
  detectedSupplier: string | null;
  detectedSupplierName: string | null;
  allFilesMatched: boolean;
  error?: string;
}

type SupplierRule = {
  supplierId: string;
  supplierName: string;
  csvRules: Array<{
    fileInputId: string;
    fileInputLabel: string;
    detect: (headers: string[], firstLines: string, fileName: string) => number;
    reason: string;
  }>;
  pdfRules?: Array<{
    fileInputId: string;
    fileInputLabel: string;
    detect: (fileName: string) => number;
    reason: string;
  }>;
};

function h(headers: string[], ...terms: string[]): boolean {
  const lower = headers.map(h => h.toLowerCase().trim());
  return terms.every(t => lower.some(h => h.includes(t.toLowerCase())));
}

/**
 * Extract the brand name from Le New Black style CSVs.
 * These have a "Brand name" column. We check the actual data rows to find
 * which brand this file belongs to.
 */
function extractBrandFromData(headers: string[], firstLines: string, delimiter: string): string {
  const headerLower = headers.map(hd => hd.toLowerCase().trim());
  const brandIdx = headerLower.indexOf('brand name');
  if (brandIdx === -1) return '';

  const lines = firstLines.split('\n');
  // Check rows after header (may start at line 1 or line 2 depending on format)
  for (let i = 1; i < Math.min(lines.length, 10); i++) {
    const cols = lines[i]?.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols && cols[brandIdx]) {
      return cols[brandIdx].toLowerCase();
    }
  }
  return '';
}

/** Check if brand name data matches any of the search terms */
function brandMatches(brandData: string, ...terms: string[]): boolean {
  if (!brandData) return false;
  return terms.some(t => brandData.includes(t.toLowerCase()));
}

const SUPPLIER_RULES: SupplierRule[] = [
  // ── Floss / Brunobruno ──
  {
    supplierId: 'floss',
    supplierName: 'Floss / Brunobruno',
    csvRules: [{
      fileInputId: 'main_csv',
      fileInputLabel: 'Style Details CSV',
      detect: (headers, text) => {
        if (h(headers, 'Style No', 'Style Name', 'Wholesale Price EUR')) return 0.95;
        if (h(headers, 'Style No', 'Style Name', 'Barcode')) return 0.9;
        if (text.includes('Table 1') && h(headers, 'Style No')) return 0.85;
        return 0;
      },
      reason: 'Style No + Style Name + Wholesale Price EUR kolommen',
    }],
    pdfRules: [{
      fileInputId: 'pdf_invoice',
      fileInputLabel: 'Sales Order PDF',
      detect: (fn) => {
        const lower = fn.toLowerCase();
        if (lower.includes('sales order') || lower.includes('style details')) return 0.7;
        if (/^\d{4}\s*-\s*sales/i.test(fn)) return 0.8;
        return 0;
      },
      reason: 'Bestandsnaam bevat "Sales Order"',
    }],
  },

  // ── Armed Angels ──
  {
    supplierId: 'armedangels',
    supplierName: 'Armed Angels',
    csvRules: [
      {
        fileInputId: 'main_csv',
        fileInputLabel: 'Catalog CSV (EAN Retail List)',
        detect: (headers, text) => {
          if (text.includes('Table 1') && h(headers, 'Item Number', 'EAN')) return 0.95;
          if (h(headers, 'Item Number', 'Color Code', 'Size Code', 'EAN')) return 0.9;
          return 0;
        },
        reason: 'Item Number + EAN kolommen (Armed Angels catalog)',
      },
      {
        fileInputId: 'invoice_csv',
        fileInputLabel: 'Invoice CSV',
        detect: (headers) => {
          if (h(headers, 'Item no.', 'Art. name', 'Total qty')) return 0.85;
          return 0;
        },
        reason: 'Item no. + Art. name + Total qty (Armed Angels invoice)',
      },
    ],
    pdfRules: [{
      fileInputId: 'pdf_invoice',
      fileInputLabel: 'Invoice PDF',
      detect: (fn) => /armed\s*angel|200-\d{8}/i.test(fn) ? 0.75 : 0,
      reason: 'Bestandsnaam verwijst naar Armed Angels',
    }],
  },

  // ── Emile et Ida ──
  {
    supplierId: 'emileetida',
    supplierName: 'Emile et Ida',
    csvRules: [
      {
        fileInputId: 'main_csv',
        fileInputLabel: 'Order CSV',
        detect: (headers, text) => {
          const brand = extractBrandFromData(headers, text, ';');
          if (brandMatches(brand, 'emile')) {
            if (h(headers, 'Product name', 'EAN13')) return 0.95;
          }
          if (h(headers, 'Product name', 'EAN13', 'Fabric / print') && !brandMatches(brand, 'weekend', 'new society', '1+', 'one more', 'tiny')) return 0.85;
          return 0;
        },
        reason: 'Le New Black format met "Emile" als merknaam',
      },
      {
        fileInputId: 'tarif_csv',
        fileInputLabel: 'TARIF CSV (RRP Prijzen)',
        detect: (headers) => {
          if (h(headers, 'Gencod', 'RRP EUR')) return 0.95;
          if (h(headers, 'Gencod', 'WHLS EUR')) return 0.9;
          return 0;
        },
        reason: 'Gencod + RRP EUR kolommen (TARIF)',
      },
    ],
  },

  // ── The New Society ──
  {
    supplierId: 'thenewsociety',
    supplierName: 'The New Society',
    csvRules: [
      {
        fileInputId: 'main_csv',
        fileInputLabel: 'Order CSV',
        detect: (headers, text) => {
          const brand = extractBrandFromData(headers, text, ';');
          if (brandMatches(brand, 'new society')) {
            if (h(headers, 'Product reference', 'EAN13')) return 0.95;
          }
          if (h(headers, 'Product reference', 'EAN13') && headers.some(hd => hd.toLowerCase().includes('composition')) && !brandMatches(brand, 'emile', 'weekend', '1+', 'one more')) return 0.7;
          return 0;
        },
        reason: 'Le New Black format met "New Society" als merknaam',
      },
      {
        fileInputId: 'confirmation_csv',
        fileInputLabel: 'Order Confirmation CSV (SRP)',
        detect: (headers) => {
          if (h(headers, 'SRP', 'REFERENCIA', 'VARIANTE')) return 0.95;
          if (h(headers, 'ESTILO', 'SRP')) return 0.9;
          return 0;
        },
        reason: 'SRP + REFERENCIA + VARIANTE (Spaanse headers)',
      },
    ],
  },

  // ── Mipounet ──
  {
    supplierId: 'mipounet',
    supplierName: 'Mipounet',
    csvRules: [
      {
        fileInputId: 'main_csv',
        fileInputLabel: 'Export CSV',
        detect: (headers, _, fn) => {
          if (h(headers, 'Product reference', 'EAN13') && fn.toLowerCase().includes('export')) return 0.9;
          if (h(headers, '"Order id"') || (h(headers, 'Order id') && fn.toLowerCase().includes('export'))) return 0.85;
          return 0;
        },
        reason: 'Export CSV met Product reference',
      },
      {
        fileInputId: 'ean_csv',
        fileInputLabel: 'EAN Codes CSV',
        detect: (headers, _, fn) => {
          if (h(headers, 'EAN') && fn.toLowerCase().includes('ean') && fn.toLowerCase().includes('mipounet')) return 0.95;
          return 0;
        },
        reason: 'Mipounet EAN codes bestand',
      },
      {
        fileInputId: 'confirmation_csv',
        fileInputLabel: 'Order Confirmation CSV',
        detect: (headers, _, fn) => {
          if (fn.toLowerCase().includes('order-') && !fn.toLowerCase().includes('export') && h(headers, 'Product reference')) return 0.8;
          return 0;
        },
        reason: 'Order confirmation (order-*.csv, niet export)',
      },
    ],
  },

  // ── Bobo Choses ──
  {
    supplierId: 'bobochoses',
    supplierName: 'Bobo Choses',
    csvRules: [{
      fileInputId: 'main_csv',
      fileInputLabel: 'Packing List CSV',
      detect: (headers, text) => {
        if (text.toUpperCase().includes('BOX;REFERENCE;DESCRIPTION')) return 0.95;
        if (h(headers, 'BOX', 'REFERENCE', 'DESCRIPTION')) return 0.9;
        if (text.toLowerCase().includes('bobo choses')) return 0.7;
        return 0;
      },
      reason: 'BOX + REFERENCE + DESCRIPTION (Bobo Choses packing list)',
    }],
    pdfRules: [{
      fileInputId: 'pdf_prices',
      fileInputLabel: 'Price PDF',
      detect: (fn) => fn.toLowerCase().includes('bobo') ? 0.7 : 0,
      reason: 'Bestandsnaam bevat "bobo"',
    }],
  },

  // ── Wyncken ──
  {
    supplierId: 'wyncken',
    supplierName: 'Wyncken',
    csvRules: [
      {
        fileInputId: 'descriptions_csv',
        fileInputLabel: 'Product Descriptions CSV',
        detect: (headers) => {
          if (h(headers, 'Product ID', 'Style', 'Description', 'Textile Content')) return 0.95;
          return 0;
        },
        reason: 'Product ID + Style + Description + Textile Content',
      },
      {
        fileInputId: 'barcodes_csv',
        fileInputLabel: 'Barcodes CSV',
        detect: (headers) => {
          if (h(headers, 'Product ID', 'Style', 'Barcode') && !headers.some(hdr => hdr.toLowerCase().includes('description'))) return 0.95;
          return 0;
        },
        reason: 'Product ID + Style + Barcode (zonder Description)',
      },
    ],
    pdfRules: [{
      fileInputId: 'pdf_invoice',
      fileInputLabel: 'Invoice PDF',
      detect: (fn) => fn.toLowerCase().includes('wyncken') || /PF-\d+/i.test(fn) ? 0.8 : 0,
      reason: 'Bestandsnaam verwijst naar Wyncken',
    }],
  },

  // ── Petit Blush ──
  {
    supplierId: 'petitblush',
    supplierName: 'Petit Blush',
    csvRules: [
      {
        fileInputId: 'main_csv',
        fileInputLabel: 'Order Sheet CSV',
        detect: (_, text, fn) => {
          if (fn.toLowerCase().includes('petit blush') && fn.toLowerCase().includes('order')) return 0.9;
          if (text.includes(';') && text.toLowerCase().includes('petit blush')) return 0.8;
          return 0;
        },
        reason: 'Petit Blush Order Sheet',
      },
      {
        fileInputId: 'ean_csv',
        fileInputLabel: 'EAN Code List CSV',
        detect: (headers, _, fn) => {
          if (fn.toLowerCase().includes('petit blush') && fn.toLowerCase().includes('ean')) return 0.9;
          if (h(headers, 'EAN Code') && headers.includes(',')) return 0.6;
          return 0;
        },
        reason: 'Petit Blush EAN Code List',
      },
    ],
  },

  // ── Goldie and Ace ──
  {
    supplierId: 'goldieandace',
    supplierName: 'Goldie + Ace',
    csvRules: [{
      fileInputId: 'main_csv',
      fileInputLabel: 'Line Sheet CSV',
      detect: (headers) => {
        if (h(headers, 'Style Code', 'Colour Name', 'Retail $AUD')) return 0.95;
        if (h(headers, 'Style Code', 'Barcode', 'Wholesale')) return 0.85;
        return 0;
      },
      reason: 'Style Code + Colour Name + Retail $AUD',
    }],
    pdfRules: [{
      fileInputId: 'pdf_invoice',
      fileInputLabel: 'Invoice PDF',
      detect: (fn) => fn.toLowerCase().includes('goldie') || /H\d{3}\.\d+/i.test(fn) ? 0.75 : 0,
      reason: 'Bestandsnaam verwijst naar Goldie and Ace',
    }],
  },

  // ── Play UP ──
  {
    supplierId: 'playup',
    supplierName: 'Play UP',
    csvRules: [
      {
        fileInputId: 'main_csv',
        fileInputLabel: 'Delivery CSV',
        detect: (headers) => {
          if (h(headers, 'Article', 'Color', 'Description', 'Size', 'Quantity', 'Price') && !headers.some(hd => hd.toLowerCase().includes('ean'))) return 0.9;
          return 0;
        },
        reason: 'Article + Color + Description + Size + Quantity + Price',
      },
      {
        fileInputId: 'ean_csv',
        fileInputLabel: 'EAN Retail CSV',
        detect: (headers) => {
          if (h(headers, 'Reference', 'EAN Code', 'Colour Code', 'Retail Price')) return 0.9;
          return 0;
        },
        reason: 'Reference + EAN Code + Colour Code + Retail Price',
      },
    ],
    pdfRules: [{
      fileInputId: 'pdf_invoice',
      fileInputLabel: 'Invoice PDF',
      detect: (fn) => /CFTI\d+/i.test(fn) || fn.toLowerCase().includes('playup') || fn.toLowerCase().includes('play up') ? 0.75 : 0,
      reason: 'Bestandsnaam verwijst naar Play UP',
    }],
  },

  // ── Mini Rodini ──
  {
    supplierId: 'minirodini',
    supplierName: 'Mini Rodini',
    csvRules: [{
      fileInputId: 'main_csv',
      fileInputLabel: 'Product Information CSV',
      detect: (headers) => {
        if (h(headers, 'Art. no.', 'Product Name', 'Variant Name')) return 0.95;
        if (h(headers, 'Art. no.', 'Product Name')) return 0.85;
        return 0;
      },
      reason: 'Art. no. + Product Name + Variant Name',
    }],
  },

  // ── Thinking Mu ── (PDF only)
  {
    supplierId: 'thinkingmu',
    supplierName: 'Thinking Mu',
    csvRules: [],
    pdfRules: [{
      fileInputId: 'pdf_invoice',
      fileInputLabel: 'Invoice PDF',
      detect: (fn) => fn.toLowerCase().includes('thinking') || /INV\d{6}/i.test(fn) ? 0.8 : 0,
      reason: 'Bestandsnaam verwijst naar Thinking Mu',
    }],
  },

  // ── Sunday Collective ── (PDF only)
  {
    supplierId: 'sundaycollective',
    supplierName: 'The Sunday Collective',
    csvRules: [],
    pdfRules: [{
      fileInputId: 'pdf_invoice',
      fileInputLabel: 'Invoice PDF',
      detect: (fn) => fn.toLowerCase().includes('sunday') || fn.toLowerCase().includes('tsc') || fn.toLowerCase().includes('jove') ? 0.75 : 0,
      reason: 'Bestandsnaam verwijst naar Sunday Collective',
    }],
  },

  // ── Babe & Tess ── (PDF only: order)
  {
    supplierId: 'babeandtess',
    supplierName: 'Babe & Tess',
    csvRules: [],
    pdfRules: [{
      fileInputId: 'pdf_invoice',
      fileInputLabel: 'Order PDF',
      detect: (fn) => {
        const l = fn.toLowerCase();
        if (l.includes('babe') && l.includes('tess')) return 0.9;
        if (l.includes('ordine') && (l.endsWith('.pdf') || l.includes('z_ordine'))) return 0.75;
        if (/z_ordine-\d+\.pdf/i.test(fn)) return 0.85;
        return 0;
      },
      reason: 'Babe & Tess order PDF (z_ordine-xxx.pdf)',
    }],
  },

  // ── Tangerine ── (PDF only: packing + optional price)
  {
    supplierId: 'tangerine',
    supplierName: 'Tangerine',
    csvRules: [],
    pdfRules: [
      {
        fileInputId: 'packing_pdf',
        fileInputLabel: 'Packing list PDF',
        detect: (fn) => {
          const l = fn.toLowerCase();
          if (l.includes('tangerine') && (l.includes('packing') || l.includes('packing list'))) return 0.9;
          if (l.includes('tangerine') && l.includes('ss26')) return 0.75;
          return 0;
        },
        reason: 'Packing list Tangerine',
      },
      {
        fileInputId: 'price_pdf',
        fileInputLabel: 'Prijzen PDF',
        detect: (fn) => {
          const l = fn.toLowerCase();
          if (l.includes('imt') && (l.includes('babette') || l.includes('tangerine'))) return 0.85;
          if (l.includes('tangerine') && l.includes('price')) return 0.7;
          return 0;
        },
        reason: 'Prijzen PDF Tangerine',
      },
    ],
  },

  // ── Ao76 ──
  {
    supplierId: 'ao76',
    supplierName: 'Ao76',
    csvRules: [{
      fileInputId: 'main_csv',
      fileInputLabel: 'Ao76 CSV',
      detect: (headers) => {
        if (h(headers, 'Reference', 'Description', 'EAN barcode', 'RRP')) return 0.9;
        if (h(headers, 'Reference', 'Description', 'Size', 'Price')) return 0.75;
        return 0;
      },
      reason: 'Reference + Description + EAN barcode + RRP',
    }],
  },

  // ── Tinycottons ──
  {
    supplierId: 'tinycottons',
    supplierName: 'Tiny Big sister',
    csvRules: [{
      fileInputId: 'main_csv',
      fileInputLabel: 'Tinycottons CSV',
      detect: (headers, text) => {
        const brand = extractBrandFromData(headers, text, ';');
        if (brandMatches(brand, 'tiny')) {
          if (h(headers, 'Product name', 'EAN13')) return 0.95;
        }
        if (h(headers, 'Product name', 'EAN13', 'RRP') && text.toLowerCase().includes('tiny')) return 0.85;
        return 0;
      },
      reason: 'Le New Black format met "Tiny" als merknaam',
    }],
  },

  // ── Indee ──
  {
    supplierId: 'indee',
    supplierName: 'Indee',
    csvRules: [{
      fileInputId: 'main_csv',
      fileInputLabel: 'Indee CSV',
      detect: (headers) => {
        if (h(headers, 'Style', 'Colour', 'WSP EUR', 'Textile Content')) return 0.95;
        if (h(headers, 'Style', 'WSP EUR')) return 0.8;
        return 0;
      },
      reason: 'Style + Colour + WSP EUR + Textile Content',
    }],
  },

  // ── Jenest ──
  {
    supplierId: 'jenest',
    supplierName: 'Jenest',
    csvRules: [{
      fileInputId: 'main_csv',
      fileInputLabel: 'Jenest CSV',
      detect: (headers) => {
        if (h(headers, 'Item number', 'Rec retail price', 'EAN Number', 'Product description')) return 0.95;
        return 0;
      },
      reason: 'Item number + Rec retail price + EAN Number',
    }],
  },

  // ── Favorite People ──
  {
    supplierId: 'favoritepeople',
    supplierName: 'Favorite People',
    csvRules: [{
      fileInputId: 'main_csv',
      fileInputLabel: 'Favorite People CSV',
      detect: (headers) => {
        if (h(headers, 'SKU', 'EAN CODE')) return 0.85;
        return 0;
      },
      reason: 'SKU + EAN CODE kolommen',
    }],
  },

  // ── Le New Black (generic fallback - only matches if no specific brand detected) ──
  {
    supplierId: 'lenewblack',
    supplierName: 'Le New Black',
    csvRules: [{
      fileInputId: 'main_csv',
      fileInputLabel: 'Le New Black CSV',
      detect: (headers, text) => {
        const brand = extractBrandFromData(headers, text, ';');
        // Only match as generic Le New Black if no known brand is detected
        const isKnownBrand = brandMatches(brand, 'emile', 'weekend house', '1+', 'one more', 'new society', 'tiny', 'mipounet');
        if (isKnownBrand) return 0;

        const lines = text.split('\n');
        if (lines.length > 2) {
          const secondLine = lines[1];
          if (secondLine && h(secondLine.split(';').map(s => s.trim()), 'Product reference', 'Brand name', 'Color name', 'Size name', 'EAN13')) return 0.8;
        }
        if (h(headers, 'Product reference', 'Brand name', 'Color name', 'EAN13')) return 0.75;
        return 0;
      },
      reason: 'Le New Black format (onbekend merk)',
    }],
  },

  // ── Onemore (1+ in the family) - Le New Black format ──
  {
    supplierId: 'onemore',
    supplierName: '1+ in the family',
    csvRules: [{
      fileInputId: 'main_csv',
      fileInputLabel: '1+ CSV',
      detect: (headers, text) => {
        const brand = extractBrandFromData(headers, text, ';');
        if (brandMatches(brand, '1+', 'one more', '1 +')) {
          if (h(headers, 'Product reference', 'EAN13')) return 0.95;
        }
        return 0;
      },
      reason: 'Le New Black format met "1+" of "one more" als merknaam',
    }],
  },

  // ── Weekend House Kids - Le New Black format ──
  {
    supplierId: 'weekendhousekids',
    supplierName: 'Weekend House Kids',
    csvRules: [{
      fileInputId: 'main_csv',
      fileInputLabel: 'Weekend House Kids CSV',
      detect: (headers, text) => {
        const brand = extractBrandFromData(headers, text, ';');
        if (brandMatches(brand, 'weekend house', 'weekend kids', 'whk')) {
          if (h(headers, 'Product reference', 'EAN13')) return 0.95;
        }
        return 0;
      },
      reason: 'Le New Black format met "Weekend House" als merknaam',
    }],
  },
];

function detectCSV(fileId: string, fileName: string, content: string): FileDetectionResult {
  const lines = content.trim().split('\n');
  const firstLines = lines.slice(0, 10).join('\n');

  // Try to extract headers - handle various formats
  let headers: string[] = [];
  const delimiters = [';', ',', '\t'];
  for (const d of delimiters) {
    const h = lines[0].split(d).map(s => s.trim().replace(/^"|"$/g, ''));
    if (h.length > headers.length) headers = h;
  }

  // Also check second line as headers (Le New Black skips first line)
  let altHeaders: string[] = [];
  if (lines.length > 1) {
    for (const d of delimiters) {
      const h = lines[1].split(d).map(s => s.trim().replace(/^"|"$/g, ''));
      if (h.length > altHeaders.length) altHeaders = h;
    }
  }

  const matches: DetectionMatch[] = [];

  for (const rule of SUPPLIER_RULES) {
    for (const csvRule of rule.csvRules) {
      let confidence = csvRule.detect(headers, firstLines, fileName);
      // Also try with alt headers
      if (confidence < 0.5 && altHeaders.length > 0) {
        const altConfidence = csvRule.detect(altHeaders, firstLines, fileName);
        if (altConfidence > confidence) confidence = altConfidence;
      }
      if (confidence > 0.3) {
        matches.push({
          supplierId: rule.supplierId,
          supplierName: rule.supplierName,
          fileInputId: csvRule.fileInputId,
          fileInputLabel: csvRule.fileInputLabel,
          confidence,
          reason: csvRule.reason,
        });
      }
    }
  }

  matches.sort((a, b) => b.confidence - a.confidence);
  return { fileId, fileName, isPdf: false, matches, bestMatch: matches[0] || null };
}

function detectPDF(fileId: string, fileName: string): FileDetectionResult {
  const matches: DetectionMatch[] = [];

  for (const rule of SUPPLIER_RULES) {
    if (!rule.pdfRules) continue;
    for (const pdfRule of rule.pdfRules) {
      const confidence = pdfRule.detect(fileName);
      if (confidence > 0.3) {
        matches.push({
          supplierId: rule.supplierId,
          supplierName: rule.supplierName,
          fileInputId: pdfRule.fileInputId,
          fileInputLabel: pdfRule.fileInputLabel,
          confidence,
          reason: pdfRule.reason,
        });
      }
    }
  }

  matches.sort((a, b) => b.confidence - a.confidence);
  return { fileId, fileName, isPdf: true, matches, bestMatch: matches[0] || null };
}

export default function handler(req: NextApiRequest, res: NextApiResponse<DetectionResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, files: [], detectedSupplier: null, detectedSupplierName: null, allFilesMatched: false, error: 'Method not allowed' });
  }

  try {
    const { files: inputFiles } = req.body as { files: FileDetectionInput[] };
    if (!inputFiles?.length) {
      return res.status(400).json({ success: false, files: [], detectedSupplier: null, detectedSupplierName: null, allFilesMatched: false, error: 'No files provided' });
    }

    const results: FileDetectionResult[] = inputFiles.map(f =>
      f.isPdf ? detectPDF(f.fileId, f.fileName) : detectCSV(f.fileId, f.fileName, f.content || '')
    );

    // Determine the overall supplier by voting across all files
    const supplierVotes = new Map<string, { name: string; totalConfidence: number; count: number }>();
    for (const r of results) {
      if (r.bestMatch) {
        const existing = supplierVotes.get(r.bestMatch.supplierId);
        if (existing) {
          existing.totalConfidence += r.bestMatch.confidence;
          existing.count++;
        } else {
          supplierVotes.set(r.bestMatch.supplierId, {
            name: r.bestMatch.supplierName,
            totalConfidence: r.bestMatch.confidence,
            count: 1,
          });
        }
      }
    }

    let detectedSupplier: string | null = null;
    let detectedSupplierName: string | null = null;
    let bestScore = 0;

    for (const [id, vote] of supplierVotes) {
      const score = vote.totalConfidence * vote.count;
      if (score > bestScore) {
        bestScore = score;
        detectedSupplier = id;
        detectedSupplierName = vote.name;
      }
    }

    const allFilesMatched = results.every(r => r.bestMatch && r.bestMatch.confidence >= 0.6);

    return res.status(200).json({
      success: true,
      files: results,
      detectedSupplier,
      detectedSupplierName,
      allFilesMatched,
    });
  } catch (error) {
    return res.status(500).json({ success: false, files: [], detectedSupplier: null, detectedSupplierName: null, allFilesMatched: false, error: (error as Error).message });
  }
}
