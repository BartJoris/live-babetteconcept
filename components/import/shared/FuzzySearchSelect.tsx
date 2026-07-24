import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useLayoutEffect,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export interface FuzzyOption {
  id: number | string;
  label: string;
  group?: string;
}

interface FuzzySearchSelectProps {
  options: FuzzyOption[];
  value: number | string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
  showGroupHeaders?: boolean;
  /** Allow confirming a typed value that is not in the options list (Enter / blur). */
  allowCustom?: boolean;
}

interface ScoredOption extends FuzzyOption {
  score: number;
  matchRanges: Array<[number, number]>;
}

function fuzzyScore(
  text: string,
  query: string,
): { score: number; ranges: Array<[number, number]> } {
  const lower = text.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { score: 0, ranges: [] };

  const ranges: Array<[number, number]> = [];
  let totalScore = 0;

  for (const word of words) {
    const idx = lower.indexOf(word);
    if (idx === -1) return { score: -1, ranges: [] };
    ranges.push([idx, idx + word.length]);
    totalScore += word.length / text.length;
    if (idx === 0) totalScore += 0.3;
  }

  return { score: totalScore, ranges };
}

function mergeRanges(
  ranges: Array<[number, number]>,
): Array<[number, number]> {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i][0] <= last[1]) {
      last[1] = Math.max(last[1], sorted[i][1]);
    } else {
      merged.push(sorted[i]);
    }
  }
  return merged;
}

function HighlightedText({
  text,
  ranges,
}: {
  text: string;
  ranges: Array<[number, number]>;
}) {
  const merged = mergeRanges(ranges);
  if (merged.length === 0) return <>{text}</>;

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (cursor < start) {
      parts.push(<span key={cursor}>{text.slice(cursor, start)}</span>);
    }
    parts.push(
      <mark
        key={start}
        className="bg-yellow-200 dark:bg-yellow-700 text-inherit rounded-sm px-0.5"
      >
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) {
    parts.push(<span key={cursor}>{text.slice(cursor)}</span>);
  }
  return <>{parts}</>;
}

