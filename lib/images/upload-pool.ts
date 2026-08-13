import type { ImageTarget, PoolImage, UploadPoolResult } from './types';
import {
  uploadProductImagesBatch,
  fileToBase64,
} from '@/lib/import/image-upload-client';
import type { ImageUploadProgress } from '@/lib/import/image-upload-client';
import { compressImage } from '@/lib/import/shared/image-utils';

export type UploadPoolEvent = {
  level: 'info' | 'warn' | 'error';
  message: string;
  reference?: string;
  filename?: string;
};

interface UploadPoolByTemplateOpts {
  images: PoolImage[];
  targets: ImageTarget[];
  onProgress?: (progress: ImageUploadProgress) => void;
  onEvent?: (event: UploadPoolEvent) => void;
  concurrency?: number;
}

async function toBase64Payload(img: PoolImage): Promise<string> {
  let dataUrl = img.dataUrl;
  if (!dataUrl.startsWith('data:') && img.file?.size > 0) {
    dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () =>
        reject(reader.error || new Error('FileReader failed'));
      reader.readAsDataURL(img.file);
    });
  }

  if (dataUrl.startsWith('data:')) {
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
  onEvent,
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
  let doneCount = 0;

  onEvent?.({
    level: 'info',
    message: `Start upload: ${entries.length} producten, ${totalImages} afbeeldingen`,
  });

  const results: UploadPoolResult[] = [];

  for (let i = 0; i < entries.length; i += concurrency) {
    const chunk = entries.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async ([key, imgs]) => {
        const target = targetByKey.get(key);
        const reference = target?.reference || key;
        if (!target?.templateId) {
          doneCount += imgs.length;
          onProgress?.({
            current: doneCount,
            total: totalImages,
            currentProduct: target?.label || key,
          });
          onEvent?.({
            level: 'error',
            reference,
            message: `Geen template ID voor ${reference} (${imgs.length} foto's overgeslagen)`,
          });
          return {
            key,
            templateId: 0,
            success: false,
            uploaded: 0,
            failed: imgs.length,
            errors: ['Geen template ID gevonden'],
            filenamesUploaded: [],
            filenamesFailed: imgs.map((img) => img.filename),
          } satisfies UploadPoolResult;
        }

        const sorted = [...imgs].sort((a, b) => a.order - b.order);
        const filenamesUploaded: string[] = [];
        const filenamesFailed: string[] = [];
        const errors: string[] = [];

        onEvent?.({
          level: 'info',
          reference,
          message: `Upload ${sorted.length} foto('s) voor ${target.label || reference}`,
        });

        for (let idx = 0; idx < sorted.length; idx++) {
          const img = sorted[idx];
          onProgress?.({
            current: doneCount,
            total: totalImages,
            currentProduct: target.label || key,
            currentFile: img.filename,
            phase: 'uploading',
          });

          try {
            const base64 = await toBase64Payload(img);
            if (!base64?.trim()) {
              const msg = `${img.filename}: lege afbeelding`;
              errors.push(msg);
              filenamesFailed.push(img.filename);
              onEvent?.({
                level: 'error',
                reference,
                filename: img.filename,
                message: msg,
              });
              doneCount += 1;
              continue;
            }

            const approxBytes = Math.floor((base64.length * 3) / 4);
            if (approxBytes > 3_500_000) {
              const msg = `${img.filename}: te groot na compressie (${Math.round(approxBytes / 1024)} KB)`;
              errors.push(msg);
              filenamesFailed.push(img.filename);
              onEvent?.({
                level: 'error',
                reference,
                filename: img.filename,
                message: msg,
              });
              doneCount += 1;
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
              filenamesUploaded.push(img.filename);
              if (result.errors?.length) {
                errors.push(...result.errors);
                onEvent?.({
                  level: 'warn',
                  reference,
                  filename: img.filename,
                  message: result.errors.join('; '),
                });
              } else {
                onEvent?.({
                  level: 'info',
                  reference,
                  filename: img.filename,
                  message: `Geüpload: ${img.filename}`,
                });
              }
            } else {
              const msg =
                result.errors?.join('; ') || `${img.filename}: upload mislukt`;
              errors.push(msg);
              filenamesFailed.push(img.filename);
              onEvent?.({
                level: 'error',
                reference,
                filename: img.filename,
                message: msg,
              });
            }
          } catch (err) {
            const msg = `${img.filename}: ${err instanceof Error ? err.message : String(err)}`;
            errors.push(msg);
            filenamesFailed.push(img.filename);
            onEvent?.({
              level: 'error',
              reference,
              filename: img.filename,
              message: msg,
            });
          }

          doneCount += 1;
          onProgress?.({
            current: doneCount,
            total: totalImages,
            currentProduct: target.label || key,
            currentFile: img.filename,
            phase: 'uploading',
          });
        }

        const uploaded = filenamesUploaded.length;
        const failed = filenamesFailed.length;
        return {
          key,
          templateId: target.templateId,
          success: uploaded > 0 && failed === 0,
          uploaded,
          failed,
          errors,
          filenamesUploaded,
          filenamesFailed,
        } satisfies UploadPoolResult;
      }),
    );
    results.push(...chunkResults);
  }

  onProgress?.({ current: totalImages, total: totalImages, phase: 'done' });
  onEvent?.({
    level: 'info',
    message: `Klaar: ${results.reduce((s, r) => s + r.uploaded, 0)} geüpload, ${results.reduce((s, r) => s + r.failed, 0)} mislukt`,
  });
  return results;
}
