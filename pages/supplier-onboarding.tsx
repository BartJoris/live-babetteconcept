import { useState, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';

interface ColumnAnalysis {
  header: string;
  sampleValues: string[];
  suggestedMapping: string | null;
  confidence: number;
}

interface FileAnalysis {
  fileId: string;
  fileName: string;
  fileType: 'csv' | 'pdf' | 'unknown';
  delimiter?: string;
  rowCount?: number;
  headers?: string[];
  sampleRows?: string[][];
  columnAnalysis?: ColumnAnalysis[];
  suggestedRole: string;
  suggestedRoleLabel: string;
}

interface AISuggestion {
  id: string;
  displayName: string;
  brandName: string;
  fileInputs: Array<{
    id: string;
    label: string;
    accept: string;
    required: boolean;
    type: 'csv' | 'pdf';
  }>;
  csvConfig?: {
    delimiter: string;
    skipRows: number;
    columnMapping: Record<string, string>;
    priceFormat: 'european' | 'standard';
    sizeFormat: string;
  };
  nameTemplate: string;
  nameCasing?: Record<string, string>;
  groupBy: string;
  rrpMultiplier?: number;
  hasPdf: boolean;
  pdfParseEndpoint?: string;
}

interface UploadedFile {
  id: string;
  file: File;
  content?: string;
  isPdf: boolean;
  role: string;
  roleLabel: string;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    const finalMapping: Record<string, string> = {};
    for (const [header, field] of Object.entries(columnMappings)) {
      if (field && !finalMapping[field]) {
        finalMapping[field] = header;
      }
    }

    const hasPdf = uploadedFiles.some(f => f.isPdf);
    const hasMultipleCSVs = uploadedFiles.filter(f => !f.isPdf).length > 1;
    const hasRRP = !!finalMapping['rrp'];
    const priceFormat = config.csvConfig?.priceFormat || 'european';

    // If simple single-CSV supplier, use createCSVSupplier
    if (!hasPdf && !hasMultipleCSVs) {
      const columnsCode = Object.entries(finalMapping)
        .map(([field, header]) => {
          if (field === 'price' || field === 'rrp') {
            return `      ${field}: { column: '${header}', format: '${priceFormat}' },`;
          }
          return `      ${field}: '${header}',`;
        })
        .join('\n');

      const code = `import { createCSVSupplier } from '@/lib/suppliers/create-csv-supplier';

/**
 * ${config.displayName} supplier - auto-generated configuration.
 */
export default createCSVSupplier({
  id: '${config.id}',
  displayName: '${config.displayName}',
  brandName: '${config.brandName}',
  csv: {
    delimiter: '${config.csvConfig?.delimiter || ';'}',${config.csvConfig?.skipRows ? `\n    skipRows: ${config.csvConfig.skipRows},` : ''}
    columns: {
${columnsCode}
    },
  },
  nameTemplate: '${config.nameTemplate}',${config.nameCasing ? `\n  nameCasing: ${JSON.stringify(config.nameCasing)},` : ''}
  sizeFormat: '${config.csvConfig?.sizeFormat || 'raw'}',
  groupBy: '${config.groupBy || 'reference'}',${!hasRRP && config.rrpMultiplier ? `\n  rrpMultiplier: ${config.rrpMultiplier},` : ''}
});
`;
      setGeneratedCode(code);
      setStep(4);
      return;
    }

    // Complex supplier: generate full SupplierPlugin implementation
    const fileInputsCode = (config.fileInputs || []).map(fi =>
      `    { id: '${fi.id}', label: '${fi.label}', accept: '${fi.accept}', required: ${fi.required}, type: '${fi.type}' as const },`
    ).join('\n');

    const columnsCode = Object.entries(finalMapping)
      .map(([field, header]) => {
        if (field === 'price' || field === 'rrp') {
          return `      const ${field} = parseEuroPrice(row['${header}'] || '');`;
        }
        if (field === 'quantity') {
          return `      const ${field} = parseInt(row['${header}'] || '0') || 0;`;
        }
        return `      const ${field} = row['${header}'] || '';`;
      })
      .join('\n');

    const pdfSection = hasPdf ? `
  serverSideFileInputs: ['pdf_invoice'],
  pdfParseEndpoint: '${config.pdfParseEndpoint || `/api/parse-${config.id}-pdf`}',

  processPdfResults(pdfData, existingProducts, context) {
    // TODO: Implement PDF result processing for ${config.displayName}
    // pdfData contains the parsed PDF response from the server
    // Return { products: [...], message: '...' }
    return { products: existingProducts, message: 'PDF data ontvangen.' };
  },` : '';

    const code = `import { parseCSV, rowToObject, parseEuroPrice, convertSize, determineSizeAttribute, toSentenceCase } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

/**
 * ${config.displayName} supplier plugin.
 * Auto-generated - review and adjust as needed.
 *
 * File inputs: ${(config.fileInputs || []).map(fi => fi.label).join(', ')}
 */

function parseMainCSV(text: string, context: ParseContext): ParsedProduct[] {
  const { headers, rows } = parseCSV(text, { delimiter: '${config.csvConfig?.delimiter || ';'}' });
  if (headers.length === 0) return [];

  const brand = context.findBrand('${config.brandName.toLowerCase()}');
  const products: Record<string, ParsedProduct> = {};

  for (const values of rows) {
    const row = rowToObject(headers, values);

${columnsCode}

    if (!reference) continue;

    const groupKey = ${config.groupBy === 'reference-color' ? "`${reference}_${color}`" : 'reference'};

    if (!products[groupKey]) {
      const name = toSentenceCase(${finalMapping['name'] ? `row['${finalMapping['name']}']` : "''"} || '');
      const formattedName = \`${config.nameTemplate.replace(/\{brand\}/g, '${config.brandName}').replace(/\{name\}/g, '${name}').replace(/\{color\}/g, "${config.groupBy === 'reference-color' ? '${toSentenceCase(color)}' : ''}")}\`;

      products[groupKey] = {
        reference: groupKey,
        name: formattedName,
        originalName: ${finalMapping['name'] ? `row['${finalMapping['name']}']` : "''"} || '',
        material: ${finalMapping['material'] ? `row['${finalMapping['material']}']` : "''"} || '',
        color: ${finalMapping['color'] ? 'color' : "''"},
        variants: [],
        suggestedBrand: brand?.name,
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      };
    }

    products[groupKey].variants.push({
      size: ${config.csvConfig?.sizeFormat === 'eu' ? `convertSize(${finalMapping['size'] ? `row['${finalMapping['size']}']` : "''"} || '')` : `${finalMapping['size'] ? `row['${finalMapping['size']}']` : "''"} || ''`},
      quantity: ${finalMapping['quantity'] ? 'quantity' : '0'},
      ean: ${finalMapping['ean'] ? `row['${finalMapping['ean']}']` : "''"} || '',
      price: ${finalMapping['price'] ? 'price' : '0'},
      rrp: ${finalMapping['rrp'] ? 'rrp' : `${finalMapping['price'] ? `price * ${config.rrpMultiplier || 2.5}` : '0'}`},
    });
  }

  const productList = Object.values(products);
  productList.forEach(p => { p.sizeAttribute = determineSizeAttribute(p.variants); });
  return productList;
}

const plugin: SupplierPlugin = {
  id: '${config.id}',
  displayName: '${config.displayName}',
  brandName: '${config.brandName}',

  fileInputs: [
${fileInputsCode}
  ],

  parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
    const csvText = files['main_csv'] as string;
    if (!csvText) return [];
    return parseMainCSV(csvText, context);
  },
${pdfSection}
};

export default plugin;
`;

    setGeneratedCode(code);
    setStep(4);
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
              ].map((s, idx) => (
                <div key={s.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                      step >= s.id ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                    }`}>
                      {s.icon}
                    </div>
                    <span className="text-xs mt-1 text-gray-600 dark:text-gray-400">{s.name}</span>
                  </div>
                  {idx < 3 && (
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

              <div className="flex justify-between mt-6">
                <button onClick={() => setStep(2)}
                  className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-bold hover:bg-gray-300 dark:hover:bg-gray-600">
                  &larr; Terug
                </button>
                <button onClick={generatePlugin}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700">
                  Genereer Plugin Code
                </button>
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
        </div>
      </div>
    </>
  );
}
