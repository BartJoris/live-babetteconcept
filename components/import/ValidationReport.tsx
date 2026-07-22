import { useState, useCallback } from 'react';
import type { ProductValidation, ValidationResult } from '@/lib/import/services/odoo-validation.service';

export type { ProductValidation, ValidationResult };

interface ValidationReportProps {
  results: ProductValidation[];
  onRevalidate?: () => void;
  isLoading?: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Productnaam',
  categ_id: 'Interne Categorie',
  brand: 'Merk',
  variant_count: 'Varianten',
  website_published: 'Gepubliceerd',
  image_1920: 'Hoofdafbeelding',
  public_categ_ids: 'Webshopcategorieën',
  product_tag_ids: 'Productlabels',
  template: 'Sjabloon',
};

const STATUS_CONFIG = {
  pass: {
    icon: '✓',
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-200 dark:border-green-800',
  },
  warning: {
    icon: '⚠',
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-200 dark:border-orange-800',
  },
  fail: {
    icon: '✗',
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
  },
} as const;

function StatusIcon({ status }: { status: 'pass' | 'fail' | 'warning' }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-sm font-bold ${config.color} ${config.bg}`}>
      {config.icon}
    </span>
  );
}

function SummaryCard({ label, count, status }: { label: string; count: number; status: 'pass' | 'warning' | 'fail' | 'total' }) {
  const colorMap = {
    total: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
    pass: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300',
    warning: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300',
    fail: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorMap[status]}`}>
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-sm font-medium">{label}</div>
    </div>
  );
}

function FieldRow({ result }: { result: ValidationResult }) {
  const config = STATUS_CONFIG[result.status];
  const label = FIELD_LABELS[result.field] ?? result.field;

  return (
    <tr className={`${config.bg} border-b ${config.border}`}>
      <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">{label}</td>
      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{result.expected}</td>
      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{result.actual}</td>
      <td className="px-4 py-2 text-center"><StatusIcon status={result.status} /></td>
      <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{result.message}</td>
    </tr>
  );
}

function ProductCard({ validation }: { validation: ProductValidation }) {
  const [expanded, setExpanded] = useState(false);
  const config = STATUS_CONFIG[validation.overallStatus];

  return (
    <div className={`rounded-lg border ${config.border} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className={`w-full flex items-center justify-between px-4 py-3 ${config.bg} hover:opacity-90 transition-opacity cursor-pointer`}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <StatusIcon status={validation.overallStatus} />
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {validation.productName}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            (ID: {validation.templateId})
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="field-table">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 text-left">
                <th className="px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Veld</th>
                <th className="px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Verwacht</th>
                <th className="px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Werkelijk</th>
                <th className="px-4 py-2 font-medium text-gray-600 dark:text-gray-300 text-center">Status</th>
                <th className="px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Bericht</th>
              </tr>
            </thead>
            <tbody>
              {validation.results.map((r, i) => (
                <FieldRow key={`${r.field}-${i}`} result={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function generateMarkdownReport(results: ProductValidation[]): string {
  const lines: string[] = ['# Validatie Rapport', ''];

  const passed = results.filter(r => r.overallStatus === 'pass').length;
  const warnings = results.filter(r => r.overallStatus === 'warning').length;
  const failed = results.filter(r => r.overallStatus === 'fail').length;

  lines.push(`## Samenvatting`);
  lines.push(`- Totaal: ${results.length}`);
  lines.push(`- Geslaagd: ${passed}`);
  lines.push(`- Waarschuwingen: ${warnings}`);
  lines.push(`- Mislukt: ${failed}`);
  lines.push('');

  for (const v of results) {
    lines.push(`## ${v.productName} (ID: ${v.templateId}) — ${v.overallStatus.toUpperCase()}`);
    lines.push('');
    lines.push('| Veld | Verwacht | Werkelijk | Status |');
    lines.push('|------|----------|-----------|--------|');
    for (const r of v.results) {
      const label = FIELD_LABELS[r.field] ?? r.field;
      lines.push(`| ${label} | ${r.expected} | ${r.actual} | ${r.status} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export default function ValidationReport({ results, onRevalidate, isLoading }: ValidationReportProps) {
  const handleExport = useCallback(() => {
    const markdown = generateMarkdownReport(results);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `validatie-rapport-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  const passed = results.filter(r => r.overallStatus === 'pass').length;
  const warnings = results.filter(r => r.overallStatus === 'warning').length;
  const failed = results.filter(r => r.overallStatus === 'fail').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Validatierapport</h2>
        <div className="flex gap-2">
          {onRevalidate && (
            <button
              type="button"
              onClick={onRevalidate}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Bezig...' : 'Hervalideren'}
            </button>
          )}
          <button
            type="button"
            onClick={handleExport}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Exporteer
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="summary-cards">
        <SummaryCard label="Totaal" count={results.length} status="total" />
        <SummaryCard label="Geslaagd" count={passed} status="pass" />
        <SummaryCard label="Waarschuwingen" count={warnings} status="warning" />
        <SummaryCard label="Mislukt" count={failed} status="fail" />
      </div>

      <div className="space-y-3" data-testid="product-cards">
        {results.map(v => (
          <ProductCard key={v.templateId} validation={v} />
        ))}
      </div>
    </div>
  );
}
