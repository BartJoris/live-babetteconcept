import { useCallback, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type InputHTMLAttributes } from 'react';
import Head from 'next/head';
import Link from 'next/link';

import ProductImageUploader from '@/components/images/ProductImageUploader';
import type { ImageTarget, PoolImage } from '@/lib/images/types';
import {
  collectFilesFromDataTransfer,
  supportsDirectoryPicker,
} from '@/lib/import/shared/browser-utils';
import playup, { extractPlayUpImageReference } from '@/lib/suppliers/playup';
import { createParseContext } from '@/lib/suppliers';

type Step = 'source' | 'photos';

interface ImportLogResult {
  reference: string;
  name?: string;
  templateId?: number;
  status?: string;
}

interface ResolvedProduct {
  reference: string;
  templateId: number | null;
  name: string;
  found: boolean;
}

function isCsvLike(file: File): boolean {
  const n = file.name.toLowerCase();
  return n.endsWith('.csv') || n.endsWith('.txt');
}

function isJsonLog(file: File): boolean {
  return file.name.toLowerCase().endsWith('.json');
}

function targetsFromResolved(products: ResolvedProduct[]): ImageTarget[] {
  return products
    .filter((p) => p.found && p.templateId)
    .map((p) => ({
      key: p.reference,
      label: p.name || p.reference,
      templateId: p.templateId!,
      reference: p.reference,
    }));
}

function referencesFromPlayUpCsv(text: string): string[] {
  const products = playup.parse(
    { main_csv: text },
    createParseContext([], 'playup'),
  );
  return products.map((p) => p.reference);
}

function referencesFromImportLog(text: string): {
  references: string[];
  preResolved: ResolvedProduct[];
} {
  const parsed = JSON.parse(text) as {
    results?: ImportLogResult[];
    products?: Array<{ reference?: string; templateId?: number; name?: string }>;
  };

  if (Array.isArray(parsed.results)) {
    const preResolved = parsed.results
      .filter((r) => r.reference && r.templateId && r.status !== 'failed')
      .map((r) => ({
        reference: r.reference,
        templateId: r.templateId || null,
        name: r.name || r.reference,
        found: Boolean(r.templateId),
      }));
    return {
      references: preResolved.map((p) => p.reference),
      preResolved,
    };
  }

  if (Array.isArray(parsed.products)) {
    const refs = parsed.products
      .map((p) => p.reference)
      .filter((r): r is string => Boolean(r));
    return { references: refs, preResolved: [] };
  }

  return { references: [], preResolved: [] };
}

