/**
 * Shared types for the supplier onboarding flow (AI file analysis + code generation).
 * Used by both the client wizard (pages/supplier-onboarding.tsx) and the
 * server-side auto-onboarding API (pages/api/suppliers/onboard.ts) so the
 * two share a single generator instead of duplicating logic.
 */

export interface ColumnAnalysis {
  header: string;
  sampleValues: string[];
  suggestedMapping: string | null;
  confidence: number;
}

export interface FileAnalysis {
  fileId: string;
  fileName: string;
  fileType: 'csv' | 'pdf' | 'unknown';
  delimiter?: string;
  rowCount?: number;
  headers?: string[];
  sampleRows?: string[][];
  columnAnalysis?: ColumnAnalysis[];
  suggestedRole: string;
  suggestedRoleLabel: string;
}

export interface AISuggestionFileInput {
  id: string;
  label: string;
  accept: string;
  required: boolean;
  type: 'csv' | 'pdf';
}

export interface AISuggestion {
  id: string;
  displayName: string;
  brandName: string;
  fileInputs: AISuggestionFileInput[];
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

/** A raw sample file as submitted to the onboarding generator/API. */
export interface OnboardingSourceFile {
  fileName: string;
  isPdf: boolean;
}
