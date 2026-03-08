/**
 * Core types for the supplier plugin system.
 * Each supplier implements SupplierPlugin to define how their files are parsed.
 */

import type { SizeAttribute } from '@/lib/import/shared';

// ─── Parsed Product Types (shared across all suppliers) ─────────────────────

export interface ParsedProduct {
  reference: string;
  name: string;
  originalName?: string;
  productName?: string;
  material: string;
  color: string;
  fabricPrint?: string;
  ecommerceDescription?: string;
  csvCategory?: string;
  variants: ProductVariant[];
  suggestedBrand?: string;
  selectedBrand?: { id: number; name: string };
  category?: { id: number; name: string; display_name?: string };
  publicCategories: Array<{ id: number; name: string }>;
  productTags: Array<{ id: number; name: string }>;
  isFavorite: boolean;
  isPublished: boolean;
  sizeAttribute?: string;
  images?: string[];
  imagesFetched?: boolean;
}

export interface ProductVariant {
  size: string;
  quantity: number;
  ean: string;
  sku?: string;
  price: number;
  rrp: number;
}

export interface Brand {
  id: number;
  name: string;
  source: string;
}

// ─── File Input Configuration ───────────────────────────────────────────────

export type FileInputType = 'csv' | 'pdf' | 'xlsx';

export interface FileInputConfig {
  /** Unique key for this file input (e.g. 'main_csv', 'ean_csv', 'pdf_invoice') */
  id: string;
  /** Display label shown in the UI */
  label: string;
  /** Accepted file extensions */
  accept: string;
  /** Whether this file is required for parsing */
  required: boolean;
  /** Allow selecting multiple files */
  multiple?: boolean;
  /** File type hint for routing */
  type: FileInputType;
}

// ─── Supplier Files (passed to parser) ──────────────────────────────────────

export interface SupplierFiles {
  /** Map of fileInput.id -> file content(s) */
  [fileInputId: string]: string | string[];
}

// ─── Image Matching ─────────────────────────────────────────────────────────

export interface ImageMatchingConfig {
  /** How images are matched to products */
  strategy: 'reference' | 'filename-pattern' | 'manual';
  /** Extract product reference from an image filename */
  extractReference?: (filename: string) => string | null;
}

export interface ImageUploadConfig {
  /** Whether this supplier supports inline image upload after import */
  enabled: boolean;
  /** Instructions for the user (filename format, etc.) */
  instructions: string;
  /** Example filenames to show the user */
  exampleFilenames: string[];
  /** Regex to validate image filenames (only matching files are accepted) */
  filenameFilter: RegExp;
  /** Extract product reference from image filename (and optional relative path when selecting a folder). When relativePath is set, the parent folder name can be used as reference (e.g. TG-622). */
  extractReference: (filename: string, relativePath?: string) => string | null;
  /** Map filename to a display name with Main/Extra info for the upload API */
  mapFilename?: (filename: string, reference: string) => string;
  /** Link to a dedicated image import page (if exists) */
  dedicatedPageUrl?: string;
  /** Label for the dedicated page link */
  dedicatedPageLabel?: string;
}

// ─── Parse Context (runtime data available during parsing) ──────────────────

export interface ParseContext {
  /** Available brands from Odoo */
  brands: Brand[];
  /** Find a brand by name (case-insensitive partial match) */
  findBrand: (...searchTerms: string[]) => Brand | undefined;
  /** Currently selected vendor ID (for shared parsers like floss/brunobruno) */
  vendorId: string;
}

// ─── Enrichment Result ──────────────────────────────────────────────────────

export interface EnrichmentResult {
  products: ParsedProduct[];
  message?: string;
}

// ─── File Detection (for suppliers accepting multiple CSV types) ────────────

export interface FileDetectionRule {
  /** File input ID this rule routes to */
  fileInputId: string;
  /** Check function: given the file text (or first line), determine if it matches */
  detect: (text: string, filename: string) => boolean;
  /** Error message if wrong file order (e.g. "Upload catalog CSV first") */
  orderError?: string;
  /** If true, this file requires products to already be loaded */
  requiresExistingProducts?: boolean;
}

