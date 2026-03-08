import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

interface TangerinePdfProduct {
  reference: string;
  name: string;
  color: string;
  size: string;
  quantity: number;
  price: number;
  rrp: number;
  ean?: string;
  sku?: string;
}

if (typeof DOMMatrix === 'undefined') {
  (globalThis as { DOMMatrix?: unknown }).DOMMatrix = function () {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  };
}

/** Extract text from PDF using pdf-parse getText (default viewport). */
async function extractTextFromPdf(pdfPath: string): Promise<string> {
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfData = new Uint8Array(pdfBuffer);
  const pdfModule = await import('pdf-parse');
  const { PDFParse } = pdfModule;
  const parser = new PDFParse(pdfData);
  const textResult = await parser.getText();
  await parser.destroy();
  if (textResult && typeof textResult === 'object') {
    if (textResult.text) return textResult.text;
    if (textResult.pages && Array.isArray(textResult.pages)) {
      return textResult.pages.map((p: { text?: string }) => p.text || '').join('\n');
    }
    if (Array.isArray(textResult)) {
      return textResult.map((p: { text?: string } | string) => (typeof p === 'string' ? p : (p.text || ''))).join('\n');
    }
  }
  return String(textResult || '');
}

/**
 * Extract text with different viewport rotations (0, 90, 180, 270).
 * Handles landscape PDFs where text order depends on rotation; returns the extraction that parses to the most products.
 */
async function extractTextWithRotations(pdfPath: string): Promise<{ text: string; rotation: number }[]> {
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfData = new Uint8Array(pdfBuffer);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: pdfData }).promise;
  const numPages = doc.numPages;
  const results: { text: string; rotation: number }[] = [];

  for (const rotation of [0, 90, 180, 270]) {
    const pageTexts: string[] = [];
    for (let p = 1; p <= numPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1, rotation: rotation as 0 | 90 | 180 | 270 });
      const textContent = await page.getTextContent({ includeMarkedContent: false, disableNormalization: false });
      type Item = { str?: string; transform?: number[]; width?: number; height?: number; hasEOL?: boolean };
      const items = (textContent.items as Item[])
        .filter((it) => it.str != null)
        .map((it) => {
          const tm = it.transform || [];
          const [x, y] = viewport.convertToViewportPoint(tm[4], tm[5]);
          return { str: it.str!, x, y, w: it.width || 0, hasEOL: it.hasEOL };
        });
      items.sort((a, b) => {
        const dy = b.y - a.y;
        if (Math.abs(dy) > 2) return dy > 0 ? 1 : -1;
        return a.x - b.x;
      });
      const lineThreshold = 5;
      let lastY = Infinity;
      const parts: string[] = [];
      for (const it of items) {
        if (lastY !== Infinity && Math.abs(it.y - lastY) > lineThreshold) parts.push('\n');
        parts.push(it.str);
        if (it.hasEOL) parts.push('\n');
        lastY = it.y;
      }
      pageTexts.push(parts.join(''));
    }
    results.push({ text: pageTexts.join('\n'), rotation });
  }
  await doc.destroy();
  return results;
}

/** Try to extract tables via pdf-parse getTable(); parse into products if structure matches. */
async function extractProductsFromPdfTables(pdfPath: string): Promise<TangerinePdfProduct[]> {
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfData = new Uint8Array(pdfBuffer);
  const pdfModule = await import('pdf-parse');
  const { PDFParse } = pdfModule;
  const parser = new PDFParse(pdfData);
  const tableResult = await parser.getTable();
  await parser.destroy();
  const allRows: string[][] = [];
  for (const page of tableResult.pages || []) {
    for (const table of page.tables || []) {
      if (Array.isArray(table) && table.length > 0) allRows.push(...(table as unknown as string[][]));
    }
  }
  if (allRows.length < 2) return [];
  const header = allRows[0].map((c) => String(c).toLowerCase());
  const col = (name: string) => header.findIndex((h) => h.includes(name));
  const iRef = col('reference');
  const iName = header.findIndex((h) => h.includes('product') && h.includes('name'));
  const iColor = col('color');
  const iSize = col('size');
  const iUnits = col('units');
  const iEan = col('ean') >= 0 ? col('ean') : col('barcode');
  if (iRef === -1) return [];
  const products: TangerinePdfProduct[] = [];
  let lastRef = '';
  let lastName = '';
  let lastColor = '';
  for (let i = 1; i < allRows.length; i++) {
    const cells = allRows[i].map((c) => String(c).trim());
    let refRaw = (cells[iRef] || '').trim();
    if (/^TOTAL\s+OF\s+REFERENCE/i.test(refRaw)) continue;
    if (refRaw) {
      const m = refRaw.match(/^(TG-?\d+)(?:\s*\(([^)]+)\))?/i);
      if (m) {
        lastRef = m[1].replace(/^TG(\d+)/i, 'TG-$1');
        lastName = iName >= 0 ? (cells[iName] || '') : lastRef;
        lastColor = iColor >= 0 ? (cells[iColor] || '') : (m[2] || '');
      }
    }
    const ref = lastRef || refRaw.replace(/^TG(\d+)/i, 'TG-$1');
    if (!ref || !/^TG-?\d+/i.test(ref)) continue;
    const name = (refRaw && iName >= 0 ? cells[iName] : lastName) || ref;
    const color = refRaw && iColor >= 0 ? cells[iColor] : lastColor;
    const size = iSize >= 0 ? (cells[iSize] || '') : '';
    const qty = iUnits >= 0 ? parseInt(cells[iUnits] || '1', 10) : 1;
    let ean = iEan >= 0 ? (cells[iEan] || '') : '';
    if (ean) ean = ean.replace(/\s/g, '').replace(/\./g, '');
    products.push({
      reference: ref,
      name,
      color,
      size,
      quantity: qty,
      price: 0,
      rrp: 0,
      ean: ean || undefined,
    });
  }
  return products;
}

