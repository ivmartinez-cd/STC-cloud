import { useState, useEffect, useRef } from 'react';
import { api } from '../../shared/lib/api';
import { useDebounce } from '../../shared/hooks/useDebounce';

export type SearchClient = { id: string; name: string };
export type SearchDevice = { id: string; serial_number: string; brand: string; model: string };
export type SearchResults = { clients: SearchClient[]; devices: SearchDevice[] };

const EMPTY: SearchResults = { clients: [], devices: [] };

/** Ctrl/Cmd+K enfoca el buscador; click fuera cierra el dropdown. */
function useSearchShortcuts(containerRef: React.RefObject<HTMLDivElement | null>, close: () => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
      }
    };
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) close();
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Consulta /search con la query ya debounced (mínimo 2 caracteres). */
function useSearchResults(debounced: string, setShowResults: (v: boolean) => void) {
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [isSearching, setIsSearching] = useState(false);
  useEffect(() => {
    if (debounced.length < 2) { setResults(EMPTY); setShowResults(false); return; }
    let cancelled = false;
    setIsSearching(true);
    api.get<SearchResults>(`/search?q=${debounced}`)
      .then((data) => { if (!cancelled) { setResults(data); setShowResults(true); } })
      .catch((error) => console.error('Search error:', error))
      .finally(() => { if (!cancelled) setIsSearching(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  return { results, isSearching };
}

/** Búsqueda global de la cabecera (clientes + dispositivos), con debounce de 300 ms. */
export function useGlobalSearch() {
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { results, isSearching } = useSearchResults(useDebounce(query, 300), setShowResults);
  useSearchShortcuts(containerRef, () => setShowResults(false));
  const reset = () => { setShowResults(false); setQuery(''); };
  return { query, setQuery, results, isSearching, showResults, setShowResults, containerRef, reset };
}

export type GlobalSearchState = ReturnType<typeof useGlobalSearch>;
