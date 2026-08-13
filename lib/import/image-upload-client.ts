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

async function parseJsonResponse(
  response: Response,
): Promise<{ data: Record<string, unknown>; raw: string }> {
  const raw = await response.text();
  if (!raw.trim()) {
    return { data: {}, raw };
  }
  try {
    return { data: JSON.parse(raw) as Record<string, unknown>, raw };
  } catch {
    const snippet = raw.replace(/\s+/g, ' ').slice(0, 160);
    const hint =
      response.status === 413
        ? 'Upload te groot (server limiet). Probeer minder/kleinere foto’s of compressie.'
        : response.status >= 500
          ? 'Serverfout tijdens upload.'
          : 'Server gaf geen JSON terug.';
    throw new Error(
      `${hint} (HTTP ${response.status}${snippet ? `: ${snippet}` : ''})`,
    );
  }
}

/**
 * Upload multiple images for one product template in a single API call.
 * Prefer small batches (ideally 1 image) — Vercel request body max is ~4.5MB.
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

  const { data } = await parseJsonResponse(response);

  if (!response.ok) {
    return {
      success: false,
      uploaded: Number(data.uploaded) || 0,
      failed: input.images.length,
      errors: [
        String(data.error || `HTTP ${response.status}`),
      ],
    };
  }

  return {
    success: Boolean(data.success),
    uploaded: Number(data.uploaded) || 0,
    failed: Number(data.failed) || 0,
    errors: Array.isArray(data.errors)
      ? data.errors.map(String)
      : [],
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