function parseEuroPrice(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace(/[€\s\t]/g, '').replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

/**
 * Parse packing list PDF. Expects text with product refs (TG-xxx), names, colors, sizes, quantities.
 * Flexible: look for TG-xxx or TG xxx, then size/qty/price on same or next lines.
 */
function parsePackingPdf(pdfText: string): TangerinePdfProduct[] {
  const products: TangerinePdfProduct[] = [];
  const lines = pdfText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Ref pattern: TG-622, TG-789 BLUE, TG622
  const refPattern = /(TG-?\d+(?:\s+[A-Z]+)?)/gi;
  // EU sizes: 92, 98, 104, 110/116, 92/98, or age: 2 jaar, 3 jaar, 2Y, 4Y-5Y
  const sizePattern = /(\d{2,3}(?:\/\d{2,3})?|\d+\s*jaar|\d+\s*maand|\d+Y(?:\s*-\s*\d+Y)?)/i;
  const pricePattern = /€?\s*(\d+[,.]\d{2})/g;

  let currentRef = '';
  let currentName = '';
  let currentColor = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const refMatch = line.match(refPattern);
    if (refMatch) {
      const ref = refMatch[0].replace(/\s+/g, ' ').trim();
      if (/^TG-?\d+/i.test(ref)) {
        currentRef = ref.replace(/^TG(\d+)/i, 'TG-$1');
        const rest = line.replace(ref, '').trim();
        if (rest && rest.length > 2 && !/^\d|€/.test(rest)) {
          const parts = rest.split(/\s{2,}|\t/).filter(Boolean);
          if (parts[0]) currentName = parts[0];
          if (parts[1]) currentColor = parts[1];
        }
      }
    }

    if (currentRef) {
      const sizesInLine = line.match(sizePattern);
      const prices = [...line.matchAll(pricePattern)];
      const qtyMatch = line.match(/\b(\d{1,3})\s*(?:st|pcs|qty|€|$)/i) || line.match(/\s(\d{1,3})\s+[€\d]/);

      if (sizesInLine || prices.length > 0 || qtyMatch) {
        const size = sizesInLine ? sizesInLine[1].trim() : '';
        const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
        const price = prices.length > 0 ? parseEuroPrice(prices[prices.length - 1][1]) : 0;
        if (size || qty > 0) {
          products.push({
            reference: currentRef,
            name: currentName || currentRef,
            color: currentColor,
            size,
            quantity: qty,
            price,
            rrp: 0,
          });
        }
      }

      if (refMatch && refMatch[0] !== currentRef) {
        currentRef = refMatch[0].replace(/^TG(\d+)/i, 'TG-$1');
      }
    }
  }

  // Fallback: line-by-line scan for "TG-xxx ... size ... qty ... price"
  if (products.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/(TG-?\d+)(?:\s+([^\d€]+?))?\s+(\d{2,3}(?:\/\d{2,3})?|\d+\s*jaar|\d+Y)?\s*(\d+)?\s*€?\s*(\d+[,.]\d{2})?/i);
      if (m) {
        const ref = m[1].replace(/^TG(\d+)/i, 'TG-$1');
        const nameColor = (m[2] || '').trim();
        const size = (m[3] || '').trim();
        const qty = m[4] ? parseInt(m[4], 10) : 1;
        const price = m[5] ? parseEuroPrice(m[5]) : 0;
        const name = nameColor && !/^\d|€/.test(nameColor) ? nameColor : ref;
        products.push({
          reference: ref,
          name,
          color: currentColor || '',
          size,
          quantity: qty,
          price,
          rrp: 0,
        });
      }
    }
  }

  return products;
}

/**
 * Parse price PDF. Expects lines with TG-xxx (or similar) and a euro price (RRP).
 */
