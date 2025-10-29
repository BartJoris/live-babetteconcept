import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function ArmedAngelsPdfConverter() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [csvData, setCsvData] = useState('');
  const [productCount, setProductCount] = useState(0);
  const [debugText, setDebugText] = useState('');

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPdfFile(file);
    setLoading(true);

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const response = await fetch('/api/parse-armedangels-pdf/', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (result.success && result.csv) {
        setCsvData(result.csv);
        setProductCount(result.productCount || 0);
        setDebugText('');
      } else {
        if (result.debugText) {
          setDebugText(result.debugText);
        }
        alert('Fout bij het parsen van PDF: ' + (result.error || 'Onbekende fout') + '\n\nCheck de debug output hieronder.');
      }
    } catch (error) {
      console.error('PDF parsing error:', error);
      alert('Fout bij het converteren van PDF');
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = () => {
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `armedangels-products-${pdfFile?.name.replace('.pdf', '')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <Head>
        <title>Armed Angels PDF Converter - Babette</title>
      </Head>

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              🛡️ Armed Angels PDF naar CSV Converter
            </h1>
            <p className="text-gray-800">
              Converteer Armed Angels factuur PDF naar CSV voor product import
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">📋 Upload Factuur PDF</h2>
              <p className="text-sm text-gray-800 mb-4">
                Armed Angels bestelling/factuur PDF
              </p>
              
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <div className="text-4xl mb-3">📋</div>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handlePdfUpload}
                  className="hidden"
                  id="pdf-upload"
                />
                <label
                  htmlFor="pdf-upload"
                  className="bg-blue-600 text-white px-6 py-3 rounded cursor-pointer hover:bg-blue-700 inline-block"
                >
                  {pdfFile ? `✓ ${pdfFile.name}` : 'Kies Factuur'}
                </label>
                {loading && (
                  <div className="mt-4 text-blue-600">⏳ Converteren...</div>
                )}
              </div>
            </div>

            {debugText && (
              <div className="mb-6">
                <div className="bg-red-50 border border-red-200 rounded p-4 mb-4">
                  <h3 className="text-red-800 font-bold text-gray-900 mb-2">❌ Geen producten gevonden - Debug Output</h3>
                  <p className="text-sm text-red-700 mb-3">
                    De PDF kon niet correct worden geparsed. Hieronder staat de eerste 2000 karakters van de geëxtraheerde tekst.
                  </p>
                  <div className="bg-white border rounded p-3 overflow-x-auto max-h-96 overflow-y-auto">
                    <pre className="text-xs font-mono whitespace-pre-wrap">{debugText}</pre>
                  </div>
                </div>
              </div>
            )}

            {csvData && (
              <>
                <div className="mb-6">
                  <div className="bg-green-50 border border-green-200 rounded p-4 mb-4">
                    <p className="text-green-800 font-medium">
                      ✅ Conversie geslaagd: {productCount} product(en) geëxtraheerd
                    </p>
                  </div>

                  <h3 className="font-bold text-gray-900 mb-3">Preview (eerste 20 regels):</h3>
                  <div className="bg-gray-50 border rounded p-4 overflow-x-auto">
                    <pre className="text-xs font-mono">
                      {csvData.split('\n').slice(0, 21).join('\n')}
                    </pre>
                  </div>
                  {csvData.split('\n').length > 21 && (
                    <p className="text-sm text-gray-500 mt-2">
                      ... en {csvData.split('\n').length - 21} meer regels
                    </p>
                  )}
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={downloadCsv}
                    className="flex-1 bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700 text-lg font-bold"
                  >
                    📥 Download CSV Bestand
                  </button>
                  <button
                    onClick={() => {
                      setCsvData('');
                      setPdfFile(null);
                      setProductCount(0);
                      setDebugText('');
                    }}
                    className="px-6 py-3 border border-gray-300 rounded hover:bg-gray-100"
                  >
                    🔄 Nieuwe Conversie
                  </button>
                </div>

                <div className="mt-6 bg-blue-50 border border-blue-200 rounded p-4">
                  <h4 className="font-bold text-blue-900 text-gray-900 mb-2">📝 Volgende Stappen:</h4>
                  <ol className="text-sm text-blue-800 list-decimal ml-5 space-y-1">
                    <li>Download het gegenereerde CSV bestand</li>
                    <li>Ga naar <Link href="/product-import" className="underline font-bold">Product Import</Link></li>
                    <li>Selecteer &quot;Armed Angels&quot; als leverancier</li>
                    <li>Upload dit CSV bestand</li>
                  </ol>
                </div>
              </>
            )}

            <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded p-4">
              <h4 className="font-bold text-yellow-800 text-gray-900 mb-2">ℹ️ Over Armed Angels Import:</h4>
              <p className="text-sm text-yellow-700 mb-2">
                De PDF van uw Armed Angels bestelling wordt omgezet naar een CSV bestand met alle bestelapgegevens.
                Dit kan vervolgens in het product import systeem worden gebruikt om producten toe te voegen.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
