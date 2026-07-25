import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

import type { PoolImage } from '@/lib/images/types';
import ProductImageUploader from '@/components/images/ProductImageUploader';

export default function ImageUploadPage() {
  const router = useRouter();
  const { vendor } = router.query;

  const [vendorId, setVendorId] = useState('');
  const [images, setImages] = useState<PoolImage[]>([]);

  useEffect(() => {
    if (vendor && typeof vendor === 'string' && vendor !== vendorId) {
      setVendorId(vendor);
    }
  }, [vendor, vendorId]);

  const handleVendorChange = (nextVendorId: string) => {
    setVendorId(nextVendorId);
    setImages([]);
    if (nextVendorId) {
      void router.replace(
        `/image-upload?vendor=${encodeURIComponent(nextVendorId)}`,
        undefined,
        { shallow: true },
      );
    } else {
      void router.replace('/image-upload', undefined, { shallow: true });
    }
  };

  return (
    <>
      <Head>
        <title>Afbeeldingen Uploaden - Babette</title>
      </Head>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="mb-6">
            <Link
              href="/product-import"
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 text-sm"
            >
              &larr; Terug naar Import
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-4 mb-2">
              Afbeeldingen Uploaden
            </h1>
            <p className="text-gray-700 dark:text-gray-300">
              Selecteer producten uit Odoo en wijs afbeeldingen toe.
            </p>
          </div>

          <ProductImageUploader
            mode="catalog"
            vendorId={vendorId || undefined}
            onVendorChange={handleVendorChange}
            images={images}
            onImagesChange={setImages}
            enableFolderPick
            enableCompress
            enableUrlImport
            showUploadButton
          />
        </div>
      </div>
    </>
  );
}
