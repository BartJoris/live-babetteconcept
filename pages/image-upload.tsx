import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

/**
 * Legacy catalog image upload redirected to slim image flow
 * (no brand grid — detect from CSV/import-log like slim product upload).
 */
export default function ImageUploadRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.vendor
      ? `?hint=${encodeURIComponent(String(router.query.vendor))}`
      : '';
    void router.replace(`/smart-images-upload${q}`);
  }, [router]);

  return (
    <>
      <Head>
        <title>Doorsturen… - Babette</title>
      </Head>
      <div className="min-h-screen flex items-center justify-center text-gray-600 dark:text-gray-300">
        Doorsturen naar slimme afbeeldingen…
      </div>
    </>
  );
}