export default function PlayUpImagesImport() {
  const [step, setStep] = useState<Step>('source');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [resolved, setResolved] = useState<ResolvedProduct[]>([]);
  const [images, setImages] = useState<PoolImage[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const imageUploadConfig = useMemo(
    () => ({
      ...playup.imageUpload!,
      extractReference: extractPlayUpImageReference,
    }),
    [],
  );

  const targets = useMemo(() => targetsFromResolved(resolved), [resolved]);
  const foundCount = resolved.filter((p) => p.found).length;

  const resolveReferences = useCallback(async (references: string[]) => {
    const unique = Array.from(new Set(references.filter(Boolean)));
    if (unique.length === 0) {
      throw new Error('Geen productreferenties gevonden in de bestanden.');
    }

    const res = await fetch('/api/resolve-templates-by-reference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ references: unique, brandName: 'Play Up' }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Kon producten niet in Odoo vinden');
    }
    return data.products as ResolvedProduct[];
  }, []);

  const processSourceFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setError(null);
      setLoading(true);
      setStatusMessage('Bestanden verwerken...');

      try {
        // Prefer CSV/JSON; ignore images and other junk from a folder drop.
        const jsonFiles = files.filter(isJsonLog);
        const csvFiles = files.filter(isCsvLike);
        const usable = [...jsonFiles, ...csvFiles];
        if (usable.length === 0) {
          throw new Error(
            'Geen CSV of import-log gevonden. Sleep “Order play Up.csv” of import-log-playup-….json (of een map die die bestanden bevat).',
          );
        }

        setSourceLabel(usable.map((f) => f.name).slice(0, 3).join(', '));

        let preResolved: ResolvedProduct[] = [];
        let references: string[] = [];

        for (const file of jsonFiles) {
          const text = await file.text();
          const parsed = referencesFromImportLog(text);
          if (parsed.preResolved.length > 0) {
            preResolved = parsed.preResolved;
            references = parsed.references;
            break;
          }
          if (parsed.references.length > 0) {
            references = parsed.references;
          }
        }

        if (preResolved.length === 0) {
          for (const file of csvFiles) {
            const text = await file.text();
            const lower = text.toLowerCase();
            if (
              lower.includes('model reference') ||
              lower.includes('playupstore') ||
              lower.includes('colour code') ||
              lower.includes('color') ||
              text.includes('Article')
            ) {
              references = referencesFromPlayUpCsv(text);
              if (references.length > 0) break;
            }
          }
        }

        if (preResolved.length === 0 && references.length === 0) {
          throw new Error(
            'Geen Play UP order-CSV of import-log JSON herkend. Sleep o.a. “Order play Up.csv” of import-log-playup-….json.',
          );
        }

        let products = preResolved;
        if (products.length === 0 || products.every((p) => !p.templateId)) {
          setStatusMessage(
            `${references.length} referenties gevonden — opzoeken in Odoo...`,
          );
          products = await resolveReferences(references);
        }

        setResolved(products);
        const found = products.filter((p) => p.found).length;
        if (found === 0) {
          throw new Error(
            'Geen matching Odoo-templates gevonden. Importeer eerst de producten of upload het import-log.',
          );
        }

        setStatusMessage(
          `${found}/${products.length} producten gekoppeld. Sleep nu foto’s of de map “Foto’s play Up”.`,
        );
        setStep('photos');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStep('source');
      } finally {
        setLoading(false);
      }
    },
    [resolveReferences],
  );

  const handleSourceDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = await collectFilesFromDataTransfer(e.dataTransfer);
      await processSourceFiles(files);
    },
    [processSourceFiles],
  );

  const handleSourceInput = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await processSourceFiles(files);
    e.target.value = '';
  };

  const reset = () => {
    setStep('source');
    setResolved([]);
    setImages([]);
    setSourceLabel('');
    setError(null);
    setStatusMessage('');
  };

  return (
    <>
      <Head>
        <title>Play UP Afbeeldingen - Babette</title>
      </Head>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-5xl mx-auto px-4 space-y-6">
          <div>
            <Link
              href="/product-import"
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 text-sm"
            >
              &larr; Terug naar Import
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-4 mb-2">
              Play UP afbeeldingen
            </h1>
            <p className="text-gray-700 dark:text-gray-300">
              Zoals slim uploaden: sleep eerst de order-CSV (of een map die die bevat).
              Daarna vragen we om de foto&apos;s of fotomap.
            </p>
          </div>

          <ol className="flex flex-wrap gap-3 text-sm">
            <li
              className={`px-3 py-1.5 rounded-full font-medium ${
                step === 'source'
                  ? 'bg-blue-600 text-white'
                  : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
              }`}
            >
              1. Order / import-log
            </li>
            <li
              className={`px-3 py-1.5 rounded-full font-medium ${
                step === 'photos'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              2. Foto&apos;s / map
            </li>
          </ol>

          {(statusMessage || loading) && (
            <div
              className={`rounded-xl p-4 flex items-center gap-3 ${
                loading
                  ? 'bg-blue-100 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-600'
                  : 'bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-700'
              }`}
            >
              {loading && (
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              )}
              <span className="text-sm text-gray-800 dark:text-gray-200">
                {statusMessage || 'Bezig...'}
              </span>
            </div>
          )}

          {error && (
            <div className="rounded-xl p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {step === 'source' && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleSourceDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
                dragging
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 scale-[1.01]'
                  : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 bg-white dark:bg-gray-800'
              }`}
            >
              <div className="text-5xl mb-4">📦</div>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Sleep bestanden of een map hierheen
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 max-w-lg mx-auto">
                Bijv. <strong>Order play Up.csv</strong> of{' '}
                <strong>import-log-playup-….json</strong>. Je mag een hele map
                slepen — we zoeken zelf de CSV/JSON erin.
              </p>
              <button
                type="button"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                Bestanden kiezen
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".csv,.txt,.json,text/csv,application/json"
                className="hidden"
                onChange={handleSourceInput}
              />
              {supportsDirectoryPicker() && (
                <>
                  <button
                    type="button"
                    className="ml-2 px-4 py-2 bg-white dark:bg-gray-700 border dark:border-gray-600 text-gray-800 dark:text-gray-100 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      folderInputRef.current?.click();
                    }}
                  >
                    Map kiezen
                  </button>
                  <input
                    ref={folderInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    {...({
                      webkitdirectory: '',
                      directory: '',
                    } as InputHTMLAttributes<HTMLInputElement>)}
                    onChange={handleSourceInput}
                  />
                </>
              )}
            </div>
          )}

          {step === 'photos' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-gray-800 dark:text-gray-200">
                  <strong>{foundCount}</strong> Odoo-producten klaar
                  {sourceLabel && (
                    <span className="text-gray-500 dark:text-gray-400">
                      {' '}
                      · bron: {sourceLabel}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Opnieuw beginnen
                </button>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-900 dark:text-amber-200">
                <strong>Stap 2:</strong> sleep de map <strong>Foto&apos;s play Up</strong>{' '}
                of losse JPG/PNG-bestanden hieronder. Bestanden zoals{' '}
                <code className="text-xs bg-amber-100 dark:bg-amber-900/40 px-1 rounded">
                  0AT11352_R376R_1.jpg
                </code>{' '}
                worden automatisch gekoppeld.
              </div>

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

              {resolved.some((p) => !p.found) && (
                <details className="text-sm text-gray-600 dark:text-gray-400">
                  <summary className="cursor-pointer">
                    {resolved.filter((p) => !p.found).length} referenties zonder
                    Odoo-match
                  </summary>
                  <ul className="mt-2 list-disc pl-5">
                    {resolved
                      .filter((p) => !p.found)
                      .map((p) => (
                        <li key={p.reference}>{p.reference}</li>
                      ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
