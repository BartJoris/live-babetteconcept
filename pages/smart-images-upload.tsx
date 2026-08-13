import { useCallback, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type InputHTMLAttributes } from 'react';
import Head from 'next/head';
import Link from 'next/link';

import ProductImageUploader from '@/components/images/ProductImageUploader';
import type { ImageTarget, PoolImage, UploadPoolResult } from '@/lib/images/types';
import {
  buildImageUploadLogPayload,
  downloadImageUploadLog,
  type ImageUploadLogEvent,
  type ImageUploadLogPayload,
} from '@/lib/images/image-upload-log';
import {
  collectFilesFromDataTransfer,
  supportsDirectoryPicker,
} from '@/lib/import/shared/browser-utils';
import { createParseContext, getSupplier, getAllSuppliers } from '@/lib/suppliers';
import type { ImageUploadConfig, SupplierPlugin } from '@/lib/suppliers/types';

type Step = 'source' | 'photos';

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

function parseImportLog(text: string): {
  vendor?: string;
  references: string[];
  preResolved: ResolvedProduct[];
} {
  const parsed = JSON.parse(text) as {
    vendor?: string;
    results?: Array<{
      reference: string;
      name?: string;
      templateId?: number;
      status?: string;
    }>;
    products?: Array<{ reference?: string; templateId?: number; name?: string }>;
  };

  const vendor = parsed.vendor;

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
      vendor,
      references: preResolved.map((p) => p.reference),
      preResolved,
    };
  }

  if (Array.isArray(parsed.products)) {
    return {
      vendor,
      references: parsed.products
        .map((p) => p.reference)
        .filter((r): r is string => Boolean(r)),
      preResolved: [],
    };
  }

  return { vendor, references: [], preResolved: [] };
}

