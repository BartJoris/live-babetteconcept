import { describe, expect, it } from 'vitest';
import {
  buildImportLogPayload,
  buildPartialVariantMessage,
  isImportRecoverable,
  resolveImportStatus,
  summarizeImportResults,
} from '@/lib/import/import-result-status';

describe('resolveImportStatus', () => {
  it('prefers explicit status', () => {
    expect(resolveImportStatus({ reference: 'A', status: 'partial', success: true })).toBe(
      'partial',
    );
  });

  it('falls back to success boolean', () => {
    expect(resolveImportStatus({ reference: 'A', success: true })).toBe('success');
    expect(resolveImportStatus({ reference: 'A', success: false })).toBe('failed');
  });
});

describe('summarizeImportResults', () => {
  it('counts success, partial and failed', () => {
    const summary = summarizeImportResults([
      { reference: '1', status: 'success', variantsUpdated: 2 },
      { reference: '2', status: 'partial', variantsUpdated: 1 },
      { reference: '3', success: false },
    ]);
    expect(summary).toMatchObject({
      total: 3,
      successful: 1,
      partial: 1,
      failed: 1,
      totalVariantsUpdated: 3,
    });
  });
});

describe('isImportRecoverable', () => {
  it('retries partial and failed only', () => {
    expect(isImportRecoverable({ reference: 'a', status: 'success' })).toBe(false);
    expect(isImportRecoverable({ reference: 'b', status: 'partial' })).toBe(true);
    expect(isImportRecoverable({ reference: 'c', status: 'failed' })).toBe(true);
  });
});

describe('buildPartialVariantMessage', () => {
  it('mentions updated/expected counts', () => {
    expect(buildPartialVariantMessage(3, 4)).toContain('3/4');
  });
});

describe('buildImportLogPayload', () => {
  it('builds a downloadable log document', () => {
    const log = buildImportLogPayload({
      vendor: 'weekendhousekids',
      timestamp: '2026-07-25T12:00:00.000Z',
      results: [
        {
          reference: 'B26959',
          status: 'partial',
          variantsUpdated: 3,
          variantsExpected: 4,
          message: 'partial',
        },
      ],
    });
    expect(log.kind).toBe('import-result-log');
    expect(log.summary.partial).toBe(1);
    expect(log.results[0].status).toBe('partial');
  });
});
