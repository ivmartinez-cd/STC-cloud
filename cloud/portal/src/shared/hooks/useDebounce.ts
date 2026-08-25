import { useEffect, useState } from 'react';

/** Devuelve `value` recién `delay` ms después de su último cambio — evita disparar un fetch por cada tecla. */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debounced;
}
