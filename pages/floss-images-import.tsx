import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

interface FlossImage {
  file: File;
  filename: string;
  styleNo: string;
  styleName: string;
  color: string;
  imageType: string; // "Main", "Extra 0", "Extra 1", etc.
  base64?: string;
}

interface OdooProduct {
  templateId: number;
  name: string;
  reference: string;
  hasImages: boolean;
  imageCount: number;
}

interface ProductGroup {
  styleNo: string;
  images: FlossImage[];
  odooProduct?: OdooProduct;
  selected: boolean;
  uploaded: boolean;
}

interface UploadResult {
  styleNo: string;
  success: boolean;
  imagesUploaded: number;
  error?: string;
}

const ODOO_URL = '/api/floss-search-products';

export default function FlossImagesImport() {
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [folderName, setFolderName] = useState('');

  const getCredentials = () => {
    const uid = localStorage.getItem('odoo_uid');
    const password = localStorage.getItem('odoo_pass');
    return { uid, password };
  };

  const parseFilename = (filename: string): { styleNo: string; styleName: string; color: string; imageType: string } | null => {
    // Format: "F10841 - Robin Dress - Blue-tangerine Stripe - Main.jpg"
    const parts = filename.replace(/\.[^.]+$/, '').split(' - ');
    if (parts.length < 4) return null;

    const styleNoMatch = parts[0].match(/^(F\d+)/);
    if (!styleNoMatch) return null;

    return {
      styleNo: styleNoMatch[1],
      styleName: parts[1]?.trim() || '',
      color: parts[2]?.trim() || '',
      imageType: parts[3]?.trim() || 'Extra',
    };
  };

  const handleFolderUpload = (files: FileList) => {
    const imageFiles = Array.from(files).filter(f =>
      /\.(jpg|jpeg|png)$/i.test(f.name) && /^F\d+\s*-/.test(f.name)
    );

    if (imageFiles.length === 0) {
      alert('Geen geldige Flöss afbeeldingen gevonden.\nVerwacht formaat: F10841 - Robin Dress - Blue-tangerine Stripe - Main.jpg');
      return;
    }

    // Extract folder name from path
    const firstFile = imageFiles[0];
    const pathParts = firstFile.webkitRelativePath?.split('/') || [];
    setFolderName(pathParts.length > 1 ? pathParts[0] : 'Geselecteerde bestanden');

    // Group by Style No
    const groups: Record<string, ProductGroup> = {};

    for (const file of imageFiles) {
      const parsed = parseFilename(file.name);
      if (!parsed) continue;

      if (!groups[parsed.styleNo]) {
        groups[parsed.styleNo] = {
          styleNo: parsed.styleNo,
          images: [],
          selected: true,
          uploaded: false,
        };
      }

      groups[parsed.styleNo].images.push({
        file,
        filename: file.name,
        styleNo: parsed.styleNo,
        styleName: parsed.styleName,
        color: parsed.color,
        imageType: parsed.imageType,
      });
    }

    // Sort images: Main first, then Extra by number
    for (const group of Object.values(groups)) {
      group.images.sort((a, b) => {
        const aMain = a.imageType === 'Main' ? 0 : 1;
        const bMain = b.imageType === 'Main' ? 0 : 1;
        if (aMain !== bMain) return aMain - bMain;
        return a.imageType.localeCompare(b.imageType);
      });
    }

    const sortedGroups = Object.values(groups).sort((a, b) => a.styleNo.localeCompare(b.styleNo));
    setProductGroups(sortedGroups);
    setCurrentStep(2);
  };

  const searchOdooProducts = async () => {
    const { uid, password } = getCredentials();
    if (!uid || !password) {
      alert('Geen Odoo credentials gevonden. Log eerst in via de product import pagina.');
      return;
    }

    setLoading(true);
    try {
      const styleNos = productGroups.map(g => g.styleNo);

      const response = await fetch(ODOO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ styleNos, uid, password }),
      });

      const data = await response.json();

      if (data.success) {
        setProductGroups(prev =>
          prev.map(group => {
            const odooProduct = data.products[group.styleNo];
            return { ...group, odooProduct: odooProduct || undefined };
          })
        );
      } else {
        alert(`Fout bij zoeken: ${data.error}`);
      }
    } catch (error) {
      alert(`Fout: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const uploadImages = async () => {
    const { uid, password } = getCredentials();
    if (!uid || !password) {
      alert('Geen Odoo credentials gevonden.');
      return;
    }

    const selectedGroups = productGroups.filter(g => g.selected && g.odooProduct);
    if (selectedGroups.length === 0) {
      alert('Geen producten geselecteerd of geen Odoo matches gevonden.');
      return;
    }

    setLoading(true);
    const results: UploadResult[] = [];

    try {
      // Build styleNo to templateId mapping
      const styleNoToTemplateId: Record<string, number> = {};
      for (const group of selectedGroups) {
        if (group.odooProduct) {
          styleNoToTemplateId[group.styleNo] = group.odooProduct.templateId;
        }
      }

      // Read all images as base64
      const allImages: Array<{ base64: string; filename: string; styleNo: string }> = [];
      for (const group of selectedGroups) {
        for (const img of group.images) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(img.file);
          });
          allImages.push({ base64, filename: img.filename, styleNo: img.styleNo });
        }
      }

      // Upload in batches of 2
      const BATCH_SIZE = 2;
      let totalUploaded = 0;

      for (let i = 0; i < allImages.length; i += BATCH_SIZE) {
        const batch = allImages.slice(i, i + BATCH_SIZE);

        const response = await fetch('/api/floss-upload-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images: batch,
            styleNoToTemplateId,
            odooUid: uid,
            odooPassword: password,
          }),
        });

        const result = await response.json();
        if (result.success) {
          totalUploaded += result.imagesUploaded;
        }
      }

      // Build per-product results
      for (const group of selectedGroups) {
        results.push({
          styleNo: group.styleNo,
          success: true,
          imagesUploaded: group.images.length,
        });
      }

      setUploadResults(results);
      setProductGroups(prev =>
        prev.map(g => selectedGroups.includes(g) ? { ...g, uploaded: true } : g)
      );
      setCurrentStep(3);

      alert(`✅ ${totalUploaded} afbeeldingen geüpload voor ${selectedGroups.length} producten!`);
    } catch (error) {
      alert(`Fout bij uploaden: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const matchedCount = productGroups.filter(g => g.odooProduct).length;
  const selectedCount = productGroups.filter(g => g.selected && g.odooProduct).length;
  const totalImages = productGroups.filter(g => g.selected && g.odooProduct).reduce((sum, g) => sum + g.images.length, 0);

  return (
    <>
      <Head>
        <title>Flöss - Afbeeldingen Importeren</title>
      </Head>

      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">🌸 Flöss - Afbeeldingen Importeren</h1>
              <p className="text-gray-600 mt-1">Upload productafbeeldingen naar Odoo voor bestaande Flöss producten</p>
            </div>
            <Link href="/product-import" className="text-blue-600 hover:text-blue-800 font-medium">
              ← Terug naar Product Import
            </Link>
          </div>

          {/* Steps */}
          <div className="flex gap-4 mb-8">
            {['Afbeeldingen selecteren', 'Controleren & Matchen', 'Uploaden'].map((step, idx) => (
              <div key={idx} className={`flex-1 p-3 rounded-lg text-center font-medium ${
                currentStep === idx + 1 ? 'bg-purple-600 text-white' :
                currentStep > idx + 1 ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-500'
              }`}>
                {currentStep > idx + 1 ? '✅ ' : ''}{idx + 1}. {step}
              </div>
            ))}
          </div>

          {/* Step 1: Select Images */}
          {currentStep === 1 && (
            <div className="bg-white rounded-lg shadow p-8">
              <h2 className="text-xl font-bold mb-4">📁 Selecteer Flöss afbeeldingen</h2>
              <p className="text-gray-600 mb-6">
                Upload de afbeeldingen map van je Flöss order. Bestandsnamen moeten het formaat volgen:
                <code className="bg-gray-100 px-2 py-1 rounded ml-1">F10841 - Robin Dress - Blue-tangerine Stripe - Main.jpg</code>
              </p>

              <div className="grid grid-cols-2 gap-6">
                {/* Folder upload */}
                <div className="border-2 border-dashed border-purple-300 rounded-lg p-8 text-center hover:border-purple-500 transition-colors">
                  <div className="text-5xl mb-4">📁</div>
                  <h3 className="font-bold text-lg mb-2">Upload Map</h3>
                  <p className="text-sm text-gray-500 mb-4">Selecteer de hele Order-Images map</p>
                  <input
                    type="file"
                    {...{ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
                    onChange={(e) => e.target.files && handleFolderUpload(e.target.files)}
                    className="hidden"
                    id="floss-img-folder"
                  />
                  <label htmlFor="floss-img-folder" className="bg-purple-600 text-white px-6 py-3 rounded-lg cursor-pointer hover:bg-purple-700 font-bold inline-block">
                    📁 Selecteer Map
                  </label>
                </div>

                {/* File upload */}
                <div className="border-2 border-dashed border-purple-300 rounded-lg p-8 text-center hover:border-purple-500 transition-colors">
                  <div className="text-5xl mb-4">🖼️</div>
                  <h3 className="font-bold text-lg mb-2">Upload Bestanden</h3>
                  <p className="text-sm text-gray-500 mb-4">Of selecteer individuele afbeeldingen</p>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => e.target.files && handleFolderUpload(e.target.files)}
                    className="hidden"
                    id="floss-img-files"
                  />
                  <label htmlFor="floss-img-files" className="bg-purple-600 text-white px-6 py-3 rounded-lg cursor-pointer hover:bg-purple-700 font-bold inline-block">
                    🖼️ Selecteer Bestanden
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Review & Match */}
          {currentStep === 2 && (
            <div className="bg-white rounded-lg shadow p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold">🔍 Controleren & Matchen</h2>
                  <p className="text-gray-600 mt-1">
                    {folderName}: {productGroups.length} producten, {productGroups.reduce((s, g) => s + g.images.length, 0)} afbeeldingen
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                  >
                    ← Terug
                  </button>
                  <button
                    onClick={searchOdooProducts}
                    disabled={loading}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
                  >
                    {loading ? '⏳ Zoeken...' : '🔍 Zoek in Odoo'}
                  </button>
                </div>
              </div>

              {matchedCount > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <p className="text-green-800 font-medium">
                    ✅ {matchedCount}/{productGroups.length} producten gevonden in Odoo
                    ({productGroups.length - matchedCount > 0 ? `${productGroups.length - matchedCount} niet gevonden` : 'allemaal gematcht!'})
                  </p>
                  <button
                    onClick={uploadImages}
                    disabled={loading || selectedCount === 0}
                    className="mt-3 bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-bold text-lg"
                  >
                    {loading ? '⏳ Uploaden...' : `🚀 Upload ${totalImages} afbeeldingen voor ${selectedCount} producten`}
                  </button>
                </div>
              )}

              {/* Product table */}
              <div className="overflow-y-auto max-h-[600px] border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="p-3 text-left w-8">
                        <input
                          type="checkbox"
                          checked={productGroups.every(g => g.selected)}
                          onChange={(e) => setProductGroups(prev => prev.map(g => ({ ...g, selected: e.target.checked })))}
                        />
                      </th>
                      <th className="p-3 text-left">Style No</th>
                      <th className="p-3 text-left">Product</th>
                      <th className="p-3 text-left">Kleuren</th>
                      <th className="p-3 text-center">Afbeeldingen</th>
                      <th className="p-3 text-left">Odoo Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productGroups.map(group => {
                      const colors = [...new Set(group.images.map(i => i.color))];
                      const mainCount = group.images.filter(i => i.imageType === 'Main').length;
                      const extraCount = group.images.length - mainCount;

                      return (
                        <tr key={group.styleNo} className={`border-b hover:bg-gray-50 ${group.uploaded ? 'bg-green-50' : ''}`}>
                          <td className="p-3">
                            <input
                              type="checkbox"
                              checked={group.selected}
                              onChange={(e) => setProductGroups(prev =>
                                prev.map(g => g.styleNo === group.styleNo ? { ...g, selected: e.target.checked } : g)
                              )}
                            />
                          </td>
                          <td className="p-3 font-mono font-bold">{group.styleNo}</td>
                          <td className="p-3">
                            <div className="font-medium">{group.images[0]?.styleName}</div>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {colors.map(c => (
                                <span key={c} className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-xs">{c}</span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <span className="font-bold">{group.images.length}</span>
                            <span className="text-gray-500 text-xs ml-1">({mainCount} main, {extraCount} extra)</span>
                          </td>
                          <td className="p-3">
                            {group.uploaded ? (
                              <span className="text-green-600 font-medium">✅ Geüpload</span>
                            ) : group.odooProduct ? (
                              <div>
                                <span className="text-green-600 font-medium">✅ Gevonden</span>
                                <div className="text-xs text-gray-500 truncate max-w-[200px]">{group.odooProduct.name}</div>
                                {group.odooProduct.imageCount > 0 && (
                                  <span className="text-xs text-orange-600">⚠️ {group.odooProduct.imageCount} bestaande afbeeldingen</span>
                                )}
                              </div>
                            ) : matchedCount > 0 ? (
                              <span className="text-red-600 font-medium">❌ Niet gevonden</span>
                            ) : (
                              <span className="text-gray-400">⏳ Klik &quot;Zoek in Odoo&quot;</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 3: Results */}
          {currentStep === 3 && (
            <div className="bg-white rounded-lg shadow p-8">
              <h2 className="text-xl font-bold mb-4">✅ Upload Compleet</h2>
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
                <p className="text-green-800 text-lg font-bold">
                  {uploadResults.filter(r => r.success).length} producten succesvol geüpload!
                </p>
                <p className="text-green-700 mt-1">
                  Totaal: {uploadResults.reduce((s, r) => s + r.imagesUploaded, 0)} afbeeldingen
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => { setCurrentStep(1); setProductGroups([]); setUploadResults([]); }}
                  className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 font-medium"
                >
                  🔄 Nieuwe Upload
                </button>
                <Link href="/product-import" className="bg-gray-200 text-gray-800 px-6 py-3 rounded-lg hover:bg-gray-300 font-medium inline-block">
                  ← Terug naar Product Import
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