function parsePricePdf(pdfText: string): Map<string, number> {
  const priceMap = new Map<string, number>();
  const lines = pdfText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const refPattern = /(TG-?\d+(?:\s+[A-Z]+)?)/gi;
  const pricePattern = /€?\s*(\d+[,.]\d{2})/g;

  for (const line of lines) {
    const refMatch = line.match(refPattern);
    const prices = [...line.matchAll(pricePattern)];
    if (refMatch && prices.length > 0) {
      const ref = refMatch[0].replace(/^TG(\d+)/i, 'TG-$1').replace(/\s+/g, ' ');
      const price = parseEuroPrice(prices[prices.length - 1][1]);
      if (price > 0) priceMap.set(ref, price);
    }
  }
  return priceMap;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable({});
    const [, files] = await form.parse(req);

    const packingFile = files.packing?.[0] || files.packing_pdf?.[0] || files.pdf?.[0];
    const priceFile = files.price?.[0] || files.price_pdf?.[0];

    // Only price PDF uploaded (e.g. second file on product-import): return price map to merge client-side
    if (!packingFile && priceFile) {
      try {
        const priceText = await extractTextFromPdf(priceFile.filepath);
        const priceMap = parsePricePdf(priceText);
        const prices: Record<string, number> = Object.fromEntries(priceMap);
        try { fs.unlinkSync(priceFile.filepath); } catch (_) {}
        return res.status(200).json({ success: true, prices, productCount: 0 });
      } catch (err) {
        try { fs.unlinkSync(priceFile.filepath); } catch (_) {}
        throw err;
      }
    }

    if (!packingFile) {
      return res.status(400).json({ error: 'Packing list PDF ontbreekt. Upload het packing list PDF.' });
    }

    const toClean: string[] = [packingFile.filepath];
    if (priceFile) toClean.push(priceFile.filepath);

    try {
      // 1) Try table extraction first (works when PDF has visible table lines)
      let products = await extractProductsFromPdfTables(packingFile.filepath);

      if (products.length === 0) {
        // 2) Try standard text extraction (landscape/portrait default)
        let packingText = await extractTextFromPdf(packingFile.filepath);
        if (packingText.length >= 50) {
          const hasTgRef = /TG-?\d+/i.test(packingText);
          const readableAscii = (packingText.match(/[A-Za-z0-9\s.,;:\-€]/g) || []).length;
          const readableRatio = readableAscii / Math.max(1, packingText.length);
          if (hasTgRef || readableRatio >= 0.4) {
            products = parsePackingPdf(packingText);
          }
        }
        // 3) If still no products, try text extraction with different viewport rotations (landscape PDFs)
        if (products.length === 0 && packingText.length >= 20) {
          try {
            const rotations = await extractTextWithRotations(packingFile.filepath);
            for (const { text } of rotations) {
              const parsed = parsePackingPdf(text);
              if (parsed.length > products.length) products = parsed;
            }
          } catch (_) {
            // ignore rotation extraction errors
          }
        }
      }

      if (products.length === 0) {
        const packingText = await extractTextFromPdf(packingFile.filepath);
        if (packingText.length < 50) {
          return res.status(200).json({
            success: false,
            error: 'Kon geen tekst uit packing PDF halen. Het bestand is mogelijk een scan of gebruikt een niet-ondersteunde encoding.',
          });
        }
        const hasTgRef = /TG-?\d+/i.test(packingText);
        const readableAscii = (packingText.match(/[A-Za-z0-9\s.,;:\-€]/g) || []).length;
        const readableRatio = readableAscii / Math.max(1, packingText.length);
        if (!hasTgRef && readableRatio < 0.4) {
          return res.status(200).json({
            success: false,
            error: 'De tekst in dit PDF kon niet correct worden gelezen (font/encoding). Het document is horizontaal (landscape); exporteer de packing list naar Excel/CSV en upload die, of vraag Tangerine om een PDF met selecteerbare tekst.',
          });
        }
        return res.status(200).json({
          success: false,
          error: 'Geen producten gevonden in packing PDF. Controleer het formaat of gebruik de CSV-export.',
          debugText: packingText.substring(0, 3000),
          debugLines: packingText.split('\n').slice(0, 80),
        });
      }
      let priceMap = new Map<string, number>();

      if (priceFile) {
        const priceText = await extractTextFromPdf(priceFile.filepath);
        priceMap = parsePricePdf(priceText);
        for (const p of products) {
          const rrp = priceMap.get(p.reference) ?? priceMap.get(p.reference.replace(/\s+/g, '')) ?? 0;
          p.rrp = rrp;
        }
      }

      for (const p of toClean) {
        try {
          fs.unlinkSync(p);
        } catch (_) {}
      }

      return res.status(200).json({
        success: true,
        products,
        productCount: products.length,
      });
    } catch (err) {
      for (const p of toClean) {
        try {
          fs.unlinkSync(p);
        } catch (_) {}
      }
      throw err;
    }
  } catch (error) {
    console.error('Tangerine PDF parse error:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to parse PDF',
    });
  }
}
