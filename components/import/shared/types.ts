/**
 * Types specific to the import wizard UI that aren't part of the supplier plugin system.
 */

export interface Category {
  id: number;
  name: string;
  display_name?: string;
  complete_name?: string;
}

export interface StepConfig {
  id: number;
  name: string;
  icon: string;
}

export type ImportProductStatus = 'success' | 'partial' | 'failed';

export interface ImportResultItem {
  success: boolean;
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
}

export interface ImportResults {
  success: boolean;
  hasPartial?: boolean;
  results: ImportResultItem[];
  summary?: {
    total: number;
    successful: number;
    partial: number;
    failed: number;
    totalVariantsCreated: number;
    totalVariantsUpdated: number;
    vendor: string;
    timestamp: string;
  };
}

export interface ImagePoolItem {
  id: string;
  dataUrl: string;
  filename: string;
  file: File;
  assignedReference: string;
  order: number;
}

export interface ImportProgress {
  current: number;
  total: number;
  currentProduct?: string;
}

export interface ImageUploadProgressState {
  current: number;
  total: number;
  currentProduct?: string;
  currentFile?: string;
}

export interface ImageImportResult {
  reference: string;
  success: boolean;
  imagesUploaded: number;
  error?: string;
}
