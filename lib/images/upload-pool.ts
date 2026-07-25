import type { ImageTarget, PoolImage, UploadPoolResult } from './types';
import {
  uploadProductImagesBatch,
  fileToBase64,
} from '@/lib/import/image-upload-client';
import type { ImageUploadProgress } from '@/lib/import/image-upload-client';

interface UploadPoolByTemplateOpts {
  images: PoolImage[];
  targets: ImageTarget[];
  onProgress?: (progress: ImageUploadProgress) => void;
  concurrency?: number;
}

/**
 * Groups pool images by assignedKey → templateId and uploads each group
 * as a single batch via uploadProductImagesBatch.
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

        onProgress?.({
          current: uploaded,
          total: totalImages,
          currentProduct: target.label || key,
          currentFile: sorted[0]?.filename,
        });

        const payload = await Promise.all(
          sorted.map(async (img, idx) => {
            const base64 = img.dataUrl.startsWith('data:')
              ? img.dataUrl.split(',')[1]
              : img.file.size > 0
                ? await fileToBase64(img.file)
                : img.dataUrl;
            return {
              base64,
              imageName: img.filename,
              sequence: idx + 1,
              isMainImage: idx === 0,
            };
          }),
        );

        const result = await uploadProductImagesBatch({
          templateId: target.templateId,
          images: payload,
        });

        uploaded += sorted.length;
        onProgress?.({
          current: uploaded,
          total: totalImages,
          currentProduct: target.label || key,
          phase: 'uploading' as const,
        });

        return {
          key,
          templateId: target.templateId,
          success: result.success,
          uploaded: result.uploaded,
          failed: result.failed,
          errors: result.errors,
        } satisfies UploadPoolResult;
      }),
    );
    results.push(...chunkResults);
  }

  onProgress?.({ current: totalImages, total: totalImages, phase: 'done' });
  return results;
}
