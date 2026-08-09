import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import type { AISuggestion } from '@/lib/suppliers/onboarding/types';

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
  /** Status of the "Supplier Onboarding Agent" GitHub Actions run for this branch (best-effort; may never leave the queue, see the local supplier-onboarding skill instead). */
  workflowStatus: string | null;
  workflowConclusion: string | null;
  workflowUrl: string | null;
}

const SMART_UPLOAD_FILES_KEY = 'smart_upload_onboarding_files';
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|heic|bmp|tiff?)$/i;

/**
 * Supplier ids become a folder name (lib/suppliers/<id>/) and a JS import
 * specifier, so only plain lowercase letters/digits are allowed — no hyphens,
 * spaces or underscores (must match ID_PATTERN in pages/api/suppliers/onboard.ts).
 */
function normalizeSupplierId(raw: string): string {
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  return /^[a-z]/.test(normalized) ? normalized : `s${normalized}`;
}

/** Human-readable Dutch label for the (best-effort) "Supplier Onboarding Agent" GitHub Actions run. */
function describeWorkflowStatus(status: string | null, conclusion: string | null): string {
  if (!status) return 'Nog geen GitHub Actions-run gevonden voor deze branch.';
  if (status === 'queued') return 'Refine-run staat in de wachtrij (self-hosted runner momenteel niet actief — gebruik de lokale skill hieronder).';
  if (status === 'in_progress') return 'Een agent is de parser aan het verfijnen...';
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
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [imageFilenames, setImageFilenames] = useState<string[]>([]);
  const [imagePasteText, setImagePasteText] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [idTouched, setIdTouched] = useState(false);
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

  // Poll onboarding status (best-effort — self-hosted runner may not pick up the run;
  // finish the PR locally with the supplier-onboarding skill instead).
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

  const updateDisplayName = (value: string) => {
    setDisplayName(value);
    if (!idTouched) setSupplierId(normalizeSupplierId(value));
  };

  const updateSupplierId = (value: string) => {
    setSupplierId(normalizeSupplierId(value));
    setIdTouched(true);
  };

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

  const canSubmit = uploadedFiles.length > 0 && displayName.trim().length > 0 && brandName.trim().length > 0 && supplierId.length > 0;

  const startAutoOnboard = async () => {
    if (!canSubmit) return;

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

      // One fileInput per distinct role the user picked per file — no AI
      // pre-analysis needed, the supplier-onboarding skill figures out the
      // real column mapping from the sample files itself once picked up locally.
      const fileInputsByRole = new Map<string, AISuggestion['fileInputs'][number]>();
      for (const f of uploadedFiles) {
        if (!fileInputsByRole.has(f.role)) {
          fileInputsByRole.set(f.role, {
            id: f.role,
            label: f.roleLabel,
            accept: f.isPdf ? '.pdf' : '.csv',
            required: true,
            type: f.isPdf ? 'pdf' : 'csv',
          });
        }
      }

      const supplierConfig: AISuggestion = {
        id: supplierId,
        displayName: displayName.trim(),
        brandName: brandName.trim(),
        fileInputs: Array.from(fileInputsByRole.values()),
        nameTemplate: '{brand} {name}',
        groupBy: 'reference',
        hasPdf: uploadedFiles.some(f => f.isPdf),
      };

      const response = await fetch('/api/suppliers/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierConfig, columnMappings: {}, files, imageFilenames }),
      });
      const data = await response.json();

      if (data.success) {
        setOnboardResult({ prUrl: data.prUrl, prNumber: data.prNumber, branch: data.branch, warning: data.warning });
        setStep(2);
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
              Upload voorbeeld-bestanden van een nieuwe leverancier (CSV&apos;s en/of PDF&apos;s), geef naam + merk op,
              en er wordt automatisch een Pull Request aangemaakt. De echte parser wordt daarna lokaal afgewerkt.
            </p>
          </div>

          {/* Progress */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-6">
            <div className="flex items-center justify-between">
              {[
                { id: 1, name: 'Bestanden & Info', icon: '📤' },
                { id: 2, name: 'Klaar', icon: '🚀' },
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
                    <div className={`flex-1 h-0.5 mx-2 ${step > s.id ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Step 1: Upload Files + Basic Info */}
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

              {/* Basic supplier info */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Leverancier
                </h2>
                <p className="text-gray-700 dark:text-gray-300 mb-6">
                  De echte parser, tests en detectieregel worden lokaal afgewerkt op basis van de sample-bestanden — hier is enkel de basisinfo nodig.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Naam leverancier</label>
                    <input type="text" value={displayName}
                      onChange={(e) => updateDisplayName(e.target.value)}
                      placeholder="bv. Tiny Big Sister"
                      className="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Merk (voor Odoo)</label>
                    <input type="text" value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      placeholder="bv. Tiny Cottons"
                      className="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ID (automatisch)</label>
                    <input type="text" value={supplierId}
                      onChange={(e) => updateSupplierId(e.target.value)}
                      placeholder="tinybigsister"
                      className="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm" />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Alleen letters/cijfers (wordt een mapnaam).</p>
                  </div>
                </div>

                {onboardError && (
                  <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-sm">
                    {onboardError}
                  </div>
                )}

                <div className="flex justify-end mt-6">
                  <button
                    onClick={startAutoOnboard}
                    disabled={!canSubmit || isSubmittingOnboard}
                    className={`px-8 py-3 rounded-lg font-bold text-lg ${
                      !canSubmit || isSubmittingOnboard
                        ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                        : 'bg-purple-600 text-white hover:bg-purple-700'
                    }`}
                  >
                    {isSubmittingOnboard ? 'PR wordt aangemaakt...' : 'Automatisch PR aanmaken op GitHub'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Progress (PR created, finish locally with the supplier-onboarding skill) */}
          {step === 2 && onboardResult && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                  PR aangemaakt op GitHub
                </h2>
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                  Branch <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">{onboardResult.branch}</code> met
                  sample-bestanden en een concept-parser voor <strong>{displayName}</strong> staat klaar.
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
                  <li>
                    Open dit project lokaal in Cursor en vraag: &quot;Verwerk leverancier-PR #{onboardResult.prNumber}&quot; —
                    de <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">supplier-onboarding</code> skill werkt de parser,
                    tests en detectieregel verder af op basis van de echte sample-bestanden.
                  </li>
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
