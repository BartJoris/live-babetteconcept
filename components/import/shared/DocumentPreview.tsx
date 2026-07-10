import { useState, useMemo, type ReactNode } from 'react';

interface TableData {
  headers: string[];
  rows: string[][];
}

interface ExtractedImage {
  url: string;
  alt?: string;
}

interface DocumentPreviewProps {
  markdown: string;
  tables: TableData[];
  images: ExtractedImage[];
  onTableSelect?: (tableIndex: number, columnMapping: Record<string, string>) => void;
}

type TabId = 'document' | 'tables' | 'images';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'document', label: 'Document' },
  { id: 'tables', label: 'Tabellen' },
  { id: 'images', label: 'Afbeeldingen' },
];

const COLUMN_OPTIONS = [
  { value: '', label: '— Overslaan —' },
  { value: 'reference', label: 'Referentie' },
  { value: 'name', label: 'Naam' },
  { value: 'color', label: 'Kleur' },
  { value: 'size', label: 'Maat' },
  { value: 'material', label: 'Materiaal' },
  { value: 'price', label: 'Inkoopprijs' },
  { value: 'rrp', label: 'Verkoopprijs' },
  { value: 'ean', label: 'EAN' },
  { value: 'sku', label: 'SKU' },
  { value: 'quantity', label: 'Aantal' },
  { value: 'description', label: 'Beschrijving' },
  { value: 'category', label: 'Categorie' },
];

function renderMarkdown(md: string): ReactNode[] {
  return md.split('\n').map((line, i) => {
    if (line.startsWith('### ')) {
      return (
        <h3 key={i} className="text-base font-bold text-gray-900 dark:text-gray-100 mt-4 mb-1">
          {renderInline(line.slice(4))}
        </h3>
      );
    }
    if (line.startsWith('## ')) {
      return (
        <h2 key={i} className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-5 mb-2">
          {renderInline(line.slice(3))}
        </h2>
      );
    }
    if (line.startsWith('# ')) {
      return (
        <h1 key={i} className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-6 mb-2">
          {renderInline(line.slice(2))}
        </h1>
      );
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      return (
        <li key={i} className="text-sm text-gray-700 dark:text-gray-300 ml-4 list-disc">
          {renderInline(line.slice(2))}
        </li>
      );
    }
    if (line.trim() === '') {
      return <div key={i} className="h-2" />;
    }
    return (
      <p key={i} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
        {renderInline(line)}
      </p>
    );
  });
}

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={match.index} className="font-semibold text-gray-900 dark:text-gray-100">
        {match[1]}
      </strong>,
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

function TablePreview({
  table,
  index,
  onSelect,
}: {
  table: TableData;
  index: number;
  onSelect?: (tableIndex: number, columnMapping: Record<string, string>) => void;
}) {
  const [columnMappings, setColumnMappings] = useState<Record<number, string>>({});

  const handleMappingChange = (colIdx: number, value: string) => {
    setColumnMappings((prev) => ({ ...prev, [colIdx]: value }));
  };

  const handleUseTable = () => {
    const mapping: Record<string, string> = {};
    for (const [colIdx, field] of Object.entries(columnMappings)) {
      if (field) mapping[table.headers[Number(colIdx)] || `col_${colIdx}`] = field;
    }
    onSelect?.(index, mapping);
  };

  const hasMappings = Object.values(columnMappings).some(Boolean);
  const previewRows = table.rows.slice(0, 5);

  return (
    <div className="border dark:border-gray-700 rounded-lg overflow-hidden mb-4">
      <div className="bg-gray-50 dark:bg-gray-700 px-4 py-2 flex items-center justify-between">
        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
          Tabel {index + 1}
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
            ({table.rows.length} rijen, {table.headers.length} kolommen)
          </span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b dark:border-gray-700">
              {table.headers.map((h, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left font-medium text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-750 min-w-[120px]"
                >
                  <div className="mb-1">{h || `Kolom ${i + 1}`}</div>
                  {onSelect && (
                    <select
                      value={columnMappings[i] || ''}
                      onChange={(e) => handleMappingChange(i, e.target.value)}
                      className="w-full text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-normal"
                    >
                      {COLUMN_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, ri) => (
              <tr
                key={ri}
                className="border-b dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-750"
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-3 py-1.5 text-gray-700 dark:text-gray-300 max-w-[200px] truncate"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {table.rows.length > 5 && (
        <div className="px-4 py-1.5 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-750 text-center">
          ... en {table.rows.length - 5} meer rijen
        </div>
      )}

      {onSelect && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-750 border-t dark:border-gray-700">
          <button
            onClick={handleUseTable}
            disabled={!hasMappings}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              hasMappings
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            }`}
          >
            Gebruik deze tabel
          </button>
        </div>
      )}
    </div>
  );
}

export default function DocumentPreview({
  markdown,
  tables,
  images,
  onTableSelect,
}: DocumentPreviewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('document');

  const renderedMarkdown = useMemo(() => renderMarkdown(markdown), [markdown]);

  return (
    <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b dark:border-gray-700">
        {TABS.map((tab) => {
          const count =
            tab.id === 'tables' ? tables.length : tab.id === 'images' ? images.length : 0;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
                activeTab === tab.id
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-750'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className="ml-1.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded-full">
                  {count}
                </span>
              )}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="p-4 max-h-[600px] overflow-y-auto">
        {activeTab === 'document' && (
          <div>
            {markdown ? (
              <div className="prose-sm">{renderedMarkdown}</div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                Geen document beschikbaar
              </p>
            )}
          </div>
        )}

        {activeTab === 'tables' && (
          <div>
            {tables.length > 0 ? (
              tables.map((table, i) => (
                <TablePreview
                  key={i}
                  table={table}
                  index={i}
                  onSelect={onTableSelect}
                />
              ))
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                Geen tabellen gevonden in het document
              </p>
            )}
          </div>
        )}

        {activeTab === 'images' && (
          <div>
            {images.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
                {images.map((img, i) => (
                  <div
                    key={i}
                    className="border dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-750"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.alt || `Afbeelding ${i + 1}`}
                      className="w-full aspect-square object-contain bg-white dark:bg-gray-800"
                    />
                    {img.alt && (
                      <p className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400 truncate">
                        {img.alt}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                Geen afbeeldingen gevonden in het document
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
