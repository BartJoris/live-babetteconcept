import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import ImportWizard from '@/components/import/ImportWizard';

/**
 * Default entry is slim uploaden. Open the classic wizard only with
 * ?vendor=… (from slim upload) or ?manual=1.
 */
export default function ProductImportPage() {
  const router = useRouter();
  const { vendor, smartUpload, manual } = router.query;

  const allowWizard =
    Boolean(vendor) ||
    smartUpload === 'true' ||
    manual === '1' ||
    manual === 'true';

  useEffect(() => {
    if (!router.isReady) return;
    if (!allowWizard) {
      void router.replace('/smart-upload');
    }
  }, [router, allowWizard]);

  if (!router.isReady || !allowWizard) {
    return (
      <>
        <Head>
          <title>Doorsturen… - Babette</title>
        </Head>
        <div className="min-h-screen flex items-center justify-center text-gray-600 dark:text-gray-300">
          Doorsturen naar slim uploaden…
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Productimportwizard - Babette</title>
      </Head>
      <ImportWizard />
    </>
  );
}
