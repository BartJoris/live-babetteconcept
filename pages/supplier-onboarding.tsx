import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import type { FileAnalysis, AISuggestion } from '@/lib/suppliers/onboarding/types';
import { generatePluginCode } from '@/lib/suppliers/onboarding/generatePluginCode';

interface UploadedFile {
  id: string;
  file: File;
  content?: string;
  isPdf: boolean;
  role: string;
  roleLabel: string;
}

/** Result of the automatic PR onboarding call. */
interface OnboardResult {
  prUrl: string;
  prNumber: number;
  branch: string;
  warning?: string;
}

interface OnboardStatus {
  prState: 'open' | 'closed' | 'merged' | 'unknown';
  mergeable: boolean | null;
  /** Status of the "Supplier Onboarding Agent" GitHub Actions run for this branch. */
  workflowStatus: string | null;
  workflowConclusion: string | null;
  workflowUrl: string | null;
}

const SMART_UPLOAD_FILES_KEY = 'smart_upload_onboarding_files';
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|heic|bmp|tiff?)$/i;

/** Human-readable Dutch label for the "Supplier Onboarding Agent" GitHub Actions run. */
function describeWorkflowStatus(status: string | null, conclusion: string | null): string {
  if (!status) return 'Wacht tot GitHub Actions de refine-run oppikt...';
  if (status === 'queued') return 'Refine-run staat in de wachtrij...';
  if (status === 'in_progress') return 'Claude Code is de parser aan het verfijnen...';
  if (status === 'completed') {
    if (conclusion === 'success') return 'Verfijning voltooid — controleer de laatste commit(s) in de PR.';
    if (conclusion === 'failure') return 'Verfijning is mislukt — bekijk de GitHub Actions log voor details.';
    if (conclusion === 'cancelled') return 'Refine-run geannuleerd.';
    return `Run afgerond (${conclusion || 'onbekend resultaat'}).`;
  }
  return `Status: ${status}`;
}

/** Browser-safe ArrayBuffer -> base64 (avoids relying on the Node.js Buffer global). */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

const FIELD_LABELS: Record<string, string> = {
  reference: 'Referentie / Artikelnr.',
  name: 'Productnaam',
  color: 'Kleur',
  size: 'Maat',
  material: 'Materiaal / Compositie',
  ean: 'EAN / Barcode',
  price: 'Inkoopprijs',
  rrp: 'Verkoopprijs (RRP)',
  quantity: 'Aantal',
  category: 'Categorie',
  description: 'Beschrijving',
  sku: 'SKU',
};

const FIELD_OPTIONS = Object.entries(FIELD_LABELS).map(([value, label]) => ({ value, label }));

const FILE_ROLE_OPTIONS = [
  { value: 'main_csv', label: 'Hoofd CSV (productdata)' },
  { value: 'ean_csv', label: 'EAN / Barcode CSV' },
  { value: 'tarif_csv', label: 'TARIF / Prijzen CSV' },
  { value: 'confirmation_csv', label: 'Order Confirmation CSV' },
  { value: 'descriptions_csv', label: 'Beschrijvingen CSV' },
  { value: 'pdf_invoice', label: 'PDF Factuur / Order' },
  { value: 'pdf_prices', label: 'PDF Prijslijst' },
  { value: 'pdf_catalog', label: 'PDF Catalogus' },
];

let fileIdCounter = 0;

