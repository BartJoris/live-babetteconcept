import type { ImageTarget } from './types';
import type { ImageUploadConfig } from '@/lib/suppliers/types';

/**
 * Try to match a filename (and optional relative path) to an ImageTarget
 * using the supplier's extractReference and fallback heuristics.
 */
export function matchFilenameToTarget(
  filename: string,
  targets: ImageTarget[],
  imageUploadConfig?: ImageUploadConfig | null,
  relativePath?: string,
): string {
  if (imageUploadConfig?.extractReference) {
    const ref = imageUploadConfig.extractReference(filename, relativePath);
    if (ref) {
      const exact = targets.find(
        (t) =>
          t.reference === ref ||
          t.key === ref,
      );
      if (exact) return exact.key;

      const partial = targets.find(
        (t) =>
          (t.reference &&
            (t.reference.toLowerCase().includes(ref.toLowerCase()) ||
              ref.toLowerCase().includes(t.reference.toLowerCase()))) ||
          t.key.toLowerCase().includes(ref.toLowerCase()) ||
          ref.toLowerCase().includes(t.key.toLowerCase()),
      );
      if (partial) return partial.key;
    }
  }

  const nameNoExt = filename.replace(/\.[^.]+$/, '').toLowerCase();
  for (const t of targets) {
    const refLower = (t.reference || t.key).toLowerCase();
    if (nameNoExt.includes(refLower) || refLower.includes(nameNoExt)) {
      return t.key;
    }
    if (t.label) {
      const labelPart = t.label.split(' – ').pop()?.trim().toLowerCase() || '';
      if (labelPart && nameNoExt.includes(labelPart)) {
        return t.key;
      }
    }
  }

  return '';
}
