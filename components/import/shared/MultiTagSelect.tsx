import { useState, useMemo, useRef, useEffect, useCallback } from 'react';

interface TagOption {
  id: number;
  name: string;
  display_name?: string;
}

interface MultiTagSelectProps {
  options: TagOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  placeholder?: string;
  label?: string;
  maxVisible?: number;
}

export default function MultiTagSelect({
  options,
  selectedIds,
  onChange,
  placeholder = 'Zoek en selecteer...',
  label,
  maxVisible = 5,
}: MultiTagSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const lower = search.toLowerCase();
    return options.filter((o) => {
      const text = o.display_name || o.name;
      return text.toLowerCase().includes(lower);
    });
  }, [options, search]);

  const unselectedFiltered = useMemo(
    () => filtered.filter((o) => !selectedSet.has(o.id)),
    [filtered, selectedSet],
  );

  const selectedOptions = useMemo(
    () => options.filter((o) => selectedSet.has(o.id)),
    [options, selectedSet],
  );

  const visibleTags = selectedOptions.slice(0, maxVisible);
  const overflowCount = selectedOptions.length - maxVisible;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleItem = useCallback(
    (id: number) => {
      if (selectedSet.has(id)) {
        onChange(selectedIds.filter((x) => x !== id));
      } else {
        onChange([...selectedIds, id]);
      }
    },
    [selectedIds, selectedSet, onChange],
  );

  const removeItem = useCallback(
    (id: number) => {
      onChange(selectedIds.filter((x) => x !== id));
    },
    [selectedIds, onChange],
  );

  const selectAllFiltered = useCallback(() => {
    const newIds = new Set(selectedIds);
    for (const o of unselectedFiltered) newIds.add(o.id);
    onChange(Array.from(newIds));
  }, [selectedIds, unselectedFiltered, onChange]);

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      <div ref={wrapperRef} className="relative">
        {/* Selected tags */}
        {selectedOptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {visibleTags.map((opt) => (
              <span
                key={opt.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-medium"
              >
                {opt.display_name || opt.name}
                <button
                  onClick={() => removeItem(opt.id)}
                  className="w-4 h-4 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 flex items-center justify-center text-blue-500 dark:text-blue-400"
                  aria-label={`Verwijder ${opt.display_name || opt.name}`}
                >
                  &times;
                </button>
              </span>
            ))}
            {overflowCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs font-medium">
                +{overflowCount} meer
              </span>
            )}
            <button
              onClick={() => onChange([])}
              className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 ml-1"
            >
              Alles wissen
            </button>
          </div>
        )}

        {/* Search input */}
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onClick={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full border-2 border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-medium hover:border-blue-400 dark:hover:border-blue-500 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          autoComplete="off"
        />

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border-2 border-blue-500 dark:border-blue-600 rounded-lg shadow-xl max-h-64 overflow-y-auto">
            {unselectedFiltered.length > 0 && (
              <button
                onClick={selectAllFiltered}
                className="w-full text-left px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b dark:border-gray-700"
              >
                Selecteer alle{search ? ` (${unselectedFiltered.length})` : ''}
              </button>
            )}

            {filtered.length === 0 ? (
              <div className="p-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                Geen resultaten voor &ldquo;{search}&rdquo;
              </div>
            ) : (
              filtered.map((opt) => {
                const isSelected = selectedSet.has(opt.id);
                return (
                  <div
                    key={opt.id}
                    onClick={() => toggleItem(opt.id)}
                    className={`px-3 py-2 text-sm cursor-pointer flex items-center gap-2 transition-colors ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-xs ${
                        isSelected
                          ? 'bg-blue-500 border-blue-500 text-white'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      {isSelected && '✓'}
                    </span>
                    <span className="truncate">{opt.display_name || opt.name}</span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
