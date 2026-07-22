import Head from 'next/head';
import ImportWizard from '@/components/import/ImportWizard';

export default function ProductImportPage() {
  return (
    <>
      <Head>
        <title>Productimportwizard - Babette</title>
      </Head>
      <ImportWizard />
    </>
  );
}
