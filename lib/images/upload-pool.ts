import type { ImageTarget, PoolImage, UploadPoolResult } from './types';
import {
  uploadProductImagesBatch,
  fileToBase64,
} from '@/lib/import/image-upload-client';
import type { ImageUploadProgress } from '@/lib/import/image-upload-client';
import { compressImage } from '@/lib/import/shared/image-utils';

interface UploadPoolByTemplateOpts {
  images: PoolImage[];
  targets: ImageTarget[];
  onProgress?: (progress: ImageUploadProgress) => void;
  concurrency?: number;
}

async function toBase64Payload(img: PoolImage): Promise<string> {
  let dataUrl = img.dataUrl;
  if (!dataUrl.startsWith('data:') && img.file?.size > 0) {
    dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
      reader.readAsDataURL(img.file);
    });
  }

  if (dataUrl.startsWith('data:')) {
    // Ensure studio shots fit under Vercel ~4.5MB body limit.
    const compressed = await compressImage(dataUrl);
    const part = compressed.split(',')[1];
    if (part) return part;
  }

  if (img.file?.size > 0) {
    return fileToBase64(img.file);
  }
  return img.dataUrl.includes(',') ? img.dataUrl.split(',')[1] : img.dataUrl;
}

/**
 * Groups pool images by assignedKey → templateId and uploads each image
 * in its own request (avoids Vercel ~4.5MB body limit / Safari JSON errors).
 */
export async function uploadPoolByTemplate({
  images,
  targets,
  onProgress,
  concurrency = 2,
}: UploadPoolByTemplateOpts): Promise<UploadPoolResult[]> {
  const targetByKey = new Map<string, ImageTarget>();
  for (const t of targets) targetByKey.set(t.key, t);

  const grouped = new Map<string, PoolImage[]>();
  for (const img of images) {
    if (!img.assignedKey) continue;
    const arr = grouped.get(img.assignedKey) || [];
    arr.push(img);
    grouped.set(img.assignedKey, arr);
  }

  const entries = Array.from(grouped.entries());
  const totalImages = entries.reduce((sum, [, imgs]) => sum + imgs.length, 0);
  let uploaded = 0;

  const results: UploadPoolResult[] = [];

  // Serialize per product (images in order: main first), but allow a few
  // products in parallel via concurrency.
  for (let i = 0; i < entries.length; i += concurrency) {
    const chunk = entries.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async ([key, imgs]) => {
        const target = targetByKey.get(key);
        if (!target?.templateId) {
          uploaded += imgs.length;
          onProgress?.({
            current: uploaded,
            total: totalImages,
            currentProduct: target?.label || key,
          });
          return {
            key,
            templateId: 0,
            success: false,
            uploaded: 0,
            failed: imgs.length,
            errors: ['Geen template ID gevonden'],
          } satisfies UploadPoolResult;
        }

        const sorted = [...imgs].sort((a, b) => a.order - b.order);
        let ok = 0;
        const errors: string[] = [];

        for (let idx = 0; idx < sorted.length; idx++) {
          const img = sorted[idx];
          onProgress?.({
            current: uploaded,
            total: totalImages,
            currentProduct: target.label || key,
            currentFile: img.filename,
            phase: 'uploading',
          });

          try {
            const base64 = await toBase64Payload(img);
            if (!base64?.trim()) {
              errors.push(`${img.filename}: lege afbeelding`);
              uploaded += 1;
              continue;
            }

            // Stay under ~4.5MB serverless body: one image per request.
            const approxBytes = Math.floor((base64.length * 3) / 4);
            if (approxBytes > 3_500_000) {
              errors.push(
                `${img.filename}: te groot na compressie (${Math.round(approxBytes / 1024)} KB). Verklein de foto en probeer opnieuw.`,
              );
              uploaded += 1;
              continue;
            }

            const result = await uploadProductImagesBatch({
              templateId: target.templateId,
              images: [
                {
                  base64,
                  imageName: img.filename,
                  sequence: idx + 1,
                  isMainImage: idx === 0,
                },
              ],
            });

            if (result.success || result.uploaded > 0) {
              ok += result.uploaded;
              if (result.errors?.length) errors.push(...result.errors);
            } else {
              errors.push(
                ...(result.errors?.length
                  ? result.errors
                  : [`${img.filename}: upload mislukt`]),
              );
            }
          } catch (err) {
            errors.push(
              `${img.filename}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }

          uploaded += 1;
          onProgress?.({
            current: uploaded,
            total: totalImages,
            currentProduct: target.label || key,
            currentFile: img.filename,
            phase: 'uploading',
          });
        }

        return {
          key,
          templateId: target.templateId,
          success: ok > 0 && errors.length === 0,
          uploaded: ok,
          failed: sorted.length - ok,
          errors,
        } satisfies UploadPoolResult;
      }),
    );
    results.push(...chunkResults);
  }

  onProgress?.({ current: totalImages, total: totalImages, phase: 'done' });
  return results;
}
