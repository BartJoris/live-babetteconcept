import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Navigation from '@/components/Navigation';
import { useAuth } from '@/lib/hooks/useAuth';

interface Product {
  id: number;
  name: string;
  default_code: string;
  newName: string;
}

export default function FixMinirodiniNames() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ updated: number; total: number } | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch('/api/fix-minirodini-names', { credentials: 'include' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Fout bij ophalen');
      setProducts(json.products);
      setSelected(new Set(json.products.map((p: Product) => p.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Onbekende fout');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) fetchProducts();
  }, [isLoggedIn, fetchProducts]);

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map(p => p.id)));
    }
  };

  const handleFix = async () => {
    const updates = products
      .filter(p => selected.has(p.id))
      .map(p => ({ id: p.id, newName: p.newName }));

    if (updates.length === 0) return;

    setUpdating(true);
    setError(null);
    try {
      const res = await fetch('/api/fix-minirodini-names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ updates }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Fout bij updaten');
      setResults({ updated: json.updated, total: json.total });
      await fetchProducts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Onbekende fout');
    } finally {
      setUpdating(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Fix Mini Rodini Names | Babette Concept</title>
      </Head>
      <Navigation />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            🐼 Mini Rodini — Productnamen corrigeren
          </h1>
          <p className="text-gray-600 mt-1">
            Verwijder het artikelnummer <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">(12345678)</code> uit productnamen in Odoo.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {results && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
            {results.updated}/{results.total} producten succesvol hernoemd.
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-3 text-gray-500 py-12 justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            Producten ophalen uit Odoo...
          </div>
        ) : products.length === 0 ? (
          <div className="bg-green-50 border border-green-200 text-green-700 px-6 py-8 rounded-lg text-center">
            <div className="text-3xl mb-2">✅</div>
            <p className="font-semibold">Geen producten met foutieve namen gevonden!</p>
            <p className="text-sm mt-1">Alle Mini Rodini producten zijn correct.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-gray-600">
                <strong>{products.length}</strong> producten gevonden met <code className="bg-gray-100 px-1 rounded">(artNr)</code> in de naam
              </div>
              <div className="flex gap-2">
                <button
                  onClick={toggleAll}
                  className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {selected.size === products.length ? 'Deselecteer alles' : 'Selecteer alles'}
                </button>
                <button
                  onClick={handleFix}
                  disabled={selected.size === 0 || updating}
                  className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {updating ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Bezig...
                    </span>
                  ) : (
                    `${selected.size} producten hernoemen`
                  )}
                </button>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="w-10 px-3 py-2.5 text-left">
                      <input
                        type="checkbox"
                        checked={selected.size === products.length}
                        onChange={toggleAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-3 py-2.5 text-left font-medium text-gray-700">Huidige naam</th>
                    <th className="w-10 px-1 py-2.5 text-center text-gray-400">→</th>
                    <th className="px-3 py-2.5 text-left font-medium text-gray-700">Nieuwe naam</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr
                      key={p.id}
                      className={`border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${
                        selected.has(p.id) ? 'bg-blue-50/40' : ''
                      }`}
                      onClick={() => toggleSelect(p.id)}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggleSelect(p.id)}
                          className="rounded border-gray-300"
                          onClick={e => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <span>{p.newName}</span>
                        <span className="text-red-500 font-medium line-through ml-0.5">
                          {p.name.slice(p.newName.length)}
                        </span>
                      </td>
                      <td className="px-1 py-2.5 text-center text-gray-400">→</td>
                      <td className="px-3 py-2.5 text-green-700 font-medium">{p.newName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </>
  );
}