export default function FuzzySearchSelect({
  options,
  value,
  onChange,
  placeholder = 'Zoek...',
  className = '',
  label,
  showGroupHeaders = false,
  allowCustom = false,
}: FuzzySearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(
    () =>
      value != null
        ? options.find((o) => o.id.toString() === value.toString())
        : null,
    [value, options],
  );

  const scored = useMemo((): ScoredOption[] => {
    if (!search.trim()) {
      return options.map((o) => ({ ...o, score: 0, matchRanges: [] }));
    }
    return options
      .map((o) => {
        const { score, ranges } = fuzzyScore(o.label, search);
        return { ...o, score, matchRanges: ranges };
      })
      .filter((o) => o.score >= 0)
      .sort((a, b) => b.score - a.score);
  }, [options, search]);

  const grouped = useMemo(() => {
    if (!showGroupHeaders) return null;
    const map = new Map<string, ScoredOption[]>();
    for (const opt of scored) {
      const g = opt.group ?? '';
      const arr = map.get(g) ?? [];
      arr.push(opt);
      map.set(g, arr);
    }
    return map;
  }, [scored, showGroupHeaders]);

  const flatList = useMemo(
    () =>
      showGroupHeaders && grouped
        ? Array.from(grouped.values()).flat()
        : scored,
    [showGroupHeaders, grouped, scored],
  );

  const updateMenuPosition = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 280 && rect.top > spaceBelow;
    // Keep a usable click target even near viewport edges
    const available = openUp ? rect.top - 8 : spaceBelow - 8;
    const maxHeight = Math.max(160, Math.min(288, available));

    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: Math.max(rect.width, 180),
      zIndex: 9999,
      maxHeight,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener('resize', onScrollOrResize);
    // Capture scroll from nested overflow containers
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [isOpen, updateMenuPosition, flatList.length]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setIsOpen(false);
      setSearch('');
      setActiveIndex(-1);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setActiveIndex(-1);
  }, [search]);

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const el = listRef.current.querySelector(`[data-idx="${activeIndex}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const handleSelect = useCallback(
    (id: number | string) => {
      onChange(id.toString());
      setIsOpen(false);
      setSearch('');
      setActiveIndex(-1);
      inputRef.current?.blur();
    },
    [onChange],
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange('');
      setSearch('');
      setIsOpen(false);
    },
    [onChange],
  );

  const commitCustom = useCallback(() => {
    if (!allowCustom) return;
    const custom = search.trim();
    if (!custom) return;
    onChange(custom);
    setIsOpen(false);
    setSearch('');
    setActiveIndex(-1);
  }, [allowCustom, search, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen) setIsOpen(true);
          setActiveIndex((prev) => Math.min(prev + 1, flatList.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < flatList.length) {
            handleSelect(flatList[activeIndex].id);
          } else if (allowCustom && search.trim()) {
            commitCustom();
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setSearch('');
          setActiveIndex(-1);
          inputRef.current?.blur();
          break;
      }
    },
    [
      activeIndex,
      flatList,
      handleSelect,
      allowCustom,
      search,
      commitCustom,
      isOpen,
    ],
  );

  const dropdown =
    isOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={listRef}
            style={menuStyle}
            className="bg-white dark:bg-gray-800 border-2 border-blue-500 dark:border-blue-600 rounded-lg shadow-xl overflow-y-auto"
          >
            {flatList.length === 0 ? (
              <div className="p-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                {allowCustom && search.trim() ? (
                  <button
                    type="button"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={commitCustom}
                  >
                    Gebruik &ldquo;{search.trim()}&rdquo;
                  </button>
                ) : (
                  <>Geen resultaten voor &ldquo;{search}&rdquo;</>
                )}
              </div>
            ) : showGroupHeaders && grouped ? (
              (() => {
                let idx = 0;
                return Array.from(grouped.entries()).map(([group, items]) => (
                  <div key={group || 'default'}>
                    {group && (
                      <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-gray-750 sticky top-0">
                        {group}
                      </div>
                    )}
                    {items.map((opt) => {
                      const currentIdx = idx++;
                      return (
                        <div
                          key={`${opt.id}__${opt.label}`}
                          data-idx={currentIdx}
                          role="option"
                          aria-selected={currentIdx === activeIndex}
                          onMouseDown={(e) => {
                            // Select on mousedown so outside-handlers / blur cannot steal the click
                            e.preventDefault();
                            e.stopPropagation();
                            handleSelect(opt.id);
                          }}
                          className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                            currentIdx === activeIndex
                              ? 'bg-blue-500 dark:bg-blue-600 text-white'
                              : 'text-gray-900 dark:text-gray-100 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                          }`}
                        >
                          <HighlightedText
                            text={opt.label}
                            ranges={opt.matchRanges}
                          />
                        </div>
                      );
                    })}
                  </div>
                ));
              })()
            ) : (
              flatList.map((opt, i) => (
                <div
                  key={`${opt.id}__${opt.label}`}
                  data-idx={i}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelect(opt.id);
                  }}
                  className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                    i === activeIndex
                      ? 'bg-blue-500 dark:bg-blue-600 text-white'
                      : 'text-gray-900 dark:text-gray-100 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                  }`}
                >
                  <HighlightedText text={opt.label} ranges={opt.matchRanges} />
                </div>
              ))
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      <div ref={wrapperRef} className="relative">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={isOpen ? search : (selectedOption?.label ?? '')}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onClick={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full border-2 border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 pr-8 text-sm font-medium hover:border-blue-400 dark:hover:border-blue-500 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            autoComplete="off"
          />
          {value != null && value !== '' && !isOpen && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 flex items-center justify-center text-xs hover:bg-gray-300 dark:hover:bg-gray-500"
              aria-label="Wissen"
            >
              &times;
            </button>
          )}
        </div>
        {dropdown}
      </div>
    </div>
  );
}
