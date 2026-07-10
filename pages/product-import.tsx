import Head from 'next/head';
import ImportWizard from '@/components/import/ImportWizard';

export default function ProductImportPage() {
  return (
    <>
      <Head>
        <title>Product Import Wizard - Babette</title>
      </Head>
      <ImportWizard />
    </>
  );
}