export default function SmartImagesUploadPage() {
  const [step, setStep] = useState<Step>('source');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [plugin, setPlugin] = useState<SupplierPlugin | null>(null);
  const [resolved, setResolved] = useState<ResolvedProduct[]>([]);
  const [images, setImages] = useState<PoolImage[]>([]);
  const [uploadEvents, setUploadEvents] = useState<ImageUploadLogEvent[]>([]);
  const [uploadLog, setUploadLog] = useState<ImageUploadLogPayload | null>(null);
  const [downloadedLogName, setDownloadedLogName] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const eventsRef = useRef<ImageUploadLogEvent[]>([]);

  const targets = useMemo(() => targetsFromResolved(resolved), [resolved]);
  const foundCount = resolved.filter((p) => p.found).length;

  const imageUploadConfig = useMemo<ImageUploadConfig | null>(() => {
    if (!plugin?.imageUpload) return null;
    return { ...plugin.imageUpload };
  }, [plugin]);

  const resolveReferences = useCallback(
    async (references: string[], brandName: string) => {
      const unique = Array.from(new Set(references.filter(Boolean)));
      if (unique.length === 0) {
        throw new Error('Geen productreferenties gevonden.');
      }
      const res = await fetch('/api/resolve-templates-by-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ references: unique, brandName }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Kon producten niet in Odoo vinden');
      }
      return data.products as ResolvedProduct[];
    },
    [],
  );

  const processSourceFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setError(null);
      setLoading(true);
      setStatusMessage('Bestanden verwerken...');
      setUploadLog(null);
      setDownloadedLogName(null);
      eventsRef.current = [];
      setUploadEvents([]);

      try {
        const jsonFiles = files.filter(isJsonLog);
        const csvFiles = files.filter(isCsvLike);
        const usable = [...jsonFiles, ...csvFiles];
        if (usable.length === 0) {
          throw new Error(
            'Sleep een order-CSV of import-log JSON (of een map die die bevat).',
          );
        }
        setSourceLabel(usable.map((f) => f.name).slice(0, 3).join(', '));

        let preResolved: ResolvedProduct[] = [];
        let references: string[] = [];
        let detectedVendor: string | null = null;
        let detectedName: string | null = null;

        for (const file of jsonFiles) {
          const text = await file.text();
          const parsed = parseImportLog(text);
          if (parsed.vendor) detectedVendor = parsed.vendor;
          if (parsed.preResolved.length > 0) {
            preResolved = parsed.preResolved;
            references = parsed.references;
            break;
          }
          if (parsed.references.length > 0) {
            references = parsed.references;
          }
        }

        if (preResolved.length === 0 && csvFiles.length > 0) {
          setStatusMessage('Leverancier herkennen...');
          const apiFiles = [];
          for (const file of csvFiles) {
            apiFiles.push({
              fileId: file.name,
              fileName: file.name,
              content: await file.text(),
              isPdf: false,
            });
          }
          const detRes = await fetch('/api/detect-supplier', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: apiFiles }),
          });
          const det = await detRes.json();
          if (!det.success || !det.detectedSupplier) {
            throw new Error(
              'Leverancier niet herkend. Gebruik een import-log JSON of een bekende order-CSV.',
            );
          }
          detectedVendor = det.detectedSupplier;
          detectedName = det.detectedSupplierName;

          const supplier = getSupplier(detectedVendor!);
          if (!supplier) {
            throw new Error(`Onbekende leverancier: ${detectedVendor}`);
          }

          // Build file map from detection best matches
          const fileMap: Record<string, string> = {};
          for (const fr of det.files || []) {
            const match = fr.bestMatch;
            const uf = apiFiles.find((f) => f.fileId === fr.fileId);
            if (match && uf?.content) {
              fileMap[match.fileInputId] = uf.content;
            }
          }
          if (Object.keys(fileMap).length === 0 && apiFiles[0]?.content) {
            fileMap[supplier.fileInputs[0]?.id || 'main_csv'] = apiFiles[0].content;
          }

          const products = supplier.parse(
            fileMap,
            createParseContext([], detectedVendor!),
          );
          references = products.map((p) => p.reference);
        }

        if (!detectedVendor) {
          // Fall back: vendor from import-log filename
          const fromName = usable
            .map((f) => f.name.match(/import-log-([a-z0-9_-]+)/i)?.[1])
            .find(Boolean);
          if (fromName) detectedVendor = fromName.toLowerCase();
        }

        if (!detectedVendor) {
          throw new Error('Kon de leverancier niet bepalen uit de bestanden.');
        }

        const supplier = getSupplier(detectedVendor);
        if (!supplier) {
          throw new Error(`Geen plugin voor leverancier “${detectedVendor}”.`);
        }
        if (!supplier.imageUpload?.enabled) {
          throw new Error(
            `${supplier.displayName} heeft geen afbeeldingsmatching geconfigureerd.`,
          );
        }

        setSupplierId(detectedVendor);
        setPlugin(supplier);
        detectedName = detectedName || supplier.displayName;

        let products = preResolved;
        if (products.length === 0 || products.every((p) => !p.templateId)) {
          setStatusMessage(
            `${references.length} referenties · ${detectedName} — opzoeken in Odoo...`,
          );
          products = await resolveReferences(
            references,
            supplier.brandName || supplier.displayName,
          );
        }

        setResolved(products);
        const found = products.filter((p) => p.found).length;
        if (found === 0) {
          throw new Error(
            'Geen matching Odoo-templates. Importeer eerst de producten of gebruik het import-log.',
          );
        }

        setStatusMessage(
          `${detectedName}: ${found}/${products.length} producten klaar. Sleep nu foto’s of een map.`,
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

  const handleUploadEvent = useCallback(
    (event: {
      level: 'info' | 'warn' | 'error';
      message: string;
      reference?: string;
      filename?: string;
    }) => {
      const row: ImageUploadLogEvent = {
        ts: new Date().toISOString(),
        ...event,
      };
      if (event.message.startsWith('Start upload')) {
        eventsRef.current = [row];
        setUploadLog(null);
        setDownloadedLogName(null);
      } else {
        eventsRef.current = [...eventsRef.current, row];
      }
      setUploadEvents(eventsRef.current);
    },
    [],
  );

  const handleUploadComplete = useCallback(
    (poolResults: UploadPoolResult[]) => {
      const expectedByKey: Record<string, number> = {};
      const filenamesByKey: Record<string, string[]> = {};
      for (const img of images) {
        if (!img.assignedKey) continue;
        expectedByKey[img.assignedKey] =
          (expectedByKey[img.assignedKey] || 0) + 1;
        if (!filenamesByKey[img.assignedKey]) filenamesByKey[img.assignedKey] = [];
        filenamesByKey[img.assignedKey].push(img.filename);
      }

      const payload = buildImageUploadLogPayload({
        vendor: supplierId || 'unknown',
        sourceLabel,
        poolResults,
        targets,
        expectedByKey,
        filenamesByKey,
        unassignedFilenames: images
          .filter((img) => !img.assignedKey)
          .map((img) => img.filename),
        events: eventsRef.current,
      });

      setUploadLog(payload);
      const name = downloadImageUploadLog(payload);
      setDownloadedLogName(name);
      setStatusMessage(
        `Klaar: ${payload.summary.successful} gelukt, ${payload.summary.partial} deels, ${payload.summary.failed} mislukt · ${name}`,
      );
    },
    [images, sourceLabel, supplierId, targets],
  );

  const reset = () => {
    setStep('source');
    setResolved([]);
    setImages([]);
    setSourceLabel('');
    setSupplierId(null);
    setPlugin(null);
    setError(null);
    setStatusMessage('');
    setUploadLog(null);
    setDownloadedLogName(null);
    eventsRef.current = [];
    setUploadEvents([]);
  };

  const suppliersWithImages = useMemo(
    () =>
      getAllSuppliers()
        .filter((s) => s.imageUpload?.enabled)
        .map((s) => s.displayName)
        .sort((a, b) => a.localeCompare(b, 'nl')),
    [],
  );

  return (
    <>
      <Head>
        <title>Slimme afbeeldingen - Babette</title>
      </Head>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-5xl mx-auto px-4 space-y-6">
          <div>
            <Link
              href="/smart-upload"
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 text-sm"
            >
              &larr; Slim uploaden (producten)
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-4 mb-2">
              Slimme afbeeldingen
            </h1>
            <p className="text-gray-700 dark:text-gray-300">
              Zoals slim uploaden: sleep order-CSV of import-log — we herkennen de
              leverancier. Daarna foto&apos;s of een map. Na upload krijg je een JSON-log.
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
            <>
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
                  Order-CSV of <strong>import-log-….json</strong> — leverancier
                  wordt automatisch herkend.
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

              <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  Bestaande merken ({suppliersWithImages.length})
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Leveranciers met afbeeldingsmatching
                </p>
                <div className="flex flex-wrap gap-2">
                  {suppliersWithImages.map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 'photos' && plugin && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-gray-800 dark:text-gray-200">
                  <strong>{plugin.displayName}</strong> · {foundCount} producten
                  {sourceLabel && (
                    <span className="text-gray-500 dark:text-gray-400">
                      {' '}
                      · {sourceLabel}
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

              {!uploadLog && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-900 dark:text-amber-200">
                  <strong>Stap 2:</strong> sleep foto&apos;s of een hele map.
                  {imageUploadConfig?.exampleFilenames?.[0] && (
                    <>
                      {' '}
                      Voorbeeld:{' '}
                      <code className="text-xs bg-amber-100 dark:bg-amber-900/40 px-1 rounded">
                        {imageUploadConfig.exampleFilenames[0]}
                      </code>
                    </>
                  )}
                </div>
              )}

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
                showInstructions={!uploadLog}
                onUploadComplete={handleUploadComplete}
                onUploadEvent={handleUploadEvent}
              />

              {uploadEvents.length > 0 && (
                <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Live log ({uploadEvents.length})
                  </h3>
                  <div className="max-h-56 overflow-y-auto text-xs font-mono space-y-1">
                    {uploadEvents.map((ev, idx) => (
                      <div
                        key={`${ev.ts}-${idx}`}
                        className={
                          ev.level === 'error'
                            ? 'text-red-600 dark:text-red-400'
                            : ev.level === 'warn'
                              ? 'text-amber-700 dark:text-amber-300'
                              : 'text-gray-700 dark:text-gray-300'
                        }
                      >
                        [{ev.ts.slice(11, 19)}] {ev.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {uploadLog && (
                <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100">
                        Upload-log
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        JSON gedownload
                        {downloadedLogName ? `: ${downloadedLogName}` : ''}.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const name = downloadImageUploadLog(uploadLog);
                        setDownloadedLogName(name);
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                    >
                      Download JSON opnieuw
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-3">
                      <div className="text-xl font-bold text-green-700 dark:text-green-300">
                        {uploadLog.summary.successful}
                      </div>
                      <div className="text-xs text-green-700 dark:text-green-400">Gelukt</div>
                    </div>
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3">
                      <div className="text-xl font-bold text-amber-700 dark:text-amber-300">
                        {uploadLog.summary.partial}
                      </div>
                      <div className="text-xs text-amber-700 dark:text-amber-400">Deels</div>
                    </div>
                    <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3">
                      <div className="text-xl font-bold text-red-700 dark:text-red-300">
                        {uploadLog.summary.failed}
                      </div>
                      <div className="text-xs text-red-700 dark:text-red-400">Mislukt</div>
                    </div>
                    <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3">
                      <div className="text-xl font-bold text-blue-700 dark:text-blue-300">
                        {uploadLog.summary.totalImagesUploaded}
                      </div>
                      <div className="text-xs text-blue-700 dark:text-blue-400">Foto&apos;s</div>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto text-sm space-y-1">
                    {uploadLog.results.map((r) => (
                      <div
                        key={r.reference}
                        className={
                          r.status === 'success'
                            ? 'text-green-700 dark:text-green-300'
                            : r.status === 'partial'
                              ? 'text-amber-700 dark:text-amber-300'
                              : r.status === 'skipped'
                                ? 'text-gray-500 dark:text-gray-400'
                                : 'text-red-600 dark:text-red-400'
                        }
                      >
                        {r.status === 'success'
                          ? '✅'
                          : r.status === 'partial'
                            ? '⚠️'
                            : r.status === 'skipped'
                              ? '⏭️'
                              : '❌'}{' '}
                        <span className="font-mono">{r.reference}</span>
                        {': '}
                        {r.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
