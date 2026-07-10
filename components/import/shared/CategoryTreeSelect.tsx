import { useState, useMemo, useCallback, useRef, useEffect } from 'react';

interface CategoryItem {
  id: number;
  name: string;
  display_name?: string;
  complete_name?: string;
}

interface CategoryTreeSelectProps {
  categories: CategoryItem[];
  selectedId: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  label?: string;
}

interface TreeNode {
  name: string;
  fullPath: string;
  category: CategoryItem | null;
  children: Map<string, TreeNode>;
}

function buildTree(categories: CategoryItem[]): TreeNode {
  const root: TreeNode = { name: '', fullPath: '', category: null, children: new Map() };

  for (const cat of categories) {
    const pathStr = cat.complete_name || cat.display_name || cat.name;
    const parts = pathStr.split(' / ').map((p) => p.trim());
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          fullPath: parts.slice(0, i + 1).join(' / '),
          category: null,
          children: new Map(),
        });
      }
      current = current.children.get(part)!;
    }
    current.category = cat;
  }

  return root;
}

function TreeNodeView({
  node,
  depth,
  selectedId,
  onSelect,
  searchFilter,
  expandedPaths,
  toggleExpanded,
}: {
  node: TreeNode;
  depth: number;
  selectedId: number | null;
  onSelect: (cat: CategoryItem) => void;
  searchFilter: string;
  expandedPaths: Set<string>;
  toggleExpanded: (path: string) => void;
}) {
  const hasChildren = node.children.size > 0;
  const isExpanded = expandedPaths.has(node.fullPath);
  const isSelected = node.category?.id === selectedId;

  const matchesFilter = useCallback(
    (n: TreeNode): boolean => {
      if (!searchFilter) return true;
      const lower = searchFilter.toLowerCase();
      if (n.name.toLowerCase().includes(lower)) return true;
      for (const child of n.children.values()) {
        if (matchesFilter(child)) return true;
      }
      return false;
    },
    [searchFilter],
  );

  if (searchFilter && !matchesFilter(node)) return null;

  const visibleChildren = searchFilter
    ? Array.from(node.children.values())
    : isExpanded
      ? Array.from(node.children.values())
      : [];

  return (
    <div>
      <div
        className={`flex items-center py-1.5 px-2 rounded cursor-pointer transition-colors text-sm ${
          isSelected
            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200'
        }`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => {
          if (node.category) onSelect(node.category);
          if (hasChildren) toggleExpanded(node.fullPath);
        }}
      >
        {hasChildren && (
          <span className="w-4 h-4 flex items-center justify-center mr-1 text-gray-400 dark:text-gray-500 flex-shrink-0">
            {isExpanded || searchFilter ? '▾' : '▸'}
          </span>
        )}
        {!hasChildren && <span className="w-4 h-4 mr-1 flex-shrink-0" />}
        <span className="truncate">{node.name}</span>
        {node.category && (
          <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 pl-2">
            #{node.category.id}
          </span>
        )}
      </div>
      {visibleChildren.map((child) => (
        <TreeNodeView
          key={child.fullPath}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          searchFilter={searchFilter}
          expandedPaths={expandedPaths}
          toggleExpanded={toggleExpanded}
        />
      ))}
    </div>
  );
}

export default function CategoryTreeSelect({
  categories,
  selectedId,
  onChange,
  placeholder = 'Selecteer categorie...',
  label,
}: CategoryTreeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const wrapperRef = useRef<HTMLDivElement>(null);

  const tree = useMemo(() => buildTree(categories), [categories]);

  const selectedCategory = useMemo(
    () => (selectedId != null ? categories.find((c) => c.id === selectedId) : null),
    [selectedId, categories],
  );

  const breadcrumb = useMemo(() => {
    if (!selectedCategory) return null;
    const path = selectedCategory.complete_name || selectedCategory.display_name || selectedCategory.name;
    return path.split(' / ').map((p) => p.trim());
  }, [selectedCategory]);

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

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleSelect = useCallback(
    (cat: CategoryItem) => {
      onChange(cat.id);
      setIsOpen(false);
      setSearch('');
    },
    [onChange],
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange(null);
    },
    [onChange],
  );

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      <div ref={wrapperRef} className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full border-2 border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-left font-medium hover:border-blue-400 dark:hover:border-blue-500 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        >
          {breadcrumb ? (
            <span className="flex items-center gap-1 flex-wrap">
              {breadcrumb.map((part, i) => (
                <span key={i} className="flex items-center">
                  {i > 0 && <span className="text-gray-400 dark:text-gray-500 mx-0.5">/</span>}
                  <span
                    className={
                      i === breadcrumb.length - 1
                        ? 'text-blue-600 dark:text-blue-400 font-semibold'
                        : 'text-gray-500 dark:text-gray-400'
                    }
                  >
                    {part}
                  </span>
                </span>
              ))}
              <button
                onClick={handleClear}
                className="ml-auto w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 flex items-center justify-center text-xs hover:bg-gray-300 dark:hover:bg-gray-500 flex-shrink-0"
                aria-label="Wissen"
              >
                &times;
              </button>
            </span>
          ) : (
            <span className="text-gray-500 dark:text-gray-400">{placeholder}</span>
          )}
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border-2 border-blue-500 dark:border-blue-600 rounded-lg shadow-xl max-h-80 overflow-hidden flex flex-col">
            <div className="p-2 border-b dark:border-gray-700">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter categorieën..."
                className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto flex-1 py-1">
              {Array.from(tree.children.values()).map((node) => (
                <TreeNodeView
                  key={node.fullPath}
                  node={node}
                  depth={0}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                  searchFilter={search}
                  expandedPaths={expandedPaths}
                  toggleExpanded={toggleExpanded}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
