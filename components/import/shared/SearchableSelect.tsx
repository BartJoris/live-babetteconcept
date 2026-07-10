import { useState, useEffect, useRef } from 'react';

interface SearchableSelectProps {
  options: Array<{ id: number; label: string }>;
  value: number | string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Selecteer...',
  className = '',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = value
    ? options.find((opt) => opt.id.toString() === value.toString())
    : null;
  const displayValue = selectedOption ? selectedOption.label : '';

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (optionId: number) => {
    onChange(optionId.toString());
    setIsOpen(false);
    setSearch('');
    inputRef.current?.blur();
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={isOpen ? search : displayValue}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => setIsOpen(true)}
        onClick={() => setIsOpen(true)}
        placeholder={placeholder}
        className="w-full border-2 border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm font-medium cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-600 dark:placeholder-gray-400"
        autoComplete="off"
      />
      {isOpen && (
        <div className="absolute z-50 w-full min-w-max mt-1 bg-white dark:bg-gray-800 border-2 border-blue-500 dark:border-blue-600 rounded-lg shadow-xl max-h-80 overflow-y-auto">
          {filteredOptions.length === 0 ? (
            <div className="p-3 text-sm text-gray-700 dark:text-gray-300 text-center">
              Geen resultaten voor &quot;{search}&quot;
            </div>
          ) : (
            filteredOptions.map((option) => (
              <div
                key={option.id}
                onClick={() => handleSelect(option.id)}
                className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-blue-500 dark:hover:bg-blue-600 hover:text-white cursor-pointer border-b dark:border-gray-700 last:border-b-0 transition-colors"
              >
                {option.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
