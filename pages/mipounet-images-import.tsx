import { useState, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';

interface ImageFile {
  filename: string;
  previewUrl: string;
  file: File;
  extractedRef: string; // "model.color" e.g. "1310.02"
  suffix: string; // "FRONT", "BACK", "ZOOM", etc.
}

interface ProductGroup {
  reference: string; // "1310.02"
  images: ImageFile[];
  odooTemplateId?: number;
  odooProductName?: string;
  odooHasImages: boolean;
  odooImageCount: number;
  selected: boolean;
  uploaded: boolean;
}

interface UploadResult {
  reference: string;
  productName: string;
  success: boolean;
  imagesUploaded: number;
  error?: string;
}

// Parse Mipounet image filename: MV26.{model}.{fabric}.{color}[_FRONT|_BACK|...].jpg
// Handles spaces in filenames and various suffix patterns
function parseImageFilename(filename: string): { ref: string; suffix: string } | null {
  const clean = filename.replace(/\s+/g, '');
  const base = clean.replace(/\.(jpg|jpeg|png|webp)$/i, '');
  // MV26.{model}.{fabricCode}.{color}[_suffix] or MV26.{model}.{fabricCode}.{color}
  const match = base.match(/^MV26\.(\d+)\.[A-Z]+\d+\.(\d+)(?:[_.-](.+))?$/i);
  if (!match) return null;
  return {
    ref: `${match[1]}.${match[2]}`,
    suffix: (match[3] || '').toUpperCase(),
  };
}

export default function MipounetImagesImport() {
  const [allImages, setAllImages] = useState<ImageFile[]>([]);
  const [folderName, setFolderName] = useState('');
  const [products, setProducts] = useState<ProductGroup[]>([]);
  const [, setUnmatchedImages] = useState<ImageFile[]>([]);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'with-images' | 'existing-odoo'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showExistingWarning, setShowExistingWarning] = useState(true);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const addPhotoRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const getCredentials = () => {
    const uid = localStorage.getItem('odoo_uid');
    const password = localStorage.getItem('odoo_pass');
    return { uid, password };
  };

  // ============================================
  // FOLDER SELECTION & IMAGE PARSING
  // ============================================
  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const firstFile = files[0];
    const pathParts = firstFile.webkitRelativePath?.split('/') || [];
    setFolderName(pathParts[0] || 'Selected folder');

    const imageFiles = files.filter(f =>
      f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(f.name)
    );

    const parsed: ImageFile[] = [];
    for (const file of imageFiles) {
      const info = parseImageFilename(file.name);
      if (!info) continue;
      parsed.push({
        filename: file.name,
        previewUrl: URL.createObjectURL(file),
        file,
        extractedRef: info.ref,
        suffix: info.suffix,
      });
    }

    // Sort: FRONT first, then BACK, then rest; within same ref alphabetically
    const suffixOrder = (s: string) => {
      if (s.includes('FRONT')) return 0;
      if (s.includes('BACK')) return 1;
      if (s.includes('ZOOM')) return 2;
      return 3;
    };
    parsed.sort((a, b) => {
      const refCmp = a.extractedRef.localeCompare(b.extractedRef);
      if (refCmp !== 0) return refCmp;
      return suffixOrder(a.suffix) - suffixOrder(b.suffix);
    });

    setAllImages(parsed);
    console.log(`🇪🇸 Found ${parsed.length} Mipounet images (out of ${imageFiles.length} total)`);
  };

  // ============================================
  // MATCHING LOGIC (group images → check Odoo)
  // ============================================
  const performMatching = async () => {
    if (allImages.length === 0) {
      alert('Selecteer eerst een map met afbeeldingen');
      return;
    }

    setLoading(true);
    const { uid, password } = getCredentials();

    // Group images by reference
    const groups = new Map<string, ImageFile[]>();
    for (const img of allImages) {
      const existing = groups.get(img.extractedRef) || [];
      existing.push(img);
      groups.set(img.extractedRef, existing);
    }

    const matched: ProductGroup[] = [];

    for (const [ref, images] of groups.entries()) {
      let odooHasImages = false;
      let odooImageCount = 0;
      let odooTemplateId: number | undefined;
      let odooProductName: string | undefined;

      if (uid && password) {
        try {
          const resp = await fetch('/api/search-mipounet-products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reference: ref, uid, password }),
          });
          const data = await resp.json();
          if (data.found && data.products.length > 0) {
            const best = data.products[0];
            odooTemplateId = best.templateId;
            odooProductName = best.name;
            odooHasImages = best.hasImages || false;
            odooImageCount = best.imageCount || 0;
          }
        } catch (err) {
          console.error(`Error checking Odoo for ${ref}:`, err);
        }
      }

      matched.push({
        reference: ref,
        images,
        odooTemplateId,
        odooProductName,
        odooHasImages,
        odooImageCount,
        selected: !!odooTemplateId && !odooHasImages,
        uploaded: false,
      });
    }

    // Sort: products found in Odoo first, then by reference
    matched.sort((a, b) => {
      if (a.odooTemplateId && !b.odooTemplateId) return -1;
      if (!a.odooTemplateId && b.odooTemplateId) return 1;
      return a.reference.localeCompare(b.reference);
    });

    setProducts(matched);
    setUnmatchedImages(allImages.filter(img => !groups.has(img.extractedRef)));
    setLoading(false);
    setCurrentStep(2);

    const inOdoo = matched.filter(p => p.odooTemplateId).length;
    const notInOdoo = matched.filter(p => !p.odooTemplateId).length;
    const withExisting = matched.filter(p => p.odooHasImages).length;
    console.log(`✅ ${matched.length} productgroepen: ${inOdoo} in Odoo, ${notInOdoo} niet gevonden, ${withExisting} hebben al afbeeldingen`);
  };

  // ============================================
  // SELECTION HELPERS
  // ============================================
  const toggleSelection = (ref: string) => {
    setProducts(prev => prev.map(p =>
      p.reference === ref ? { ...p, selected: !p.selected } : p
    ));
  };

  const selectAll = () => {
    setProducts(prev => prev.map(p => ({
      ...p,
      selected: !!p.odooTemplateId && !p.uploaded,
    })));
  };

  const deselectAll = () => {
    setProducts(prev => prev.map(p => ({ ...p, selected: false })));
  };

  // ============================================
  // IMAGE MANIPULATION
  // ============================================
  const addImageToProduct = (ref: string, file: File) => {
    const info = parseImageFilename(file.name);
    const newImg: ImageFile = {
      filename: file.name,
      previewUrl: URL.createObjectURL(file),
      file,
      extractedRef: info?.ref || ref,
      suffix: info?.suffix || '',
    };
    setProducts(prev => prev.map(p =>
      p.reference === ref ? { ...p, images: [...p.images, newImg], selected: true } : p
    ));
  };

  const removeImage = (ref: string, filename: string) => {
    setProducts(prev => prev.map(p =>
      p.reference === ref ? { ...p, images: p.images.filter(i => i.filename !== filename) } : p
    ));
  };

  const moveImage = (ref: string, from: number, to: number) => {
    setProducts(prev => prev.map(p => {
      if (p.reference !== ref) return p;
      const imgs = [...p.images];
      const [removed] = imgs.splice(from, 1);
      imgs.splice(to, 0, removed);
      return { ...p, images: imgs };
    }));
  };

  // ============================================
  // UPLOAD TO ODOO
  // ============================================
  const uploadImages = async () => {
    const { uid, password } = getCredentials();
    if (!uid || !password) {
      alert('Odoo credentials niet gevonden. Log eerst in via Product Import.');
      return;
    }

    const toUpload = products.filter(p => p.selected && p.images.length > 0 && !p.uploaded && p.odooTemplateId);
    if (toUpload.length === 0) {
      alert('Selecteer eerst producten om te uploaden');
      return;
    }

    const withExisting = toUpload.filter(p => p.odooHasImages);
    if (withExisting.length > 0) {
      const ok = window.confirm(
        `${withExisting.length} van de ${toUpload.length} producten hebben al afbeeldingen in Odoo.\n\nDeze worden OVERSCHREVEN!\n\nDoorgaan?`
      );
      if (!ok) return;
    }

    setLoading(true);
    const results: UploadResult[] = [];

    for (const product of toUpload) {
      try {
        let imagesUploaded = 0;

        for (let i = 0; i < product.images.length; i++) {
          const img = product.images[i];
          const buffer = await img.file.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );

          const imageName = `Mipounet ${product.reference} - ${i + 1}`;

          const resp = await fetch('/api/upload-single-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              templateId: product.odooTemplateId,
              base64Image: base64,
              imageName,
              sequence: i + 1,
              isMainImage: i === 0,
              odooUid: uid,
              odooPassword: password,
            }),
          });

          const data = await resp.json();
          if (data.success) imagesUploaded++;
        }

        results.push({
          reference: product.reference,
          productName: product.odooProductName || product.reference,
          success: true,
          imagesUploaded,
        });
      } catch (error) {
        results.push({
          reference: product.reference,
          productName: product.odooProductName || product.reference,
          success: false,
          imagesUploaded: 0,
          error: String(error),
        });
      }
    }

    const successRefs = results.filter(r => r.success).map(r => r.reference);
    setProducts(prev => prev.map(p =>
      successRefs.includes(p.reference) ? { ...p, selected: false, uploaded: true } : p
    ));

    setUploadResults(results);
    setLoading(false);
    setCurrentStep(3);

    const total = results.reduce((s, r) => s + r.imagesUploaded, 0);
    alert(`${total} afbeeldingen geupload voor ${results.filter(r => r.success).length} producten`);
  };

  // ============================================
  // FILTERING & STATS
  // ============================================
  const filtered = products.filter(p => {
    if (filterMode === 'with-images' && p.images.length === 0) return false;
    if (filterMode === 'existing-odoo' && !p.odooHasImages) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return p.reference.includes(q) ||
        (p.odooProductName || '').toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    total: products.length,
    inOdoo: products.filter(p => p.odooTemplateId).length,
    notInOdoo: products.filter(p => !p.odooTemplateId).length,
    existingImages: products.filter(p => p.odooHasImages).length,
    selected: products.filter(p => p.selected && !p.uploaded && p.odooTemplateId).length,
    uploaded: products.filter(p => p.uploaded).length,
    totalImages: products.reduce((s, p) => s + p.images.length, 0),
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <>
      <Head>
        <title>Mipounet - Afbeeldingen Import</title>
      </Head>

      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-4xl">🇪🇸</span>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Mipounet - Afbeeldingen Import</h1>
                  <p className="text-gray-600">Upload afbeeldingen uit de SILHOUETTES map naar Odoo</p>
                </div>
              </div>
              <Link
                href="/product-import"
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                &larr; Terug naar Product Import
              </Link>
            </div>
          </div>

          {/* Step 1: Folder Selection */}
          {currentStep === 1 && (
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-6">Stap 1: Selecteer Afbeeldingen Map</h2>

              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
                <p className="text-sm font-medium text-orange-900 mb-2">Mipounet Image Matching</p>
                <p className="text-xs text-orange-800">
                  Afbeeldingen worden automatisch gematcht op basis van de bestandsnaam: <strong>MV26.model.stof.kleur</strong>
                </p>
                <p className="text-xs text-orange-700 mt-1">
                  Voorbeeld: <code className="bg-white px-1 rounded">MV26.<strong>1310</strong>.SAR004.<strong>02</strong>_FRONT.jpg</code>
                  &rarr; Product referentie <strong>1310.02</strong>
                </p>
                <p className="text-xs text-orange-700 mt-1">
                  FRONT foto&apos;s worden als eerste (hoofd)afbeelding ingesteld. BACK/ZOOM als extra foto&apos;s.
                </p>
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-orange-400 transition-colors">
                <input
                  ref={folderInputRef}
                  type="file"
                  // @ts-ignore - webkitdirectory is not in types
                  webkitdirectory=""
                  directory=""
                  multiple
                  onChange={handleFolderSelect}
                  className="hidden"
                />
                <button
                  onClick={() => folderInputRef.current?.click()}
                  className="w-full"
                >
                  <div className="text-5xl mb-3">📁</div>
                  <div className="font-medium text-gray-900 text-lg">
                    {folderName || 'Klik om de SILHOUETTES map te selecteren'}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">Selecteer de map met MV26.*.jpg bestanden</p>
                  {allImages.length > 0 && (
                    <div className="text-sm text-green-600 mt-3 font-bold">
                      {allImages.length} Mipounet afbeeldingen gevonden
                    </div>
                  )}
                </button>
              </div>

              {/* Match Button */}
              <div className="mt-6 flex justify-center">
                <button
                  onClick={performMatching}
                  disabled={allImages.length === 0 || loading}
                  className={`px-8 py-3 rounded-lg font-bold text-lg ${
                    allImages.length > 0 && !loading
                      ? 'bg-orange-500 text-white hover:bg-orange-600'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {loading ? 'Matchen & Odoo checken...' : 'Match Afbeeldingen met Odoo Producten'}
                </button>
              </div>

              {loading && (
                <div className="mt-4 text-center text-gray-600 animate-pulse">
                  Producten opzoeken in Odoo en afbeeldingen controleren...
                </div>
              )}

              {/* Preview */}
              {allImages.length > 0 && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-bold mb-2">Preview (eerste 12 afbeeldingen)</h3>
                  <div className="grid grid-cols-6 gap-2">
                    {allImages.slice(0, 12).map(img => (
                      <div key={img.filename} className="text-center">
                        <div className="w-full aspect-square relative rounded overflow-hidden border">
                          <Image src={img.previewUrl} alt={img.filename} fill className="object-cover" />
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1 truncate">{img.extractedRef}</div>
                        <div className="text-[10px] text-blue-500">{img.suffix || 'geen suffix'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Review & Edit */}
          {currentStep === 2 && (
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-4">Stap 2: Controleer en Upload</h2>

              {/* Stats */}
              <div className="grid grid-cols-6 gap-2 mb-4">
                <div className="bg-blue-50 rounded p-3 text-center">
                  <div className="text-xl font-bold text-blue-600">{stats.total}</div>
                  <div className="text-xs text-gray-600">Productgroepen</div>
                </div>
                <div className="bg-green-50 rounded p-3 text-center">
                  <div className="text-xl font-bold text-green-600">{stats.inOdoo}</div>
                  <div className="text-xs text-gray-600">In Odoo</div>
                </div>
                <div className="bg-yellow-50 rounded p-3 text-center">
                  <div className="text-xl font-bold text-yellow-600">{stats.notInOdoo}</div>
                  <div className="text-xs text-gray-600">Niet in Odoo</div>
                </div>
                <div className="bg-red-50 rounded p-3 text-center border border-red-200">
                  <div className="text-xl font-bold text-red-600">{stats.existingImages}</div>
                  <div className="text-xs text-gray-600">Heeft al foto&apos;s</div>
                </div>
                <div className="bg-green-50 rounded p-3 text-center border-2 border-green-300">
                  <div className="text-xl font-bold text-green-600">{stats.selected}</div>
                  <div className="text-xs text-gray-600">Geselecteerd</div>
                </div>
                <div className="bg-emerald-50 rounded p-3 text-center">
                  <div className="text-xl font-bold text-emerald-600">{stats.uploaded}</div>
                  <div className="text-xs text-gray-600">Ge&uuml;pload</div>
                </div>
              </div>

              {/* Warning */}
              {stats.existingImages > 0 && showExistingWarning && (
                <div className="bg-red-50 border border-red-300 rounded-lg p-4 mb-4 flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">&#9888;&#65039;</span>
                    <div>
                      <div className="font-bold text-red-800">
                        {stats.existingImages} producten hebben al afbeeldingen in Odoo
                      </div>
                      <div className="text-sm text-red-700 mt-1">
                        Automatisch gedeselecteerd. Selecteer handmatig als je wilt overschrijven.
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setShowExistingWarning(false)} className="text-red-400 hover:text-red-600">&times;</button>
                </div>
              )}

              {/* Filters */}
              <div className="flex items-center justify-between mb-4 bg-gray-50 p-3 rounded">
                <div className="flex items-center gap-4">
                  <select
                    value={filterMode}
                    onChange={(e) => setFilterMode(e.target.value as typeof filterMode)}
                    className="border rounded px-3 py-1"
                  >
                    <option value="all">Alle ({stats.total})</option>
                    <option value="with-images">In Odoo ({stats.inOdoo})</option>
                    <option value="existing-odoo">Heeft al foto&apos;s ({stats.existingImages})</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Zoek op referentie of naam..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="border rounded px-3 py-1 w-64"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={selectAll} className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200">
                    Selecteer alle
                  </button>
                  <button onClick={deselectAll} className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                    Deselecteer alle
                  </button>
                </div>
              </div>

              {/* Products List */}
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {filtered.map(product => (
                  <div
                    key={product.reference}
                    className={`border rounded-lg p-4 transition-all ${
                      product.uploaded
                        ? 'border-emerald-400 bg-emerald-50/50'
                        : !product.odooTemplateId
                          ? 'border-yellow-300 bg-yellow-50/30 opacity-60'
                          : product.odooHasImages
                            ? 'border-red-300 bg-red-50/30'
                            : product.selected
                              ? 'border-green-400 bg-green-50/30'
                              : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex items-center justify-center w-6 h-6 mt-1">
                        {product.uploaded ? (
                          <span className="text-emerald-600 text-lg">&#10003;</span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={product.selected}
                            onChange={() => toggleSelection(product.reference)}
                            disabled={!product.odooTemplateId}
                            className="w-5 h-5 rounded border-gray-300 text-green-500 focus:ring-green-500 cursor-pointer disabled:opacity-50"
                          />
                        )}
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {product.uploaded && (
                            <span className="bg-emerald-500 text-white px-2 py-0.5 rounded text-xs font-bold">GEUPLOAD</span>
                          )}
                          {product.odooHasImages && !product.uploaded && (
                            <span className="bg-red-500 text-white px-2 py-0.5 rounded text-xs font-bold">
                              {product.odooImageCount} IN ODOO
                            </span>
                          )}
                          {!product.odooTemplateId && (
                            <span className="bg-yellow-500 text-white px-2 py-0.5 rounded text-xs font-bold">NIET IN ODOO</span>
                          )}
                          <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded text-sm font-mono font-bold">
                            {product.reference}
                          </span>
                        </div>
                        <div className="font-medium text-gray-900">
                          {product.odooProductName || `Referentie ${product.reference}`}
                        </div>
                      </div>

                      <div className={`px-3 py-1 rounded text-sm font-bold ${
                        product.images.length > 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {product.images.length} foto{product.images.length !== 1 ? "'s" : ''}
                      </div>

                      <div>
                        <input
                          ref={el => { addPhotoRefs.current[product.reference] = el; }}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            Array.from(e.target.files || []).forEach(f => addImageToProduct(product.reference, f));
                            e.target.value = '';
                          }}
                        />
                        <button
                          onClick={() => addPhotoRefs.current[product.reference]?.click()}
                          className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                        >
                          + Foto
                        </button>
                      </div>
                    </div>

                    {/* Images */}
                    {product.images.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3 pl-10">
                        {product.images.map((img, idx) => (
                          <div key={`${product.reference}-${img.filename}`} className="relative group">
                            <div className="w-20 h-20 relative rounded overflow-hidden border-2 border-gray-200">
                              <Image src={img.previewUrl} alt={img.filename} fill className="object-cover" />
                            </div>
                            <button
                              onClick={() => removeImage(product.reference, img.filename)}
                              className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              &times;
                            </button>
                            <div className="absolute bottom-1 left-1 right-1 flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {idx > 0 && (
                                <button onClick={() => moveImage(product.reference, idx, idx - 1)} className="w-5 h-5 bg-white/80 rounded text-xs">&#9664;</button>
                              )}
                              {idx < product.images.length - 1 && (
                                <button onClick={() => moveImage(product.reference, idx, idx + 1)} className="w-5 h-5 bg-white/80 rounded text-xs">&#9654;</button>
                              )}
                            </div>
                            <div className="absolute top-0 left-0 bg-black/60 text-white text-xs px-1 rounded-br">
                              {idx + 1}
                            </div>
                            {img.suffix && (
                              <div className="absolute top-0 right-0 bg-blue-500/80 text-white text-[8px] px-1 rounded-bl">
                                {img.suffix.replace('_FRONT', 'F').replace('_BACK', 'B').replace('_ZOOM', 'Z').substring(0, 5)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between mt-6 pt-4 border-t">
                <button onClick={() => setCurrentStep(1)} className="px-4 py-2 border rounded hover:bg-gray-100">
                  &larr; Terug
                </button>
                <button
                  onClick={uploadImages}
                  disabled={loading || stats.selected === 0}
                  className={`px-6 py-2 rounded font-bold ${
                    stats.selected > 0 ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {loading ? 'Uploaden...' : `Upload ${stats.selected} Producten (${products.filter(p => p.selected && !p.uploaded).reduce((s, p) => s + p.images.length, 0)} foto's)`}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Results */}
          {currentStep === 3 && (
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-4">Stap 3: Resultaten</h2>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-green-600">{uploadResults.filter(r => r.success).length}</div>
                  <div className="text-sm text-gray-600">Succesvol</div>
                </div>
                <div className="bg-red-50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-red-600">{uploadResults.filter(r => !r.success).length}</div>
                  <div className="text-sm text-gray-600">Mislukt</div>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Referentie</th>
                      <th className="p-2 text-left">Product</th>
                      <th className="p-2 text-left">Status</th>
                      <th className="p-2 text-left">Afbeeldingen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadResults.map(r => (
                      <tr key={r.reference} className="border-b">
                        <td className="p-2 font-mono">{r.reference}</td>
                        <td className="p-2">{r.productName}</td>
                        <td className="p-2">
                          {r.success ? <span className="text-green-600">Succes</span> : <span className="text-red-600">{r.error}</span>}
                        </td>
                        <td className="p-2">{r.imagesUploaded}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between mt-6 pt-4 border-t">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setCurrentStep(1);
                      setAllImages([]);
                      setProducts([]);
                      setUnmatchedImages([]);
                      setUploadResults([]);
                      setFolderName('');
                    }}
                    className="px-6 py-2 border rounded hover:bg-gray-100"
                  >
                    Opnieuw beginnen
                  </button>
                  {stats.inOdoo - stats.uploaded > 0 && (
                    <button
                      onClick={() => { setUploadResults([]); setCurrentStep(2); }}
                      className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      &larr; Terug naar lijst ({stats.inOdoo - stats.uploaded} over)
                    </button>
                  )}
                </div>
                <Link href="/product-import" className="px-6 py-2 bg-green-500 text-white rounded hover:bg-green-600">
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
