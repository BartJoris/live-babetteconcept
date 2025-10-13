import { useState } from 'react';
import Head from 'next/head';

export default function PdfToCsvConverter() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [csvData, setCsvData] = useState('');
  const [priceCount, setPriceCount] = useState(0);

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPdfFile(file);
    setLoading(true);

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const response = await fetch('/api/parse-price-pdf', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (result.success && result.prices) {
        // Convert prices object to CSV format
        let csv = 'SKU,Unit Price\n';
        const entries = Object.entries(result.prices);
        
        entries.forEach(([sku, price]) => {
          csv += `${sku},${price}\n`;
        });
        
        setCsvData(csv);
        setPriceCount(entries.length);
      } else {
        alert('Fout bij het parsen van PDF: ' + (result.error || 'Onbekende fout'));
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
    link.setAttribute('download', `prices-${pdfFile?.name.replace('.pdf', '')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <Head>
        <title>PDF to CSV Converter - Babette</title>
      </Head>

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              📄→📊 PDF Prijslijst naar CSV Converter
            </h1>
            <p className="text-gray-600">
              Converteer een leverancier factuur PDF naar een CSV bestand met SKU en Unit Price
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="mb-6">
              <h2 className="text-xl font-bold mb-4">Upload PDF Factuur</h2>
              <p className="text-sm text-gray-600 mb-4">
                Upload een PDF factuur met SKU codes en prijzen (zoals Hello Simone facturen)
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
                  className="bg-blue-600 text-white px-6 py-3 rounded cursor-pointer hover:bg-blue-700 inline-block text-lg"
                >
                  {pdfFile ? `✓ ${pdfFile.name}` : 'Kies PDF Bestand'}
                </label>
                {loading && (
                  <div className="mt-4 text-blue-600">⏳ Bezig met converteren...</div>
                )}
              </div>
            </div>

            {csvData && (
              <>
                <div className="mb-6">
                  <div className="bg-green-50 border border-green-200 rounded p-4 mb-4">
                    <p className="text-green-800 font-medium">
                      ✅ Conversie geslaagd: {priceCount} prijzen geëxtraheerd
                    </p>
                  </div>

                  <h3 className="font-bold mb-3">Preview (eerste 20 regels):</h3>
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
                      setPriceCount(0);
                    }}
                    className="px-6 py-3 border border-gray-300 rounded hover:bg-gray-100"
                  >
                    🔄 Nieuwe Conversie
                  </button>
                </div>

                <div className="mt-6 bg-blue-50 border border-blue-200 rounded p-4">
                  <h4 className="font-bold text-blue-900 mb-2">📝 Volgende Stappen:</h4>
                  <ol className="text-sm text-blue-800 list-decimal ml-5 space-y-1">
                    <li>Download het gegenereerde CSV bestand</li>
                    <li>Ga naar Product Import</li>
                    <li>Upload zowel de Le New Black CSV als deze prijzen CSV</li>
                    <li>Het systeem zal prijzen matchen op basis van SKU</li>
                  </ol>
                </div>
              </>
            )}

            <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded p-4">
              <h4 className="font-bold text-yellow-800 mb-2">ℹ️ Verwacht PDF Formaat:</h4>
              <p className="text-sm text-yellow-700 mb-2">
                De PDF moet een factuur zijn met regels in dit formaat:
              </p>
              <pre className="text-xs bg-white p-3 rounded overflow-x-auto font-mono">
{`Name / Code     Description     Qty     Unit price  Line total
AW25-BFLJC-3Y   Bear fleece...  1,00    65,40      65,40
AW25-CAPM-4Y    Capri pants...  1,00    36,00      36,00`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

