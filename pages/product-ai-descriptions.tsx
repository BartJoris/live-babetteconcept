import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import { useAuth } from '@/lib/hooks/useAuth';

interface ProductDescriptionDetail {
  id: number;
  name: string;
  default_code: string | null;
  brand: string | null;
  description_ecommerce: string | null;
  sizeAttribute: string | null;
}

interface Product {
  id: number;
  name: string;
  default_code: string;
  variant_count?: number;
  active: boolean;
}

type Step = 'load' | 'select' | 'generate';

export default function ProductAIDescriptions() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const [currentStep, setCurrentStep] = useState<Step>('load');
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());

  // Generate step: product details and local descriptions
  const [productDetails, setProductDetails] = useState<ProductDescriptionDetail[]>([]);
  const [descriptions, setDescriptions] = useState<Map<number, string>>(new Map());
  const [generatingIds, setGeneratingIds] = useState<Set<number>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());

  // Prompt modal (like product-import)
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [promptCategory, setPromptCategory] = useState<'kinderen' | 'volwassenen'>('kinderen');
  const [customPromptKinderen, setCustomPromptKinderen] = useState('');
  const [customPromptVolwassenen, setCustomPromptVolwassenen] = useState('');
  const [defaultPrompts, setDefaultPrompts] = useState<{
    kinderen: { systemPrompt: string; name: string };
    volwassenen: { systemPrompt: string; name: string };
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && isLoggedIn && !authLoading) {
      fetch('/api/generate-description')
        .then((res) => res.json())
        .then((data) => {
          if (data.prompts) {
            setDefaultPrompts({
              kinderen: data.prompts.kinderen,
              volwassenen: data.prompts.volwassenen,
            });
            setCustomPromptKinderen(data.prompts.kinderen?.systemPrompt ?? '');
            setCustomPromptVolwassenen(data.prompts.volwassenen?.systemPrompt ?? '');
          }
        })
        .catch(() => {});
    }
  }, [mounted, isLoggedIn, authLoading]);

  const fetchProducts = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/product-cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to fetch products');
      setProducts(json.products || []);
      if (json.products?.length > 0) setCurrentStep('select');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch products');
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (mounted && isLoggedIn && !authLoading) fetchProducts();
  }, [mounted, isLoggedIn, authLoading, fetchProducts]);

  useEffect(() => {
    const q = searchQuery.toLowerCase();
    setFilteredProducts(
      products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.default_code && p.default_code.toLowerCase().includes(q))
      )
    );
  }, [searchQuery, products]);

  const toggleProduct = (id: number) => {
    const next = new Set(selectedProducts);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedProducts(next);
  };

  const toggleAll = () => {
    if (selectedProducts.size === filteredProducts.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filteredProducts.map((p) => p.id)));
    }
  };

  const goToGenerate = async () => {
    if (selectedProducts.size === 0) {
      alert('Selecteer minimaal één product.');
      return;
    }
    setDetailsLoading(true);
    try {
      const res = await fetch('/api/product-description-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateIds: Array.from(selectedProducts) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load details');
      const list: ProductDescriptionDetail[] = data.products || [];
      setProductDetails(list);
      const initial = new Map<number, string>();
      list.forEach((p) => {
        if (p.description_ecommerce) initial.set(p.id, p.description_ecommerce);
      });
      setDescriptions(initial);
      setCurrentStep('generate');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fout bij ophalen productdetails');
    } finally {
      setDetailsLoading(false);
    }
  };

  const setDescription = (templateId: number, value: string) => {
    setDescriptions((prev) => {
      const next = new Map(prev);
      next.set(templateId, value);
      return next;
    });
  };

  const generateForProduct = async (p: ProductDescriptionDetail) => {
    setGeneratingIds((prev) => new Set(prev).add(p.id));
    const isVolwassenen = p.sizeAttribute === 'MAAT Volwassenen';
    const customPrompt = isVolwassenen ? customPromptVolwassenen : customPromptKinderen;
    const defaultPrompt = isVolwassenen
      ? defaultPrompts?.volwassenen?.systemPrompt
      : defaultPrompts?.kinderen?.systemPrompt;
    const sendCustomPrompt = customPrompt !== defaultPrompt ? customPrompt : undefined;

    try {
      const res = await fetch('/api/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: {
            name: p.name,
            brand: p.brand ?? undefined,
            description: p.description_ecommerce ?? undefined,
          },
          sizeAttribute: p.sizeAttribute ?? undefined,
          customSystemPrompt: sendCustomPrompt,
        }),
      });
      const data = await res.json();
      if (res.ok && data.description) {
        setDescription(p.id, data.description);
      } else {
        alert(data.error || data.message || 'Genereren mislukt');
      }
    } catch (err) {
      alert('Fout bij genereren. Zie console.');
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(p.id);
        return next;
      });
    }
  };

  const generateAll = async () => {
    for (const p of productDetails) {
      await generateForProduct(p);
      await new Promise((r) => setTimeout(r, 500));
    }
    alert(`✅ Beschrijvingen gegenereerd voor ${productDetails.length} producten.`);
  };

  const saveToOdoo = async (templateId: number, description: string) => {
    setSavingIds((prev) => new Set(prev).add(templateId));
    try {
      const res = await fetch('/api/update-product-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Opslaan mislukt');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Opslaan mislukt');
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(templateId);
        return next;
      });
    }
  };

  const saveAllToOdoo = async () => {
    const toSave = productDetails.filter((p) => {
      const desc = descriptions.get(p.id);
      return desc != null && desc.trim() !== '';
    });
    if (toSave.length === 0) {
      alert('Geen beschrijvingen om op te slaan. Genereer of vul eerst in.');
      return;
    }
    if (!confirm(`${toSave.length} beschrijving(en) opslaan in Odoo?`)) return;
    for (const p of toSave) {
      const desc = descriptions.get(p.id) ?? '';
      await saveToOdoo(p.id, desc);
      await new Promise((r) => setTimeout(r, 200));
    }
    alert(`✅ ${toSave.length} beschrijving(en) opgeslagen.`);
  };

  return (
    <>
      <Head>
        <title>AI Beschrijvingen - Babette</title>
      </Head>

      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">✨ AI Beschrijvingen</h1>
          <p className="text-lg text-gray-800 mb-8">
            Selecteer producten en genereer webshopteksten met AI (zoals bij importeren, o.a. Emile et Ida)
          </p>

          <div className="flex justify-between mb-8 max-w-2xl">
            {(['load', 'select', 'generate'] as Step[]).map((step, idx) => (
              <div key={step} className="flex items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                    currentStep === step
                      ? 'bg-purple-600 text-white'
                      : ['load', 'select', 'generate'].indexOf(currentStep) > idx
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-300 text-gray-700'
                  }`}
                >
                  {idx + 1}
                </div>
                {idx < 2 && <div className="flex-1 h-1 mx-2 bg-gray-300" />}
              </div>
            ))}
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
              <p className="text-red-800 font-medium">❌ {error}</p>
            </div>
          )}

          {currentStep === 'load' && (
            <div className="bg-white rounded-lg shadow p-8 max-w-2xl">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Stap 1: Producten laden</h2>
              <p className="text-gray-800 mb-6">Laad alle producten uit de database om te selecteren.</p>
              <button
                onClick={() => fetchProducts()}
                disabled={loading}
                className="px-8 py-3 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400 font-medium text-lg"
              >
                {loading ? '⏳ Laden...' : '🔍 Producten laden'}
              </button>
            </div>
          )}

          {currentStep === 'select' && (
            <div className="bg-white rounded-lg shadow p-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Stap 2: Selecteer producten</h2>
                <button
                  onClick={() => {
                    setCurrentStep('load');
                    setSelectedProducts(new Set());
                    fetchProducts();
                  }}
                  disabled={loading}
                  className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 font-medium"
                >
                  🔄 Vernieuwen
                </button>
              </div>

              <div className="mb-6">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full border-2 border-gray-300 rounded px-4 py-2 text-gray-900"
                  placeholder="Zoek op naam of referentie..."
                />
                <p className="text-sm text-gray-600 mt-2">
                  {filteredProducts.length} van {products.length} producten | Geselecteerd: {selectedProducts.size}
                </p>
              </div>

              <div className="overflow-x-auto mb-6 max-h-96 overflow-y-auto border border-gray-200 rounded">
                <table className="w-full">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">
                        <input
                          type="checkbox"
                          checked={filteredProducts.length > 0 && selectedProducts.size === filteredProducts.length}
                          onChange={toggleAll}
                          className="cursor-pointer w-4 h-4"
                        />
                      </th>
                      <th className="p-3 text-left font-bold text-gray-900">Product</th>
                      <th className="p-3 text-left font-bold text-gray-900">Referentie</th>
                      <th className="p-3 text-left font-bold text-gray-900">Varianten</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product) => (
                      <tr key={product.id} className="border-b hover:bg-gray-50">
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(product.id)}
                            onChange={() => toggleProduct(product.id)}
                            className="cursor-pointer w-4 h-4"
                          />
                        </td>
                        <td className="p-3 font-medium text-gray-900">{product.name}</td>
                        <td className="p-3 text-gray-700 font-mono text-sm">{product.default_code || '-'}</td>
                        <td className="p-3 text-gray-700">{product.variant_count ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setCurrentStep('load')}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 font-medium"
                >
                  ← Terug
                </button>
                <button
                  onClick={goToGenerate}
                  disabled={selectedProducts.size === 0 || detailsLoading}
                  className="px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 font-medium"
                >
                  {detailsLoading ? '⏳ Laden...' : `Volgende: AI beschrijvingen (${selectedProducts.size}) →`}
                </button>
              </div>
            </div>
          )}

          {currentStep === 'generate' && (
            <div className="bg-white rounded-lg shadow p-8">
              <div className="flex flex-wrap items-center gap-4 mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Stap 3: AI beschrijvingen genereren</h2>
                <button
                  onClick={generateAll}
                  disabled={generatingIds.size > 0}
                  className="px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded hover:from-pink-600 hover:to-purple-700 disabled:opacity-50 font-medium"
                >
                  {generatingIds.size > 0 ? '⏳ Bezig...' : '✨ AI voor alle'}
                </button>
                <button
                  onClick={() => setShowPromptModal(true)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 border border-gray-300 font-medium"
                >
                  📝 Prompts
                </button>
                <button
                  onClick={saveAllToOdoo}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
                >
                  💾 Alles opslaan in Odoo
                </button>
                <button
                  onClick={() => {
                    setCurrentStep('select');
                    setProductDetails([]);
                    setDescriptions(new Map());
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 font-medium"
                >
                  ← Andere producten
                </button>
              </div>

              <div className="space-y-6 max-h-[70vh] overflow-y-auto">
                {productDetails.map((p) => (
                  <div key={p.id} className="border rounded-lg p-4 bg-gray-50/50">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-medium text-gray-900">{p.name}</div>
                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                          <span className="font-mono">{p.default_code || '-'}</span>
                          {p.brand && <span className="bg-gray-200 px-2 py-0.5 rounded">Merk: {p.brand}</span>}
                          {p.sizeAttribute && (
                            <span
                              className={
                                p.sizeAttribute === 'MAAT Volwassenen'
                                  ? 'bg-purple-100 text-purple-700 px-2 py-0.5 rounded'
                                  : 'bg-pink-100 text-pink-700 px-2 py-0.5 rounded'
                              }
                            >
                              {p.sizeAttribute}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => generateForProduct(p)}
                        disabled={generatingIds.has(p.id)}
                        className="px-3 py-1 text-sm bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded hover:from-pink-600 hover:to-purple-700 disabled:opacity-50"
                      >
                        {generatingIds.has(p.id) ? '⏳ Genereren...' : '✨ AI Genereren'}
                      </button>
                    </div>
                    <textarea
                      value={descriptions.get(p.id) ?? ''}
                      onChange={(e) => setDescription(p.id, e.target.value)}
                      placeholder="E-commerce beschrijving..."
                      rows={4}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 bg-white resize-y"
                    />
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={() => saveToOdoo(p.id, descriptions.get(p.id) ?? '')}
                        disabled={savingIds.has(p.id) || !(descriptions.get(p.id)?.trim())}
                        className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        {savingIds.has(p.id) ? '⏳ Opslaan...' : '💾 Opslaan in Odoo'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Prompt modal (same as product-import) */}
      {showPromptModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-pink-500 to-purple-600 text-white p-4 flex justify-between items-center">
              <h3 className="text-xl font-bold">📝 AI Prompt Editor</h3>
              <button onClick={() => setShowPromptModal(false)} className="text-white hover:text-gray-200 text-2xl">
                ×
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setPromptCategory('kinderen')}
                  className={`px-4 py-2 rounded-t-lg font-medium ${
                    promptCategory === 'kinderen' ? 'bg-pink-100 text-pink-700 border-b-2 border-pink-500' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  👶 Baby&apos;s, Kinderen &amp; Tieners
                </button>
                <button
                  onClick={() => setPromptCategory('volwassenen')}
                  className={`px-4 py-2 rounded-t-lg font-medium ${
                    promptCategory === 'volwassenen' ? 'bg-purple-100 text-purple-700 border-b-2 border-purple-500' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  👩 Volwassenen
                </button>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  System prompt {promptCategory === 'kinderen' ? '(Kinderen)' : '(Volwassenen)'}:
                </label>
                <textarea
                  value={promptCategory === 'kinderen' ? customPromptKinderen : customPromptVolwassenen}
                  onChange={(e) =>
                    promptCategory === 'kinderen'
                      ? setCustomPromptKinderen(e.target.value)
                      : setCustomPromptVolwassenen(e.target.value)
                  }
                  rows={12}
                  className="w-full border border-gray-300 rounded px-4 py-3 text-sm text-gray-900 font-mono resize-y"
                />
              </div>
              <div className="flex justify-between items-center">
                <button
                  onClick={() => {
                    if (defaultPrompts) {
                      if (promptCategory === 'kinderen') setCustomPromptKinderen(defaultPrompts.kinderen.systemPrompt);
                      else setCustomPromptVolwassenen(defaultPrompts.volwassenen.systemPrompt);
                    }
                  }}
                  className="text-sm text-gray-600 hover:text-gray-800 underline"
                >
                  🔄 Reset naar standaard
                </button>
              </div>
            </div>
            <div className="border-t p-4 bg-gray-50 flex justify-end">
              <button
                onClick={() => setShowPromptModal(false)}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
