import { useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

import ProductImageUploader from '@/components/images/ProductImageUploader';
import type { ImageTarget, PoolImage } from '@/lib/images/types';
import playup, { extractPlayUpImageReference } from '@/lib/suppliers/playup';

interface ImportLogResult {
  reference: string;
  name?: string;
  templateId?: number;
  status?: string;
  success?: boolean;
}

interface ImportLogFile {
  vendor?: string;
  results?: ImportLogResult[];
}

/**
 * Build image targets from a smart-import result log.
 * Filenames like 0AT11352_R376R_1.jpg match result.reference via extractPlayUpImageReference.
 */
function targetsFromImportLog(results: ImportLogResult[]): ImageTarget[] {
  return results
    .filter((r) => r.templateId && r.reference && r.status !== 'failed')
    .map((r) => ({
      key: r.reference,
      label: r.name || r.reference,
      templateId: r.templateId,
      reference: r.reference,
    }));
}

export default function PlayUpImagesImport() {
  const [targets, setTargets] = useState<ImageTarget[]>([]);
  const [images, setImages] = useState<PoolImage[]>([]);
  const [logMeta, setLogMeta] = useState<{ vendor: string; count: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const imageUploadConfig = useMemo(
    () => ({
      ...playup.imageUpload!,
      extractReference: extractPlayUpImageReference,
    }),
    [],
  );

  const handleLogUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const parsed = JSON.parse(await file.text()) as ImportLogFile;
      const results = parsed.results || [];
      const next = targetsFromImportLog(results);
      if (next.length === 0) {
        setError(
          'Geen geldige producten met templateId in dit logbestand. Gebruik import-log-playup-….json.',
        );
        setTargets([]);
        setLogMeta(null);
        return;
      }
      setTargets(next);
      setImages([]);
      setLogMeta({
        vendor: parsed.vendor || 'playup',
        count: next.length,
      });
    } catch (err) {
      setError(`Kon log niet lezen: ${(err as Error).message}`);
    } finally {
      e.target.value = '';
    }
  };

  const matchedCount = useMemo(() => {
    const keys = new Set(
      images.filter((i) => i.assignedKey).map((i) => i.assignedKey),
    );
    return keys.size;
  }, [images]);

  const assignedImageCount = images.filter((i) => i.assignedKey).length;

  return (
    <>
      <Head>
        <title>Play UP Afbeeldingen - Babette</title>
      </Head>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 space-y-6">
          <div>
            <Link
              href="/product-import"
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 text-sm"
            >
              &larr; Terug naar Import
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-4 mb-2">
              Play UP afbeeldingen matchen
            </h1>
            <p className="text-gray-700 dark:text-gray-300 max-w-3xl">
              1) Upload je <code className="text-sm bg-gray-200 dark:bg-gray-700 px-1 rounded">import-log-playup-….json</code>
              {' '}(met templateIds). 2) Sleep de map{' '}
              <code className="text-sm bg-gray-200 dark:bg-gray-700 px-1 rounded">Foto&apos;s play Up</code>
              {' '}erin. Bestanden zoals{' '}
              <code className="text-sm bg-gray-200 dark:bg-gray-700 px-1 rounded">0AT11352_R376R_1.jpg</code>
              {' '}worden automatisch gekoppeld aan product{' '}
              <code className="text-sm bg-gray-200 dark:bg-gray-700 px-1 rounded">0AT11352_R376R</code>.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4 space-y-3">
            <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
              Import-log JSON
            </label>
            <input
              type="file"
              accept="application/json,.json"
              onChange={handleLogUpload}
              className="block w-full text-sm text-gray-700 dark:text-gray-300"
            />
            {logMeta && (
              <p className="text-sm text-green-700 dark:text-green-300">
                {logMeta.count} producten geladen ({logMeta.vendor})
                {assignedImageCount > 0 && (
                  <> — {assignedImageCount} foto&apos;s op {matchedCount} producten</>
                )}
              </p>
            )}
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>

          {targets.length === 0 ? (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-amber-900 dark:text-amber-200 text-sm">
              Upload eerst het import-logbestand uit Downloads (bijv.
              import-log-playup-2026-08-13-12-25-03.json) zodat we de Odoo
              templateIds kennen.
            </div>
          ) : (
            <ProductImageUploader
              mode="brand"
              targets={targets}
              images={images}
              onImagesChange={setImages}
              imageUploadConfig={imageUploadConfig}
              enableFolderPick
              enableCompress
              enableUrlImport={false}
              showUploadButton
              showInstructions
            />
          )}
        </div>
      </div>
    </>
  );
}
