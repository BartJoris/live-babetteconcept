import { useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import ValidationReport from '@/components/import/ValidationReport';
import type { ProductValidation } from '@/components/import/ValidationReport';

interface ValidationApiResponse {
  success: boolean;
  results: ProductValidation[];
  summary: {
    total: number;
    passed: number;
    warnings: number;
    failed: number;
  };
}

export default function ValidateImportPage() {
  const [templateInput, setTemplateInput] = useState('');
  const [results, setResults] = useState<ProductValidation[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseTemplateIds = useCallback((input: string): number[] => {
    return input
      .split(/[,\s]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter(n => !isNaN(n) && n > 0);
  }, []);

  const runValidation = useCallback(async () => {
    const ids = parseTemplateIds(templateInput);
    if (ids.length === 0) {
      setError('Voer minstens één geldig template ID in.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const body = {
        validations: ids.map(id => ({
          templateId: id,
          expected: {
            name: '',
            categoryId: 0,
            brandName: '',
            variantCount: 0,
            isPublished: true,
            hasImages: true,
          },
        })),
      };

      const res = await fetch('/api/validate-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message ?? errData?.error ?? `HTTP ${res.status}`);
      }

      const data: ValidationApiResponse = await res.json();
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onbekende fout bij validatie.');
    } finally {
      setIsLoading(false);
    }
  }, [templateInput, parseTemplateIds]);

  const handleRevalidate = useCallback(() => {
    runValidation();
  }, [runValidation]);

  return (
    <>
      <Head>
        <title>Validatie - Babette</title>
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <Link
              href="/product-import"
              className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
            >
              ← Terug naar Product Import
            </Link>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Post-Import Validatie
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Controleer of geïmporteerde producten correct zijn aangemaakt in Odoo.
          </p>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <label
              htmlFor="template-ids"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Template IDs (komma-gescheiden)
            </label>
            <textarea
              id="template-ids"
              rows={3}
              value={templateInput}
              onChange={e => setTemplateInput(e.target.value)}
              placeholder="Bijv. 12345, 12346, 12347"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <button
              type="button"
              onClick={runValidation}
              disabled={isLoading || !templateInput.trim()}
              className="px-6 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Valideren...' : 'Valideer'}
            </button>
          </div>

          {results && (
            <ValidationReport
              results={results}
              onRevalidate={handleRevalidate}
              isLoading={isLoading}
            />
          )}
        </div>
      </div>
    </>
  );
}
