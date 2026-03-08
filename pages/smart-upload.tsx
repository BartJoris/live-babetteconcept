import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getSupplier, createParseContext } from '@/lib/suppliers';

interface DetectionMatch {
  supplierId: string;
  supplierName: string;
  fileInputId: string;
  fileInputLabel: string;
  confidence: number;
  reason: string;
}

interface FileDetectionResult {
  fileId: string;
  fileName: string;
  isPdf: boolean;
  matches: DetectionMatch[];
  bestMatch: DetectionMatch | null;
}

interface UploadedFile {
  id: string;
  file: File;
  content?: string;
  isPdf: boolean;
}

interface DetectionState {
  files: FileDetectionResult[];
  detectedSupplier: string | null;
  detectedSupplierName: string | null;
  allFilesMatched: boolean;
}

/** Encode supplier+fileInput into a single dropdown value */
function encodeChoice(supplierId: string, fileInputId: string): string {
  return `${supplierId}::${fileInputId}`;
}
function decodeChoice(val: string): { supplierId: string; fileInputId: string } {
  const [supplierId, fileInputId] = val.split('::');
  return { supplierId, fileInputId };
}

let _fid = 0;

export default function SmartUploadPage() {
  const router = useRouter();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [status, setStatus] = useState<'idle' | 'detecting' | 'detected' | 'processing' | 'redirecting'>('idle');
  const [detection, setDetection] = useState<DetectionState | null>(null);
  // overrides: fileId -> "supplierId::fileInputId"
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Compute the effective supplier based on detection + user overrides.
   * If the user overrode any file to a different supplier, that takes precedence.
   */
  const effectiveSupplier = useMemo(() => {
    if (!detection) return { id: null as string | null, name: null as string | null };

    // Collect votes: auto-detected + overridden
    const votes = new Map<string, { name: string; weight: number }>();

    for (const fr of detection.files) {
      const override = overrides[fr.fileId];
      let supplierId: string;
      let supplierName: string;

      if (override) {
        const decoded = decodeChoice(override);
        supplierId = decoded.supplierId;
        const match = fr.matches.find(m => m.supplierId === supplierId);
        supplierName = match?.supplierName || supplierId;
      } else if (fr.bestMatch) {
        supplierId = fr.bestMatch.supplierId;
        supplierName = fr.bestMatch.supplierName;
      } else {
        continue;
      }

      const existing = votes.get(supplierId);
      // User overrides weigh more (2x)
      const weight = override ? 2 : 1;
      if (existing) {
        existing.weight += weight;
      } else {
        votes.set(supplierId, { name: supplierName, weight });
      }
    }

    let bestId: string | null = null;
    let bestName: string | null = null;
    let bestWeight = 0;
    for (const [id, vote] of votes) {
      if (vote.weight > bestWeight) {
        bestWeight = vote.weight;
        bestId = id;
        bestName = vote.name;
      }
    }

    return { id: bestId, name: bestName };
  }, [detection, overrides]);

  /**
   * Process all files and redirect to product-import.
   */
  const goToImport = useCallback(async (
    det: DetectionState,
    files: UploadedFile[],
    ovr: Record<string, string>,
    supplierId: string,
    supplierName: string,
  ) => {
    setStatus('processing');
    setStatusMessage('Bestanden verwerken...');

    const plugin = getSupplier(supplierId);
    const fileMap: Record<string, string> = {};
    const pdfFiles: Array<{ file: File; fileInputId: string }> = [];

    for (const fr of det.files) {
      const uf = files.find(u => u.id === fr.fileId);
      if (!uf) continue;

      // Determine which fileInputId to use
      const override = ovr[fr.fileId];
      let fileInputId: string;
      if (override) {
        fileInputId = decodeChoice(override).fileInputId;
      } else {
        fileInputId = fr.bestMatch?.fileInputId || 'main_csv';
      }

      if (uf.isPdf) {
        pdfFiles.push({ file: uf.file, fileInputId });
      } else if (uf.content) {
        fileMap[fileInputId] = uf.content;
      }
    }

    // Parse PDFs server-side if needed
    if (pdfFiles.length > 0 && plugin?.pdfParseEndpoint && plugin.processPdfResults) {
      setStatusMessage('PDF verwerken...');
      try {
        const isTangerine = supplierId === 'tangerine';
        if (isTangerine && pdfFiles.length >= 1) {
          const formData = new FormData();
          formData.append('packing', pdfFiles[0].file);
          if (pdfFiles[1]) formData.append('price', pdfFiles[1].file);
          const res = await fetch(plugin.pdfParseEndpoint, { method: 'POST', body: formData });
          const pdfData = await res.json();
          if (pdfData.success) {
            const csvProducts = Object.keys(fileMap).length > 0 ? plugin.parse(fileMap, createParseContext([], supplierId)) : [];
            const result = plugin.processPdfResults(pdfData, csvProducts, createParseContext([], supplierId));
            if (result.products.length > 0) sessionStorage.setItem('smart_upload_products', JSON.stringify(result.products));
          }
        } else {
          for (const pf of pdfFiles) {
            const formData = new FormData();
            formData.append('pdf', pf.file);
            const res = await fetch(plugin.pdfParseEndpoint, { method: 'POST', body: formData });
            const pdfData = await res.json();
            if (pdfData.success) {
              const csvProducts = Object.keys(fileMap).length > 0 ? plugin.parse(fileMap, createParseContext([], supplierId)) : [];
              const result = plugin.processPdfResults(pdfData, csvProducts, createParseContext([], supplierId));
              if (result.products.length > 0) sessionStorage.setItem('smart_upload_products', JSON.stringify(result.products));
            }
          }
        }
      } catch (error) {
        console.error('PDF processing error:', error);
      }
    }

    setStatus('redirecting');
    setStatusMessage(`Doorsturen naar ${supplierName}...`);

    sessionStorage.setItem('smart_upload_supplier', supplierId);
    sessionStorage.setItem('smart_upload_files', JSON.stringify(fileMap));
    router.push(`/product-import?vendor=${supplierId}&smartUpload=true`);
  }, [router]);

  const runDetection = useCallback(async (files: UploadedFile[]) => {
    if (files.length === 0) return;
    setStatus('detecting');
    setStatusMessage('Leverancier herkennen...');

    try {
      const apiFiles = files.map(f => ({
        fileId: f.id,
        fileName: f.file.name,
        content: f.content,
        isPdf: f.isPdf,
      }));

      const res = await fetch('/api/detect-supplier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: apiFiles }),
      });
      const data: DetectionState & { success: boolean } = await res.json();

      if (data.success) {
        setDetection(data);
        setOverrides({});

        if (data.detectedSupplier && data.allFilesMatched) {
          await goToImport(data, files, {}, data.detectedSupplier, data.detectedSupplierName!);
          return;
        }

        setStatus('detected');
        if (data.detectedSupplier) {
          setStatusMessage(`Leverancier herkend: ${data.detectedSupplierName}`);
        } else {
          setStatusMessage('Leverancier niet herkend');
        }
      } else {
        setStatus('detected');
        setStatusMessage('Detectie mislukt');
      }
    } catch {
      setStatus('detected');
      setStatusMessage('Fout bij detectie');
    }
  }, [goToImport]);

  // Auto-detect whenever files change
  useEffect(() => {
    if (uploadedFiles.length === 0) {
      setDetection(null);
      setStatus('idle');
      setStatusMessage('');
      return;
    }

    if (detectTimeoutRef.current) clearTimeout(detectTimeoutRef.current);
    detectTimeoutRef.current = setTimeout(() => {
      runDetection(uploadedFiles);
    }, 400);

    return () => {
      if (detectTimeoutRef.current) clearTimeout(detectTimeoutRef.current);
    };
  }, [uploadedFiles, runDetection]);

  const addFiles = useCallback(async (fileList: FileList | File[]) => {
    const newFiles: UploadedFile[] = [];
    for (const file of Array.from(fileList)) {
      const id = `f-${++_fid}`;
      const isPdf = file.name.toLowerCase().endsWith('.pdf');
      let content: string | undefined;
      if (!isPdf) content = await file.text();
      newFiles.push({ id, file, content, isPdf });
    }
    setUploadedFiles(prev => [...prev, ...newFiles]);
  }, []);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await addFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) await addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const removeFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
    setOverrides({});
  };

  const confidenceColor = (c: number) => {
    if (c >= 0.85) return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-600';
    if (c >= 0.6) return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-600';
    return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-600';
  };

  const confidenceLabel = (c: number) => {
    if (c >= 0.85) return 'Zeker';
    if (c >= 0.6) return 'Waarschijnlijk';
    return 'Onzeker';
  };

  return (
    <>
      <Head><title>Smart Upload - Babette</title></Head>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-4xl mx-auto px-4">
          {/* Header */}
          <div className="mb-8">
            <Link href="/product-import" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 text-sm">
              &larr; Terug naar Import
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-4 mb-2">
              Smart Upload
            </h1>
            <p className="text-gray-700 dark:text-gray-300">
              Sleep bestanden hierheen. Het systeem herkent automatisch de leverancier en gaat direct door naar de import.
            </p>
          </div>

          {/* Status bar */}
          {status !== 'idle' && (
            <div className={`rounded-xl p-4 mb-6 flex items-center gap-3 transition-all ${
              status === 'redirecting' || status === 'processing'
                ? 'bg-green-100 dark:bg-green-900/20 border border-green-300 dark:border-green-600'
                : status === 'detecting'
                ? 'bg-blue-100 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-600'
                : effectiveSupplier.id
                ? 'bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-700'
                : 'bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-700'
            }`}>
              {(status === 'detecting' || status === 'processing' || status === 'redirecting') && (
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              )}
              {status === 'detected' && effectiveSupplier.id && (
                <span className="text-xl">✅</span>
              )}
              {status === 'detected' && !effectiveSupplier.id && (
                <span className="text-xl">❓</span>
              )}
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {status === 'detected' && effectiveSupplier.id
                  ? `Leverancier: ${effectiveSupplier.name}`
                  : statusMessage}
              </span>
              {status === 'detected' && effectiveSupplier.id && detection && !detection.allFilesMatched && (
                <span className="text-sm text-orange-600 dark:text-orange-400 ml-2">
                  Controleer bestandstoewijzing hieronder
                </span>
              )}
            </div>
          )}

          {/* Drop zone + file list */}
          <div
            className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 border-dashed transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 dark:border-gray-600'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            {uploadedFiles.length === 0 ? (
              <div className="p-16 text-center">
                <div className="text-6xl mb-4">📁</div>
                <p className="text-xl text-gray-700 dark:text-gray-300 font-medium mb-2">
                  Sleep bestanden hierheen
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  CSV&apos;s en PDF&apos;s van dezelfde leverancier - het systeem herkent automatisch alles
                </p>
                <input ref={fileInputRef} type="file" accept=".csv,.pdf" multiple onChange={handleFileInput} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
                  Of klik om bestanden te kiezen
                </button>
              </div>
            ) : (
              <div className="p-5">
                <div className="space-y-2 mb-4">
                  {uploadedFiles.map(f => {
                    const fr = detection?.files.find(dr => dr.fileId === f.id);
                    const match = fr?.bestMatch;
                    const currentOverride = overrides[f.id];
                    const currentChoice = currentOverride
                      ? decodeChoice(currentOverride)
                      : match
                      ? { supplierId: match.supplierId, fileInputId: match.fileInputId }
                      : null;

                    return (
                      <div key={f.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <span className="text-xl flex-shrink-0">{f.isPdf ? '📑' : '📄'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{f.file.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {f.isPdf ? 'PDF' : 'CSV'} &middot; {(f.file.size / 1024).toFixed(1)} KB
                          </div>
                        </div>

                        {/* Detection result */}
                        {status === 'detecting' ? (
                          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        ) : fr && fr.matches.length > 0 ? (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <select
                              value={currentChoice ? encodeChoice(currentChoice.supplierId, currentChoice.fileInputId) : ''}
                              onChange={(e) => {
                                setOverrides(prev => ({ ...prev, [f.id]: e.target.value }));
                              }}
                              className={`text-xs border rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 max-w-[280px] ${
                                currentChoice ? confidenceColor(match?.confidence || 0.5) : ''
                              }`}
                            >
                              {fr.matches.map((m, i) => (
                                <option key={i} value={encodeChoice(m.supplierId, m.fileInputId)}>
                                  {m.supplierName} - {m.fileInputLabel} ({Math.round(m.confidence * 100)}%)
                                </option>
                              ))}
                            </select>
                            {match && !currentOverride && (
                              <span className={`text-xs px-2 py-1 rounded ${confidenceColor(match.confidence)}`}>
                                {confidenceLabel(match.confidence)}
                              </span>
                            )}
                            {currentOverride && (
                              <span className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                Handmatig
                              </span>
                            )}
                          </div>
                        ) : detection ? (
                          <span className="text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-2 py-1 rounded flex-shrink-0">
                            Niet herkend
                          </span>
                        ) : null}

                        <button onClick={() => removeFile(f.id)}
                          className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 text-lg px-1 flex-shrink-0" title="Verwijderen">
                          &times;
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3">
                  <input ref={fileInputRef} type="file" accept=".csv,.pdf" multiple onChange={handleFileInput} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600">
                    + Meer bestanden
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action area */}
          {status === 'detected' && detection && (
            <div className="mt-6 flex items-center justify-between">
              {effectiveSupplier.id ? (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Controleer de toewijzing hierboven en klik op de knop.
                  </p>
                  <button
                    onClick={() => goToImport(detection, uploadedFiles, overrides, effectiveSupplier.id!, effectiveSupplier.name!)}
                    className="px-8 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 whitespace-nowrap ml-4"
                  >
                    Start import als {effectiveSupplier.name} &rarr;
                  </button>
                </>
              ) : (
                <div className="w-full text-center py-4">
                  <p className="text-gray-700 dark:text-gray-300 mb-3">
                    De bestanden komen niet overeen met een bekende leverancier.
                  </p>
                  <Link href="/supplier-onboarding"
                    className="px-6 py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 inline-block">
                    Nieuwe leverancier toevoegen &rarr;
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
