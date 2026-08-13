import type { UploadPoolResult } from '@/lib/images/types';

export type ImageUploadLogStatus = 'success' | 'partial' | 'failed' | 'skipped';

export type ImageUploadLogEvent = {
  ts: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  reference?: string;
  filename?: string;
};

export type ImageUploadLogResult = {
  reference: string;
  name: string | null;
  templateId: number | null;
  status: ImageUploadLogStatus;
  success: boolean;
  partial: boolean;
  imagesUploaded: number;
  imagesFailed: number;
  imagesExpected: number;
  filenamesUploaded: string[];
  filenamesFailed: string[];
  message: string | null;
  errors: string[];
};

export type ImageUploadLogPayload = {
  version: 1;
  kind: 'image-upload-log';
  vendor: string;
  timestamp: string;
  sourceLabel?: string | null;
  summary: {
    total: number;
    successful: number;
    partial: number;
    failed: number;
    skipped: number;
    totalImagesUploaded: number;
    totalImagesFailed: number;
    unassignedImages: number;
  };
  results: ImageUploadLogResult[];
  events: ImageUploadLogEvent[];
  unassignedFilenames: string[];
};

function statusFromPool(r: UploadPoolResult): ImageUploadLogStatus {
  if (r.uploaded > 0 && r.failed > 0) return 'partial';
  if (r.success && r.failed === 0) return 'success';
  if (r.uploaded > 0) return 'partial';
  return 'failed';
}

export function buildImageUploadLogPayload(input: {
  vendor: string;
  timestamp?: string;
  sourceLabel?: string | null;
  poolResults: UploadPoolResult[];
  /** All targets that were in scope for this upload run. */
  targets: Array<{
    key: string;
    reference?: string;
    label?: string;
    templateId?: number;
  }>;
  /** How many images were assigned per target key before upload. */
  expectedByKey: Record<string, number>;
  /** Filenames assigned per target key. */
  filenamesByKey?: Record<string, string[]>;
  unassignedFilenames?: string[];
  events?: ImageUploadLogEvent[];
}): ImageUploadLogPayload {
  const byKey = new Map(input.poolResults.map((r) => [r.key, r]));
  const results: ImageUploadLogResult[] = [];

  for (const target of input.targets) {
    const ref = target.reference || target.key;
    const pool = byKey.get(target.key);
    const expected =
      input.expectedByKey[target.key] ??
      input.filenamesByKey?.[target.key]?.length ??
      0;

    if (!pool) {
      if (expected === 0) {
        results.push({
          reference: ref,
          name: target.label || null,
          templateId: target.templateId ?? null,
          status: 'skipped',
          success: false,
          partial: false,
          imagesUploaded: 0,
          imagesFailed: 0,
          imagesExpected: 0,
          filenamesUploaded: [],
          filenamesFailed: [],
          message: 'Geen afbeeldingen toegewezen — overgeslagen',
          errors: [],
        });
      } else {
        results.push({
          reference: ref,
          name: target.label || null,
          templateId: target.templateId ?? null,
          status: 'failed',
          success: false,
          partial: false,
          imagesUploaded: 0,
          imagesFailed: expected,
          imagesExpected: expected,
          filenamesUploaded: [],
          filenamesFailed: input.filenamesByKey?.[target.key] || [],
          message: 'Geen uploadresultaat ontvangen',
          errors: ['Geen uploadresultaat'],
        });
      }
      continue;
    }

    const status = statusFromPool(pool);
    const filenamesUploaded =
      pool.filenamesUploaded ||
      (status === 'success'
        ? input.filenamesByKey?.[target.key] || []
        : []);
    const filenamesFailed =
      pool.filenamesFailed ||
      (status === 'failed'
        ? input.filenamesByKey?.[target.key] || []
        : []);

    results.push({
      reference: ref,
      name: target.label || null,
      templateId: pool.templateId || target.templateId || null,
      status,
      success: status === 'success',
      partial: status === 'partial',
      imagesUploaded: pool.uploaded,
      imagesFailed: pool.failed,
      imagesExpected: expected,
      filenamesUploaded,
      filenamesFailed,
      message:
        status === 'success'
          ? `${pool.uploaded}/${expected || pool.uploaded} afbeeldingen geüpload`
          : status === 'partial'
            ? `${pool.uploaded} geüpload, ${pool.failed} mislukt`
            : pool.errors.join('; ') || 'Upload mislukt',
      errors: pool.errors || [],
    });
  }

  const summary = {
    total: results.length,
    successful: results.filter((r) => r.status === 'success').length,
    partial: results.filter((r) => r.status === 'partial').length,
    failed: results.filter((r) => r.status === 'failed').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    totalImagesUploaded: results.reduce((s, r) => s + r.imagesUploaded, 0),
    totalImagesFailed: results.reduce((s, r) => s + r.imagesFailed, 0),
    unassignedImages: input.unassignedFilenames?.length || 0,
  };

  return {
    version: 1,
    kind: 'image-upload-log',
    vendor: input.vendor,
    timestamp: input.timestamp || new Date().toISOString(),
    sourceLabel: input.sourceLabel ?? null,
    summary,
    results,
    events: input.events || [],
    unassignedFilenames: input.unassignedFilenames || [],
  };
}

export function downloadImageUploadLog(
  payload: ImageUploadLogPayload,
  filename?: string,
): string {
  const stamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, '-');
  const name =
    filename || `image-upload-log-${payload.vendor}-${stamp}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return name;
}
