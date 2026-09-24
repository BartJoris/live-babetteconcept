import type { SeoAltTextUpdate, SeoGalleryImageMeta, SeoProductItem } from './types';

const GENERIC_ALT = new Set([
  'vorige hoofdafbeelding',
  'hoofdafbeelding',
  'image',
  'afbeelding',
  'photo',
  'foto',
]);

export function suggestedAltText(productName: string, imageIndex: number): string {
  const product = productName.trim();
  return `${product} - ${imageIndex + 1} - Babette Oostduinkerke`;
}

export function isFilenameLikeAlt(name: string): boolean {
  return /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i.test(name.trim());
}

export function needsAltTextFix(
  current: string | null | undefined,
  suggested: string
): boolean {
  const value = (current ?? '').trim();
  if (!value) return true;
  if (value === suggested) return false;
  if (isFilenameLikeAlt(value)) return true;
  if (GENERIC_ALT.has(value.toLowerCase())) return true;
  return true;
}

export function productNeedsAltTextFix(product: SeoProductItem): boolean {
  return product.galleryImages.some((img, index) =>
    needsAltTextFix(img.name, suggestedAltText(product.name, index))
  );
}

export function productHasCorrectAltText(product: SeoProductItem): boolean {
  if (product.galleryImages.length === 0) return false;
  return !productNeedsAltTextFix(product);
}

export function buildSuggestedUpdates(
  products: Array<Pick<SeoProductItem, 'brand' | 'name' | 'galleryImages'>>,
  options: { onlyMissing?: boolean } = {}
): SeoAltTextUpdate[] {
  const updates: SeoAltTextUpdate[] = [];
  for (const product of products) {
    const images = sortGalleryImages(product.galleryImages);
    images.forEach((img, index) => {
      const altText = suggestedAltText(product.name, index);
      if (options.onlyMissing && !needsAltTextFix(img.name, altText)) return;
      if (img.name.trim() === altText) return;
      updates.push({ imageId: img.id, altText });
    });
  }
  return updates;
}

export function sortGalleryImages<T extends Pick<SeoGalleryImageMeta, 'id' | 'sequence'>>(
  images: T[]
): T[] {
  return [...images].sort((a, b) => {
    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
    return a.id - b.id;
  });
}

export function applyAltTextUpdates(
  images: SeoGalleryImageMeta[],
  updates: SeoAltTextUpdate[]
): SeoGalleryImageMeta[] {
  if (updates.length === 0) return images;
  const byId = new Map(updates.map((update) => [update.imageId, update.altText]));
  return images.map((img) => {
    const nextName = byId.get(img.id);
    return nextName === undefined ? img : { ...img, name: nextName };
  });
}
