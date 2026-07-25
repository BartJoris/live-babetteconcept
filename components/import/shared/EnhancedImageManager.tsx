import { useMemo } from 'react';

import type { ImageUploadConfig, ParsedProduct } from '@/lib/suppliers/types';
import type { ImagePoolItem, ImageUploadProgressState } from './types';
import type { PoolImage, ImageTarget } from '@/lib/images/types';
import ProductImageUploader from '@/components/images/ProductImageUploader';

interface EnhancedImageManagerProps {
  images: ImagePoolItem[];
  onImagesChange: (images: ImagePoolItem[]) => void;
  products: ParsedProduct[];
  imageUploadConfig?: ImageUploadConfig;
  onUpload: (images: ImagePoolItem[]) => Promise<void>;
  isUploading?: boolean;
  uploadProgress?: ImageUploadProgressState | null;
}

function poolItemToPoolImage(item: ImagePoolItem): PoolImage {
  return {
    id: item.id,
    dataUrl: item.dataUrl,
    filename: item.filename,
    file: item.file,
    assignedKey: item.assignedReference,
    order: item.order,
  };
}

function poolImageToPoolItem(img: PoolImage): ImagePoolItem {
  return {
    id: img.id,
    dataUrl: img.dataUrl,
    filename: img.filename,
    file: img.file,
    assignedReference: img.assignedKey,
    order: img.order,
  };
}

export default function EnhancedImageManager({
  images,
  onImagesChange,
  products,
  imageUploadConfig,
  onUpload,
  isUploading = false,
  uploadProgress = null,
}: EnhancedImageManagerProps) {
  const poolImages = useMemo(
    () => images.map(poolItemToPoolImage),
    [images],
  );

  const targets = useMemo<ImageTarget[]>(
    () =>
      products.map((p) => ({
        key: p.reference,
        label: p.name || p.reference,
        reference: p.reference,
        templateId: (p as ParsedProduct & { templateId?: number }).templateId,
      })),
    [products],
  );

  const handleImagesChange = (updated: PoolImage[]) => {
    onImagesChange(updated.map(poolImageToPoolItem));
  };

  const handleUpload = async (assigned: PoolImage[]) => {
    await onUpload(assigned.map(poolImageToPoolItem));
  };

  return (
    <ProductImageUploader
      mode="wizard"
      targets={targets}
      images={poolImages}
      onImagesChange={handleImagesChange}
      imageUploadConfig={imageUploadConfig}
      onUpload={handleUpload}
      isUploading={isUploading}
      uploadProgress={uploadProgress}
      showUploadButton
      enableCompress={false}
    />
  );
}