export default function SupplierOnboardingPage() {
  const [step, setStep] = useState(1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [fileAnalyses, setFileAnalyses] = useState<FileAnalysis[]>([]);
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({});
  const [activeFileTab, setActiveFileTab] = useState<string | null>(null);
  const [supplierConfig, setSupplierConfig] = useState<AISuggestion | null>(null);
  const [generatedCode, setGeneratedCode] = useState('');
  const [imageFilenames, setImageFilenames] = useState<string[]>([]);
  const [imagePasteText, setImagePasteText] = useState('');
  const [isSubmittingOnboard, setIsSubmittingOnboard] = useState(false);
  const [onboardError, setOnboardError] = useState<string | null>(null);
  const [onboardResult, setOnboardResult] = useState<OnboardResult | null>(null);
  const [onboardStatus, setOnboardStatus] = useState<OnboardStatus | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageFolderInputRef = useRef<HTMLInputElement>(null);

  // Pick up files carried over from "Slim uploaden" when detection failed there.
  useEffect(() => {
    const raw = sessionStorage.getItem(SMART_UPLOAD_FILES_KEY);
    if (!raw) return;
    sessionStorage.removeItem(SMART_UPLOAD_FILES_KEY);
    try {
      const stored: Array<{ fileName: string; isPdf: boolean; content?: string }> = JSON.parse(raw);
      const restored: UploadedFile[] = stored.map(s => {
        const id = `file-${++fileIdCounter}`;
        const blob = new Blob([s.content || ''], { type: s.isPdf ? 'application/pdf' : 'text/csv' });
        const file = new File([blob], s.fileName, { type: blob.type });
        const defaultRole = s.isPdf ? 'pdf_invoice' : 'main_csv';
        const defaultLabel = s.isPdf ? 'PDF Bestand' : 'Hoofd CSV';
        return { id, file, content: s.isPdf ? undefined : s.content, isPdf: s.isPdf, role: defaultRole, roleLabel: defaultLabel };
      });
      if (restored.length > 0) setUploadedFiles(prev => [...prev, ...restored]);
    } catch {
      // Ignore malformed sessionStorage payloads.
    }
  }, []);

  // Poll onboarding status while an automatic PR + agent run is in progress.
  useEffect(() => {
    if (!onboardResult) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const params = new URLSearchParams({ prNumber: String(onboardResult.prNumber), branch: onboardResult.branch });
        const res = await fetch(`/api/suppliers/onboard-status?${params.toString()}`);
        const data = await res.json();
        if (!cancelled && data.success) {
          setOnboardStatus({
            prState: data.prState,
            mergeable: data.mergeable,
            workflowStatus: data.workflowStatus,
            workflowConclusion: data.workflowConclusion,
            workflowUrl: data.workflowUrl,
          });
        }
      } catch {
        // Transient polling errors are ignored; next interval retries.
      }
    };

    poll();
    const interval = setInterval(poll, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [onboardResult]);

  const addImageFilenames = (names: string[]) => {
    setImageFilenames(prev => {
      const merged = new Set([...prev, ...names.map(n => n.trim()).filter(Boolean)]);
      return Array.from(merged).slice(0, 300);
    });
  };

  const handleImageFolderPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const names = Array.from(e.target.files)
      .map(f => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name)
      .filter(name => IMAGE_EXT_RE.test(name));
    addImageFilenames(names);
    e.target.value = '';
  };

  const applyImagePasteText = () => {
    const names = imagePasteText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    addImageFilenames(names);
    setImagePasteText('');
  };

  const removeImageFilename = (name: string) => {
    setImageFilenames(prev => prev.filter(n => n !== name));
  };

  const addFiles = async (fileList: FileList) => {
    const newFiles: UploadedFile[] = [];

    for (const file of Array.from(fileList)) {
      const id = `file-${++fileIdCounter}`;
      const isPdf = file.name.toLowerCase().endsWith('.pdf');
      let content: string | undefined;

      if (!isPdf) {
        content = await file.text();
      }

      const defaultRole = isPdf ? 'pdf_invoice' : 'main_csv';
      const defaultLabel = isPdf ? 'PDF Bestand' : 'Hoofd CSV';

      newFiles.push({ id, file, content, isPdf, role: defaultRole, roleLabel: defaultLabel });
    }

    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  const handleFileAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await addFiles(e.target.files);
      e.target.value = '';
    }
  };

  const removeFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  const updateFileRole = (id: string, role: string) => {
    const roleOption = FILE_ROLE_OPTIONS.find(r => r.value === role);
    setUploadedFiles(prev => prev.map(f =>
      f.id === id ? { ...f, role, roleLabel: roleOption?.label || role } : f
    ));
  };

  const analyzeFiles = async () => {
    if (uploadedFiles.length === 0) return;
    setIsAnalyzing(true);

    try {
      const apiFiles = uploadedFiles.map(f => ({
        fileId: f.id,
        fileName: f.file.name,
        content: f.content,
        isPdf: f.isPdf,
      }));

      const response = await fetch('/api/analyze-supplier-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: apiFiles }),
      });

      const data = await response.json();

      if (data.success) {
        setFileAnalyses(data.files);

        // Update file roles from analysis
        const roleUpdates = new Map<string, { role: string; label: string }>();
        for (const fa of data.files) {
          roleUpdates.set(fa.fileId, { role: fa.suggestedRole, label: fa.suggestedRoleLabel });
        }
        setUploadedFiles(prev => prev.map(f => {
          const update = roleUpdates.get(f.id);
          return update ? { ...f, role: update.role, roleLabel: update.label } : f;
        }));

        // Pre-fill column mappings from the main CSV analysis
        const mainCsv = data.files.find((f: FileAnalysis) => f.suggestedRole === 'main_csv' && f.columnAnalysis);
        if (mainCsv?.columnAnalysis) {
          const mappings: Record<string, string> = {};
          for (const col of mainCsv.columnAnalysis) {
            if (col.suggestedMapping && col.confidence >= 0.6) {
              mappings[col.header] = col.suggestedMapping;
            }
          }
          setColumnMappings(mappings);
          setActiveFileTab(mainCsv.fileId);
        } else if (data.files.length > 0) {
          setActiveFileTab(data.files[0].fileId);
        }

        if (data.aiSuggestion) {
          setSupplierConfig(data.aiSuggestion);
        }

        setStep(2);
      } else {
        alert(`Analyse mislukt: ${data.error}`);
      }
    } catch (error) {
      alert(`Fout bij analyse: ${(error as Error).message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateMapping = (header: string, field: string) => {
    setColumnMappings(prev => {
      const updated = { ...prev };
      if (field) { updated[header] = field; } else { delete updated[header]; }
      return updated;
    });
  };

  const generatePlugin = () => {
    const config = supplierConfig;
    if (!config) return;

    const { code } = generatePluginCode({
      config,
      columnMappings,
      uploadedFiles: uploadedFiles.map(f => ({ fileName: f.file.name, isPdf: f.isPdf })),
      imageFilenames,
    });
    setGeneratedCode(code);
    setStep(4);
  };

  const startAutoOnboard = async () => {
    const config = supplierConfig;
    if (!config) return;

    setIsSubmittingOnboard(true);
    setOnboardError(null);
    setOnboardResult(null);
    setOnboardStatus(null);

    try {
      const files = await Promise.all(uploadedFiles.map(async f => ({
        fileName: f.file.name,
        isPdf: f.isPdf,
        encoding: f.isPdf ? ('base64' as const) : ('utf-8' as const),
        content: f.isPdf
          ? arrayBufferToBase64(await f.file.arrayBuffer())
          : (f.content ?? await f.file.text()),
      })));

      const response = await fetch('/api/suppliers/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierConfig: config, columnMappings, files, imageFilenames }),
      });
      const data = await response.json();

      if (data.success) {
        setOnboardResult({ prUrl: data.prUrl, prNumber: data.prNumber, branch: data.branch, warning: data.warning });
        setStep(5);
      } else {
        setOnboardError(data.error || 'Onbekende fout bij het aanmaken van de PR.');
      }
    } catch (error) {
      setOnboardError((error as Error).message);
    } finally {
      setIsSubmittingOnboard(false);
    }
  };

  const csvFiles = uploadedFiles.filter(f => !f.isPdf);
  const pdfFiles = uploadedFiles.filter(f => f.isPdf);

  return (
    <>
      <Head>
        <title>Nieuwe Leverancier - Babette</title>
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-5xl mx-auto px-4">
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-4">
              <Link href="/product-import" className="text-blue-600 hover:text-blue-700 dark:text-blue-400">
                &larr; Terug naar Import
              </Link>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Nieuwe Leverancier Toevoegen
            </h1>
            <p className="text-gray-700 dark:text-gray-300">
              Upload alle voorbeeld-bestanden van een nieuwe leverancier (CSV&apos;s en/of PDF&apos;s). AI analyseert de formaten en genereert automatisch een parser.
            </p>
          </div>

          {/* Progress */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-6">
            <div className="flex items-center justify-between">
              {[
                { id: 1, name: 'Bestanden', icon: '📤' },
                { id: 2, name: 'Analyse', icon: '🔍' },
                { id: 3, name: 'Configuratie', icon: '⚙️' },
                { id: 4, name: 'Code', icon: '💻' },
                { id: 5, name: 'Voortgang', icon: '🚀' },
              ].map((s, idx, arr) => (
                <div key={s.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                      step >= s.id ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                    }`}>
                      {s.icon}
                    </div>
                    <span className="text-xs mt-1 text-gray-600 dark:text-gray-400">{s.name}</span>
                  </div>
                  {idx < arr.length - 1 && (
                    <div className={`w-16 h-0.5 mx-2 ${step > s.id ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Step 1: Upload Files */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Upload voorbeeld-bestanden
                </h2>
                <p className="text-gray-700 dark:text-gray-300 mb-6">
                  Voeg alle bestanden toe die bij deze leverancier horen: order CSV&apos;s, EAN lijsten, prijslijsten, PDF facturen, etc.
                </p>

                {/* File list */}
                {uploadedFiles.length > 0 && (
                  <div className="space-y-3 mb-6">
                    {uploadedFiles.map(f => (
                      <div key={f.id} className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border dark:border-gray-600">
                        <div className="text-2xl">
                          {f.isPdf ? '📑' : '📄'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{f.file.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {f.isPdf ? 'PDF' : 'CSV'} &middot; {(f.file.size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                        <div className="w-56">
                          <select
                            value={f.role}
                            onChange={(e) => updateFileRole(f.id, e.target.value)}
                            className="w-full border dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          >
                            {FILE_ROLE_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                        <button
                          onClick={() => removeFile(f.id)}
                          className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 px-2 py-1"
                          title="Verwijderen"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add file button */}
                <div className="flex items-center gap-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.pdf,.xlsx"
                    multiple
                    onChange={handleFileAdd}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-6 py-3 bg-gray-100 dark:bg-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-500 rounded-lg text-gray-700 dark:text-gray-300 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-medium"
                  >
                    + Bestand toevoegen (CSV of PDF)
                  </button>

                  {uploadedFiles.length > 0 && (
                    <button
                      onClick={analyzeFiles}
                      disabled={isAnalyzing}
                      className={`px-8 py-3 rounded-lg font-bold text-lg ml-auto ${
                        isAnalyzing
                          ? 'bg-gray-400 text-gray-600 cursor-wait'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {isAnalyzing ? 'Bezig met analyseren...' : `Analyseer ${uploadedFiles.length} bestand${uploadedFiles.length > 1 ? 'en' : ''}`}
                    </button>
                  )}
                </div>

                {/* Summary */}
                {uploadedFiles.length > 0 && (
                  <div className="mt-6 flex gap-4 text-sm">
                    <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full">
                      {csvFiles.length} CSV bestand{csvFiles.length !== 1 ? 'en' : ''}
                    </span>
                    {pdfFiles.length > 0 && (
                      <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 px-3 py-1 rounded-full">
                        {pdfFiles.length} PDF bestand{pdfFiles.length !== 1 ? 'en' : ''}
                      </span>
                    )}
                  </div>
                )}

                {uploadedFiles.length === 0 && (
                  <div className="mt-8 text-center text-gray-500 dark:text-gray-400">
                    <div className="text-5xl mb-3">📁</div>
                    <p>Sleep bestanden hierheen of klik op &quot;Bestand toevoegen&quot;</p>
                    <p className="text-sm mt-1">Ondersteunde formaten: CSV, PDF</p>
                  </div>
                )}
              </div>

              {/* Optional: image filenames ("ls images") so the naming convention can be figured out */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Afbeeldingsnamen <span className="text-sm font-normal text-gray-500 dark:text-gray-400">(optioneel)</span>
                </h2>
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                  Elke leverancier gebruikt andere bestandsnamen voor productfoto&apos;s. Kies de afbeeldingenmap
                  (we lezen alleen de bestandsnamen, niet de foto&apos;s zelf) of plak zelf een lijst
                  (bijv. de uitvoer van <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">ls images/</code>),
                  zodat de naamgeving-conventie herkend kan worden.
                </p>

                <div className="flex flex-wrap items-start gap-4 mb-4">
                  <input
                    ref={imageFolderInputRef}
                    type="file"
                    multiple
                    // @ts-expect-error webkitdirectory is a non-standard but widely supported attribute
                    webkitdirectory=""
                    directory=""
                    onChange={handleImageFolderPick}
                    className="hidden"
                  />
                  <button
                    onClick={() => imageFolderInputRef.current?.click()}
                    className="px-6 py-3 bg-gray-100 dark:bg-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-500 rounded-lg text-gray-700 dark:text-gray-300 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-medium"
                  >
                    Map met afbeeldingen kiezen
                  </button>

                  <div className="flex-1 min-w-[240px]">
                    <textarea
                      value={imagePasteText}
                      onChange={(e) => setImagePasteText(e.target.value)}
                      placeholder={'TG_622_FRONT.jpg\nTG_622_BACK.jpg\n...'}
                      rows={2}
                      className="w-full border dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                    <button
                      onClick={applyImagePasteText}
                      disabled={!imagePasteText.trim()}
                      className="mt-2 px-4 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                    >
                      Lijst toevoegen
                    </button>
                  </div>
                </div>

                {imageFilenames.length > 0 && (
                  <div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      {imageFilenames.length} afbeeldingsnaam{imageFilenames.length !== 1 ? 'en' : ''} verzameld:
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                      {imageFilenames.map(name => (
                        <span key={name} className="inline-flex items-center gap-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 px-2 py-1 rounded-full">
                          {name}
                          <button onClick={() => removeImageFilename(name)} className="hover:text-red-600 dark:hover:text-red-400" title="Verwijderen">&times;</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Analysis Results */}
          {step === 2 && fileAnalyses.length > 0 && (
            <div className="space-y-6">
              {/* File overview */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Bestandsanalyse</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {fileAnalyses.map(fa => (
                    <button
                      key={fa.fileId}
                      onClick={() => fa.fileType === 'csv' ? setActiveFileTab(fa.fileId) : undefined}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        activeFileTab === fa.fileId
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : fa.fileType === 'pdf'
                          ? 'border-orange-300 dark:border-orange-600 bg-orange-50 dark:bg-orange-900/20'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-lg mb-1">{fa.fileType === 'pdf' ? '📑' : '📄'}</div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{fa.fileName}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{fa.suggestedRoleLabel}</div>
                      {fa.rowCount != null && (
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{fa.rowCount} rijen</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active file details */}
              {(() => {
                const activeFile = fileAnalyses.find(f => f.fileId === activeFileTab);
                if (!activeFile || activeFile.fileType !== 'csv') return null;

                return (
                  <>
                    {/* Sample data */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3">
                        Voorbeeld data: {activeFile.fileName}
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="bg-gray-100 dark:bg-gray-700">
                              {activeFile.headers?.map((h, i) => (
                                <th key={i} className="p-2 text-left text-gray-700 dark:text-gray-300 border dark:border-gray-600 font-medium whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {activeFile.sampleRows?.slice(0, 3).map((row, rIdx) => (
                              <tr key={rIdx}>
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="p-2 text-gray-900 dark:text-gray-100 border dark:border-gray-600 truncate max-w-[200px]">{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Column Mapping (only for main CSV or files with column analysis) */}
                    {activeFile.columnAnalysis && activeFile.columnAnalysis.length > 0 && (
                      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">Kolom Mapping: {activeFile.fileName}</h3>
                        <div className="space-y-3">
                          {activeFile.columnAnalysis.map((col) => (
                            <div key={col.header} className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                              <div className="w-1/3">
                                <div className="font-medium text-gray-900 dark:text-gray-100">{col.header}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                  {col.sampleValues.slice(0, 2).join(', ')}
                                </div>
                              </div>
                              <div className="text-gray-400">&rarr;</div>
                              <div className="w-1/3">
                                <select
                                  value={columnMappings[col.header] || ''}
                                  onChange={(e) => updateMapping(col.header, e.target.value)}
                                  className="w-full border dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                >
                                  <option value="">-- Niet mappen --</option>
                                  {FIELD_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="w-1/6">
                                {col.confidence >= 0.7 && (
                                  <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded">
                                    Hoge zekerheid
                                  </span>
                                )}
                                {col.confidence >= 0.4 && col.confidence < 0.7 && (
                                  <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 px-2 py-1 rounded">
                                    Mogelijke match
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              <div className="flex justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-bold hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  &larr; Bestanden aanpassen
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
                >
                  Volgende: Configuratie &rarr;
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Configuration */}
          {step === 3 && supplierConfig && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Leverancier Configuratie</h2>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ID (lowercase)</label>
                    <input type="text" value={supplierConfig.id}
                      onChange={(e) => setSupplierConfig({ ...supplierConfig, id: e.target.value })}
                      className="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Weergavenaam</label>
                    <input type="text" value={supplierConfig.displayName}
                      onChange={(e) => setSupplierConfig({ ...supplierConfig, displayName: e.target.value })}
                      className="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Merknaam (voor Odoo)</label>
                    <input type="text" value={supplierConfig.brandName}
                      onChange={(e) => setSupplierConfig({ ...supplierConfig, brandName: e.target.value })}
                      className="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Naam Template</label>
                    <input type="text" value={supplierConfig.nameTemplate}
                      onChange={(e) => setSupplierConfig({ ...supplierConfig, nameTemplate: e.target.value })}
                      className="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="{brand} - {name} - {color}" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Maat Formaat</label>
                    <select
                      value={supplierConfig.csvConfig?.sizeFormat || 'raw'}
                      onChange={(e) => setSupplierConfig({
                        ...supplierConfig,
                        csvConfig: { ...supplierConfig.csvConfig!, sizeFormat: e.target.value },
                      })}
                      className="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="raw">Ongewijzigd (raw)</option>
                      <option value="eu">EU maten (92, 104 &rarr; leeftijd)</option>
                      <option value="age">Leeftijd formaat (al correct)</option>
                      <option value="y-suffix">Y/M suffix (3Y, 6M &rarr; leeftijd)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Groepering</label>
                    <select
                      value={supplierConfig.groupBy || 'reference'}
                      onChange={(e) => setSupplierConfig({ ...supplierConfig, groupBy: e.target.value })}
                      className="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="reference">Per referentie</option>
                      <option value="reference-color">Per referentie + kleur</option>
                    </select>
                  </div>
                </div>

                {/* File inputs overview */}
                {supplierConfig.fileInputs && supplierConfig.fileInputs.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Bestands-inputs</label>
                    <div className="space-y-2">
                      {supplierConfig.fileInputs.map((fi, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                          <span className="text-lg">{fi.type === 'pdf' ? '📑' : '📄'}</span>
                          <input
                            type="text"
                            value={fi.label}
                            onChange={(e) => {
                              const updated = [...supplierConfig.fileInputs];
                              updated[idx] = { ...fi, label: e.target.value };
                              setSupplierConfig({ ...supplierConfig, fileInputs: updated });
                            }}
                            className="flex-1 border dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                          <span className={`text-xs px-2 py-1 rounded ${fi.required ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : 'bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300'}`}>
                            {fi.required ? 'Verplicht' : 'Optioneel'}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{fi.id}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {onboardError && (
                <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-sm">
                  {onboardError}
                </div>
              )}

              <div className="flex justify-between items-center mt-6">
                <button onClick={() => setStep(2)}
                  className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-bold hover:bg-gray-300 dark:hover:bg-gray-600">
                  &larr; Terug
                </button>
                <div className="flex items-center gap-3">
                  <button onClick={generatePlugin}
                    className="px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 text-sm">
                    Of: kopieer code zelf
                  </button>
                  <button onClick={startAutoOnboard} disabled={isSubmittingOnboard}
                    className={`px-6 py-3 rounded-lg font-bold ${isSubmittingOnboard ? 'bg-gray-400 text-gray-600 cursor-wait' : 'bg-purple-600 text-white hover:bg-purple-700'}`}>
                    {isSubmittingOnboard ? 'PR wordt aangemaakt...' : 'Automatisch PR aanmaken (start Claude Code-agent)'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Generated Code */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Gegenereerde Plugin Code</h2>
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                  Kopieer deze code naar: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">lib/suppliers/{supplierConfig?.id}/index.ts</code>
                </p>

                <div className="relative">
                  <pre className="bg-gray-900 text-green-400 rounded-lg p-4 overflow-x-auto text-sm leading-relaxed max-h-[600px]">
                    {generatedCode}
                  </pre>
                  <button
                    onClick={() => { navigator.clipboard.writeText(generatedCode); alert('Code gekopieerd!'); }}
                    className="absolute top-2 right-2 px-3 py-1 bg-gray-700 text-gray-200 rounded text-sm hover:bg-gray-600">
                    Kopieer
                  </button>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
                <h3 className="font-bold text-blue-900 dark:text-blue-100 mb-3">Volgende stappen:</h3>
                <ol className="list-decimal list-inside space-y-2 text-blue-800 dark:text-blue-200">
                  <li>Maak <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">lib/suppliers/{supplierConfig?.id}/index.ts</code></li>
                  <li>Plak de code en pas aan waar nodig (zoek naar TODO&apos;s)</li>
                  {pdfFiles.length > 0 && (
                    <li>Maak een PDF parser API endpoint: <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">pages/api/parse-{supplierConfig?.id}-pdf.ts</code></li>
                  )}
                  <li>Voeg import + registratie toe in <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">lib/suppliers/index.ts</code></li>
                  <li>Test met echte bestanden</li>
                </ol>
              </div>

              <div className="flex justify-between">
                <button onClick={() => setStep(3)}
                  className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-bold hover:bg-gray-300 dark:hover:bg-gray-600">
                  &larr; Configuratie Aanpassen
                </button>
                <Link href="/product-import"
                  className="px-6 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 inline-block">
                  Naar Product Import &rarr;
                </Link>
              </div>
            </div>
          )}

          {/* Step 5: Progress (automatic PR + agent) */}
          {step === 5 && onboardResult && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                  PR aangemaakt op GitHub
                </h2>
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                  Branch <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">{onboardResult.branch}</code> met
                  sample-bestanden en een concept-parser voor <strong>{supplierConfig?.displayName}</strong> staat klaar.
                </p>
                <a href={onboardResult.prUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-block px-6 py-3 bg-gray-900 dark:bg-gray-700 text-white rounded-lg font-bold hover:bg-gray-800 dark:hover:bg-gray-600 mb-4">
                  Bekijk PR #{onboardResult.prNumber} op GitHub &rarr;
                </a>

                {onboardResult.warning && (
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg text-yellow-800 dark:text-yellow-200 text-sm mb-4">
                    {onboardResult.warning}
                  </div>
                )}

                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {onboardStatus?.workflowStatus !== 'completed' && (
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    )}
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {describeWorkflowStatus(onboardStatus?.workflowStatus ?? null, onboardStatus?.workflowConclusion ?? null)}
                    </span>
                  </div>
                  {onboardStatus?.workflowUrl && (
                    <a href={onboardStatus.workflowUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block">
                      Bekijk GitHub Actions log &rarr;
                    </a>
                  )}
                  {onboardStatus && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      PR status: {onboardStatus.prState}
                      {onboardStatus.mergeable != null && ` · mergeable: ${onboardStatus.mergeable ? 'ja' : 'nee'}`}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
                <h3 className="font-bold text-blue-900 dark:text-blue-100 mb-3">Volgende stappen:</h3>
                <ol className="list-decimal list-inside space-y-2 text-blue-800 dark:text-blue-200">
                  <li>Wacht tot de "Supplier Onboarding Agent" GitHub Actions-run klaar is met verfijnen en testen (kan enkele minuten duren)</li>
                  <li>Review de PR op GitHub</li>
                  <li>Merge zelf zodra je tevreden bent — dit gaat pas dan live via Vercel</li>
                  <li>Test daarna met &quot;Slim uploaden&quot; opnieuw</li>
                </ol>
              </div>

              <div className="flex justify-between">
                <Link href="/smart-upload"
                  className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-bold hover:bg-gray-300 dark:hover:bg-gray-600 inline-block">
                  &larr; Terug naar Slim uploaden
                </Link>
                <Link href="/product-import"
                  className="px-6 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 inline-block">
                  Naar Product Import &rarr;
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
