export type ImportProductStatus = 'success' | 'partial' | 'failed';

export type ImportResultLike = {
  success?: boolean;
  status?: ImportProductStatus;
  partial?: boolean;
  reference: string;
  name?: string;
  templateId?: number;
  variantsCreated?: number;
  variantsUpdated?: number;
  variantsExpected?: number;
  imagesUploaded?: number;
  message?: string;
  warnings?: string[];
};

export function resolveImportStatus(row: ImportResultLike): ImportProductStatus {
  if (row.status === 'success' || row.status === 'partial' || row.status === 'failed') {
    return row.status;
  }
  if (row.partial) return 'partial';
  if (row.success === false) return 'failed';
  return 'success';
}

export function isImportFullSuccess(row: ImportResultLike): boolean {
  return resolveImportStatus(row) === 'success';
}

/** Products that exist in Odoo and can receive images / be retried for missing EANs. */
export function isImportRecoverable(row: ImportResultLike): boolean {
  const status = resolveImportStatus(row);
  return status === 'partial' || status === 'failed';
}

export function summarizeImportResults(results: ImportResultLike[]) {
  let successful = 0;
  let partial = 0;
  let failed = 0;
  for (const row of results) {
    const status = resolveImportStatus(row);
    if (status === 'success') successful += 1;
    else if (status === 'partial') partial += 1;
    else failed += 1;
  }
  return {
    total: results.length,
    successful,
    partial,
    failed,
    totalVariantsCreated: results.reduce(
      (sum, r) => sum + (r.variantsCreated || 0),
      0,
    ),
    totalVariantsUpdated: results.reduce(
      (sum, r) => sum + (r.variantsUpdated || 0),
      0,
    ),
  };
}

export function buildPartialVariantMessage(
  updated: number,
  expected: number,
): string {
  return `Slechts ${updated}/${expected} maten bijgewerkt (EAN/prijs). Controleer het importlog en probeer dit product opnieuw.`;
}

export function buildImportLogPayload(input: {
  vendor: string;
  timestamp: string;
  results: ImportResultLike[];
}) {
  const summary = summarizeImportResults(input.results);
  return {
    version: 1 as const,
    kind: 'import-result-log' as const,
    vendor: input.vendor,
    timestamp: input.timestamp,
    summary,
    results: input.results.map((r) => ({
      reference: r.reference,
      name: r.name || null,
      status: resolveImportStatus(r),
      success: isImportFullSuccess(r),
      partial: resolveImportStatus(r) === 'partial',
      templateId: r.templateId ?? null,
      variantsCreated: r.variantsCreated ?? null,
      variantsUpdated: r.variantsUpdated ?? null,
      variantsExpected: r.variantsExpected ?? null,
      imagesUploaded: r.imagesUploaded ?? null,
      message: r.message || null,
      warnings: r.warnings || [],
    })),
  };
}
