export type SeoGalleryImageMeta = {
  id: number;
  name: string;
  sequence: number;
};

export type SeoProductItem = {
  id: number;
  name: string;
  defaultCode: string | null;
  brand: string | null;
  hasMainImage: boolean;
  imageCount: number;
  galleryImages: SeoGalleryImageMeta[];
};

export type SeoAltTextUpdate = {
  imageId: number;
  altText: string;
};
