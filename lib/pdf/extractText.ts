/**
 * Server-side PDF text extraction that works on Vercel.
 *
 * pdf-parse/pdfjs-dist fails there when the worker file is missing from the
 * serverless bundle. We set an inlined data-URL worker via getWorkerSource().
 */

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

/** Call before any PDFParse / pdfjs usage on serverless. */
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

export async function extractPdfText(data: Uint8Array | Buffer): Promise<string> {
  ensurePdfWorker();
  // pdfjs rejects Node Buffer (even though it extends Uint8Array) — always copy
  const pdfData = new Uint8Array(data);
  const parser = new PDFParse(pdfData);
  const textResult = await parser.getText();
  return normalizeTextResult(textResult);
}
