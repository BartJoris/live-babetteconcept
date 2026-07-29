/**
 * Server-side PDF text extraction that works on Vercel.
 *
 * pdf-parse/pdfjs-dist often fails there ("Setting up fake worker failed")
 * because the worker file is missing from the serverless bundle.
 * Text extraction therefore uses `unpdf`, which ships a serverless PDF.js
 * build with an inlined worker.
 *
 * `ensurePdfWorker()` remains for callers that still need pdf-parse
 * (e.g. Tangerine getTable / rotated pages).
 */

import { extractText as unpdfExtractText, getDocumentProxy } from 'unpdf';
import { getWorkerSource } from 'pdf-parse/worker';
import { PDFParse } from 'pdf-parse';

let workerConfigured = false;

function ensureDomMatrixPolyfill(): void {
  if (typeof DOMMatrix === 'undefined') {
    (globalThis as { DOMMatrix?: unknown }).DOMMatrix = function () {
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    };
  }
}

/** PDF.js 5.x may call Math.sumPrecise; not available on all Node runtimes (incl. Vercel 22.x). */
function ensureMathSumPrecisePolyfill(): void {
  const math = Math as Math & { sumPrecise?: (values: Iterable<number>) => number };
  if (typeof math.sumPrecise !== 'function') {
    math.sumPrecise = (values) => {
      let total = 0;
      for (const value of values) total += value;
      return total;
    };
  }
}

/** Call before any PDFParse / pdfjs usage that still goes through pdf-parse. */
export function ensurePdfWorker(): void {
  if (workerConfigured) return;
  ensureDomMatrixPolyfill();
  // Inline worker (data: URL) — avoids /var/task/.../pdf.worker.mjs missing on Vercel
  PDFParse.setWorker(getWorkerSource());
  workerConfigured = true;
}

function normalizeTextResult(textResult: unknown): string {
  if (!textResult) return '';

  if (typeof textResult === 'string') return textResult;

  if (typeof textResult === 'object') {
    const result = textResult as {
      text?: string;
      pages?: Array<{ text?: string }>;
    };
    if (result.text) return result.text;
    if (Array.isArray(result.pages)) {
      return result.pages.map((page) => page.text || '').join('\n');
    }
    if (Array.isArray(textResult)) {
      return (textResult as Array<{ text?: string } | string>)
        .map((page) => (typeof page === 'string' ? page : page.text || ''))
        .join('\n');
    }
  }

  return String(textResult);
}

/**
 * Extract plain text from a PDF buffer. Prefer this over raw pdf-parse on Vercel.
 */
export async function extractPdfText(data: Uint8Array | Buffer): Promise<string> {
  const pdfData = data instanceof Uint8Array ? data : new Uint8Array(data);
  ensureMathSumPrecisePolyfill();

  try {
    const pdf = await getDocumentProxy(pdfData);
    const { text } = await unpdfExtractText(pdf, { mergePages: true });
    if (text.trim()) return text;
  } catch (unpdfError) {
    console.warn('unpdf extract failed, falling back to pdf-parse:', unpdfError);
  }

  // Fallback for edge cases where unpdf cannot read the file
  ensurePdfWorker();
  const parser = new PDFParse(pdfData);
  try {
    const textResult = await parser.getText();
    return normalizeTextResult(textResult);
  } finally {
    try {
      await parser.destroy();
    } catch {
      /* ignore */
    }
  }
}