// ─── The Supplier Plugin Interface ──────────────────────────────────────────

export interface SupplierPlugin {
  /** Unique identifier (e.g. 'floss', 'armedangels') */
  id: string;
  /** Display name shown in the UI dropdown */
  displayName: string;
  /** Default brand name for auto-detection in Odoo */
  brandName: string;

  /** File inputs this supplier accepts */
  fileInputs: FileInputConfig[];

  /**
   * Auto-detection rules for suppliers that accept multiple CSV files
   * through a single upload button. If defined, the system uses these
   * to route uploaded files to the correct fileInput slot.
   */
  fileDetection?: FileDetectionRule[];

  /**
   * Main parse function: takes uploaded file contents and returns products.
   * For CSV suppliers, this is called with the text content.
   * For PDF suppliers, parsing happens server-side; this receives the parsed data.
   */
  parse: (files: SupplierFiles, context: ParseContext) => ParsedProduct[];

  /**
   * Server-side file inputs: file inputs that need server-side processing (PDF parsing).
   * These IDs correspond to fileInputs that should be uploaded to an API endpoint.
   */
  serverSideFileInputs?: string[];

  /**
   * API endpoint for server-side file parsing (e.g. '/api/parse-supplier-pdf').
   * If serverSideFileInputs is defined, this must be too.
   */
  pdfParseEndpoint?: string;

  /**
   * Post-process PDF results and merge with existing products.
   * Called after the server-side PDF parser returns data.
   */
  processPdfResults?: (
    pdfData: Record<string, unknown>,
    existingProducts: ParsedProduct[],
    context: ParseContext
  ) => EnrichmentResult;

  /** Image matching configuration */
  imageMatching?: ImageMatchingConfig;

  /** Image upload configuration for post-import image upload */
  imageUpload?: ImageUploadConfig;

  /**
   * Optional: custom size attribute override.
   * If not provided, determineSizeAttribute() from shared utils is used.
   */
  defaultSizeAttribute?: SizeAttribute;
}

// ─── Declarative CSV Supplier Config (for createCSVSupplier factory) ────────

export type PriceFormat = 'european' | 'standard';
export type SizeFormat = 'eu' | 'age' | 'y-suffix' | 'm-suffix' | 'raw';
export type NameCasing = 'title' | 'sentence' | 'none';

export interface ColumnMapping {
  /** Column header name or index */
  column: string;
  /** Price format for this column */
  format?: PriceFormat;
  /** Transform function applied to the raw value */
  transform?: (value: string) => string;
}

export interface DeclarativeCSVConfig {
  id: string;
  displayName: string;
  brandName: string;

  csv: {
    delimiter?: string | 'auto';
    skipRows?: number;
    columns: {
      reference: string | ColumnMapping;
      name: string | ColumnMapping;
      color?: string | ColumnMapping;
      size?: string | ColumnMapping;
      material?: string | ColumnMapping;
      description?: string | ColumnMapping;
      category?: string | ColumnMapping;
      price: string | ColumnMapping;
      rrp: string | ColumnMapping;
      ean?: string | ColumnMapping;
      sku?: string | ColumnMapping;
      quantity?: string | ColumnMapping;
    };
  };

  /** Product name template: "{brand} - {name} - {color}" */
  nameTemplate: string;
  /** Casing rules for name template fields */
  nameCasing?: Record<string, NameCasing>;
  /** Size conversion format */
  sizeFormat?: SizeFormat;
  /** Product grouping key: how to group rows into products */
  groupBy?: 'reference' | 'reference-color';
  /** Default RRP multiplier if RRP column is missing */
  rrpMultiplier?: number;

  /** Additional file inputs beyond the main CSV */
  additionalFileInputs?: FileInputConfig[];
  /** File detection rules */
  fileDetection?: FileDetectionRule[];
  /** Image matching */
  imageMatching?: ImageMatchingConfig;
}
