import { odooClient } from '@/lib/odooClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FetchedImage {
  base64: string;
  sizeKB: number;
}

export class OdooImageError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'OdooImageError';
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG'];
const MIN_FULL_SIZE_KB = 50;
const SMALL_IMAGE_KB = 100;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class OdooImageService {
  constructor(
    private uid: number,
    private password: string,
  ) {}

  // -----------------------------------------------------------------------
  // URL resolution
  // -----------------------------------------------------------------------

  /**
   * When a URL ends with an underscore (thumbnail convention used by some
   * vendors) try to discover the full-size image by stripping the underscore
   * and probing common extensions.
   *
   * Returns the resolved URL or `null` when no full-size variant was found.
   */
  async resolveFullSizeImage(url: string): Promise<string | null> {
    if (!url.endsWith('_')) return null;

    const base = url.slice(0, -1);

    for (const ext of IMAGE_EXTENSIONS) {
      const candidate = base + ext;
      try {
        const res = await fetch(candidate);
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          const sizeKB = buffer.byteLength / 1024;
          if (sizeKB > MIN_FULL_SIZE_KB) return candidate;
        }
      } catch {
        // try next extension
      }
    }

    try {
      const res = await fetch(base);
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        const sizeKB = buffer.byteLength / 1024;
        if (sizeKB > MIN_FULL_SIZE_KB) return base;
      }
    } catch {
      // fall through
    }

    return null;
  }

  // -----------------------------------------------------------------------
  // Fetch + encode
  // -----------------------------------------------------------------------

  /**
   * Download an image URL and return its base64 representation.
   *
   * Handles:
   * - data-URLs (returned as-is after stripping the prefix)
   * - Underscore-suffixed URLs (resolved via `resolveFullSizeImage`)
   * - Small-image detection with automatic full-size fallback
   *
   * Returns `null` when the image could not be fetched from any variant.
   */
  async fetchImageAsBase64(url: string): Promise<FetchedImage | null> {
    if (url.startsWith('data:image')) {
      const base64 = url.split(',')[1];
      if (!base64) return null;
      const sizeKB = (base64.length * 3) / 4 / 1024;
      return { base64, sizeKB };
    }

    const trimmedUrl = url.trim();

    if (trimmedUrl.endsWith('_')) {
      const resolved = await this.resolveFullSizeImage(trimmedUrl);
      if (resolved) {
        return this.downloadAsBase64(resolved);
      }
    }

    const result = await this.downloadAsBase64(trimmedUrl);
    if (!result) return null;

    if (result.sizeKB < SMALL_IMAGE_KB && trimmedUrl.endsWith('_')) {
      const resolved = await this.resolveFullSizeImage(trimmedUrl);
      if (resolved) {
        const betterResult = await this.downloadAsBase64(resolved);
        if (betterResult && betterResult.sizeKB > result.sizeKB) {
          return betterResult;
        }
      }
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Odoo image operations
  // -----------------------------------------------------------------------

  /**
   * Set the main image on a product template (`image_1920`).
   * Optionally preserves the `website_published` flag which Odoo can reset
   * on a write to the template.
   */
  async setMainImage(
    templateId: number,
    base64Data: string,
    preservePublished?: boolean,
  ): Promise<void> {
    const values: Record<string, unknown> = { image_1920: base64Data };
    if (preservePublished !== undefined) {
      values.website_published = preservePublished;
    }

    try {
      await odooClient.write(
        this.uid,
        this.password,
        'product.template',
        [templateId],
        values,
      );
    } catch (err) {
      throw new OdooImageError(
        `Failed to set main image on template ${templateId}: ${(err as Error).message}`,
        'MAIN_IMAGE_FAILED',
        { templateId },
      );
    }
  }

  /**
   * Create a `product.image` record (e-commerce gallery image).
   * Returns the new image record id.
   */
  async addGalleryImage(
    templateId: number,
    name: string,
    base64Data: string,
    sequence: number,
  ): Promise<number> {
    try {
      return await odooClient.create(this.uid, this.password, 'product.image', {
        name,
        product_tmpl_id: templateId,
        image_1920: base64Data,
        sequence,
      });
    } catch (err) {
      throw new OdooImageError(
        `Failed to add gallery image "${name}" to template ${templateId}: ${(err as Error).message}`,
        'GALLERY_IMAGE_FAILED',
        { templateId, name, sequence },
      );
    }
  }

  // -----------------------------------------------------------------------
  // Orchestration
  // -----------------------------------------------------------------------

  /**
   * Upload a set of image URLs/data-URLs to Odoo for a given product template.
   *
   * - The first image is set both as the main product image and as a gallery
   *   image.
   * - All images are created as `product.image` records.
   *
   * Returns the number of images successfully uploaded.
   */
  async uploadProductImages(
    templateId: number,
    images: string[],
    productName: string,
    isPublished: boolean,
  ): Promise<number> {
    let uploaded = 0;

    for (let i = 0; i < images.length; i++) {
      try {
        const fetched = await this.fetchImageAsBase64(images[i]);
        if (!fetched) {
          console.warn(`Could not fetch image ${i + 1} for "${productName}"`);
          continue;
        }

        const imageName = `${productName} - Image ${i + 1}`;

        await this.addGalleryImage(templateId, imageName, fetched.base64, i + 1);
        uploaded++;

        if (i === 0) {
          await this.setMainImage(templateId, fetched.base64, isPublished);
        }
      } catch (err) {
        console.error(`Error uploading image ${i + 1} for "${productName}":`, err);
      }
    }

    return uploaded;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async downloadAsBase64(imageUrl: string): Promise<FetchedImage | null> {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) return null;

      const buffer = await response.arrayBuffer();
      const sizeKB = parseFloat((buffer.byteLength / 1024).toFixed(2));
      const base64 = Buffer.from(buffer).toString('base64');

      return { base64, sizeKB };
    } catch {
      return null;
    }
  }
}
