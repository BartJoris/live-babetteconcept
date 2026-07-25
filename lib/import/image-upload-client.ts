export type ImageUploadProgress = {
  current: number;
  total: number;
  currentProduct?: string;
  currentFile?: string;
  phase?: 'uploading' | 'done';
};

export type ProductImagePayload = {
  base64: string;
  imageName: string;
  sequence: number;
  isMainImage?: boolean;
};

export type UploadProductImagesResult = {
  success: boolean;
  uploaded: number;
  failed: number;
  errors: string[];
};

/**
 * Upload multiple images for one product template in a single API call.
 */
export async function uploadProductImagesBatch(input: {
  templateId: number;
  images: ProductImagePayload[];
  isPublished?: boolean;
}): Promise<UploadProductImagesResult> {
  const response = await fetch('/api/upload-product-images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await response.json()) as {
    success?: boolean;
    uploaded?: number;
    failed?: number;
    errors?: string[];
    error?: string;
  };
  if (!response.ok) {
    return {
      success: false,
      uploaded: data.uploaded || 0,
      failed: input.images.length,
      errors: [data.error || `HTTP ${response.status}`],
    };
  }
  return {
    success: Boolean(data.success),
    uploaded: data.uploaded || 0,
    failed: data.failed || 0,
    errors: data.errors || [],
  };
}

/** Read a File as raw base64 (no data-URL prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}
