import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function PlayUpPdfConverter() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  // const [colorPdfFile, setColorPdfFile] = useState<File | null>(null); // TEMPORARILY DISABLED
  const [loading, setLoading] = useState(false);
  const [csvData, setCsvData] = useState('');
  const [productCount, setProductCount] = useState(0);
  // const [colorMappings, setColorMappings] = useState<Record<string, string>>({}); // TEMPORARILY DISABLED
  const [debugText, setDebugText] = useState('');

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPdfFile(file);
    setLoading(true);

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const response = await fetch('/api/parse-playup-pdf', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (result.success && result.csv) {
        setCsvData(result.csv);
        setProductCount(result.productCount || 0);
        setDebugText('');
      } else {
        // Show debug text if available
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

  // TEMPORARILY DISABLED - Color Palette Upload
  /*
  const handleColorPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setColorPdfFile(file);
    setLoading(true);

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const response = await fetch('/api/parse-playup-colors', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (result.success && result.colorMappings) {
        setColorMappings(result.colorMappings);
        alert(`✅ ${result.count} color mappings extracted!`);
      } else {
        if (result.debugText) {
          setDebugText(result.debugText);
        }
        alert('Fout bij het parsen van Color Palette: ' + (result.error || 'Onbekende fout'));
      }
    } catch (error) {
      console.error('Color palette parsing error:', error);
      alert('Fout bij het converteren van Color Palette PDF');
    } finally {
      setLoading(false);
    }
  };
  */

  const downloadCsv = () => {
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `playup-products-${pdfFile?.name.replace('.pdf', '')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // TEMPORARILY DISABLED - Download Color Mappings
  /*
  const downloadColorMappings = () => {
    const csv = 'ColorCode,ColorName\n' + 
      Object.entries(colorMappings).map(([code, name]) => `${code},${name}`).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', 'playup-color-mappings.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  */

  return (
    <>
      <Head>
        <title>Play UP PDF Converter - Babette</title>
      </Head>

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="mb-8">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  🎮 Play UP PDF naar CSV Converter
                </h1>
                <p className="text-gray-800">
                  Converteer Play UP factuur PDF naar CSV voor product import
                </p>
              </div>
              <Link
                href="/playup-debug"
                className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 text-sm font-medium"
              >
                🐛 Login Debug Tool
              </Link>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-8">
            {/* Temporarily disabled Color Palette feature */}
            {/* <div className="grid grid-cols-2 gap-4 mb-6"> */}
            <div className="mb-6">
              {/* Invoice PDF */}
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">📋 Upload Factuur PDF</h2>
                <p className="text-sm text-gray-800 mb-4">
                  Play UP factuur (CFTI22502214.pdf)
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

              {/* Color Palette PDF - TEMPORARILY DISABLED */}
              {/* 
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">2️⃣ Upload Color Palette (Optioneel)</h2>
                <p className="text-sm text-gray-800 mb-4">
                  Voor kleur naam matching (AW25 Color Palette.pdf)
                </p>
                
                <div className="border-2 border-dashed border-orange-300 rounded-lg p-8 text-center">
                  <div className="text-4xl mb-3">🎨</div>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleColorPdfUpload}
                    className="hidden"
                    id="color-pdf-upload"
                  />
                  <label
                    htmlFor="color-pdf-upload"
                    className={`px-6 py-3 rounded cursor-pointer hover:bg-orange-700 inline-block ${
                      colorPdfFile ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-orange-600 text-white'
                    }`}
                  >
                    {colorPdfFile ? `✓ ${Object.keys(colorMappings).length} kleuren` : 'Kies Color Palette'}
                  </label>
                  {loading && (
                    <div className="mt-4 text-orange-600">⏳ Parsen...</div>
                  )}
                </div>
              </div>
              */}
            </div>

            {/* Color Mappings Display - TEMPORARILY DISABLED */}
            {/* 
            {Object.keys(colorMappings).length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded p-4 mb-6">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-green-800 font-medium">
                    ✅ {Object.keys(colorMappings).length} kleur mappings geladen
                  </p>
                  <button
                    onClick={downloadColorMappings}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm"
                  >
                    📥 Download Color CSV
                  </button>
                </div>
                <div className="bg-white border rounded p-3 max-h-40 overflow-y-auto">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {Object.entries(colorMappings).slice(0, 15).map(([code, name]) => (
                      <div key={code} className="flex justify-between">
                        <span className="font-medium">{code}:</span>
                        <span className="text-gray-700">{name}</span>
                      </div>
                    ))}
                  </div>
                  {Object.keys(colorMappings).length > 15 && (
                    <p className="text-gray-500 mt-2 text-center">... en {Object.keys(colorMappings).length - 15} meer</p>
                  )}
                </div>
              </div>
            )}
            */}

            {debugText && (
              <div className="mb-6">
                <div className="bg-red-50 border border-red-200 rounded p-4 mb-4">
                  <h3 className="text-red-800 font-bold text-gray-900 mb-2">❌ Geen producten gevonden - Debug Output</h3>
                  <p className="text-sm text-red-700 mb-3">
                    De PDF kon niet correct worden geparsed. Hieronder staat de eerste 2000 karakters van de geëxtraheerde tekst.
                    Dit helpt om te begrijpen hoe de PDF tekst wordt geëxtraheerd.
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
                      ✅ Conversie geslaagd: {productCount} product varianten geëxtraheerd
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
                    <li>Selecteer &quot;Play UP&quot; als leverancier</li>
                    <li>Upload dit CSV bestand</li>
                    <li>Log in met Play UP website credentials om prijzen op te halen</li>
                    <li><strong>Voor afbeeldingen:</strong> Gebruik <Link href="/playup-csv-merger" className="underline font-bold">CSV Merger Tool</Link> om image import CSV te maken</li>
                  </ol>
                </div>
              </>
            )}

            <div className="mt-8 grid grid-cols-2 gap-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                <h4 className="font-bold text-yellow-800 text-gray-900 mb-2">ℹ️ Factuur PDF Formaat:</h4>
                <p className="text-sm text-yellow-700 mb-2">
                  De factuur PDF moet dit formaat hebben:
                </p>
                <pre className="text-xs bg-white p-3 rounded overflow-x-auto font-mono">
{`Artigo   Cor      Descrição                    
1AR11002 P6179    RIB LS T-SHIRT - 100% OGCO
                  6110 20 91 - (24M - 36M)
                  6111 20 90 - (3M - 18M)
1 1 1 1 1 1 6 12.3900 74.34`}
                </pre>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-4">
                <h4 className="font-bold text-blue-800 text-gray-900 mb-2">🎨 Color Palette PDF:</h4>
                <p className="text-sm text-blue-700 mb-2">
                  Upload het AW25 Color Palette PDF om kleurcodes te mappen:
                </p>
                <pre className="text-xs bg-white p-3 rounded overflow-x-auto font-mono">
{`WATERCOLOR
P6179

BEEWAX
P0084`}
                </pre>
                <p className="text-xs text-blue-700 mt-2">
                  Dit helpt bij het vinden van product afbeeldingen later.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

