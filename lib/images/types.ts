/**
 * Unified types for the ProductImageUploader used across wizard, catalog, and brand modes.
 */

export interface ImageTarget {
  key: string;
  label: string;
  templateId?: number;
  reference?: string;
  hasExistingImages?: boolean;
  mainThumbnail?: string | null;
  galleryThumbnails?: Array<{
    id: number;
    name: string;
    thumbnail: string;
    sequence: number;
  }>;
}

export interface PoolImage {
  id: string;
  dataUrl: string;
  filename: string;
  file: File;
  assignedKey: string;
  order: number;
}

export type ProductImageUploaderMode = 'wizard' | 'catalog' | 'brand';

export interface UploadPoolResult {
  key: string;
  templateId: number;
  success: boolean;
  uploaded: number;
  failed: number;
  errors: string[];
}
