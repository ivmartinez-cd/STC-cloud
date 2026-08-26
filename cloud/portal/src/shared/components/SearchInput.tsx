import { Search } from 'lucide-react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}

/** Buscador genérico (handoff hifi #3, 26/08/2026) — extraído de
 * `features/devices/components/DeviceInventoryFilterBar.tsx`, replicado hasta
 * ahora en 6 barras de filtro con CSS idéntico. El debounce lo maneja el
 * caller (`useDebounce`, ya en `shared/hooks/`) — este componente es controlado. */
export default function SearchInput({ value, onChange, placeholder, className }: Props) {
  return (
    <div className={`relative min-w-[240px] max-w-[440px] flex-1 ${className ?? ''}`}>
      {/* `#a9aeb0` sin token — mismo gap documentado en las 6 copias que reemplaza. */}
      <Search size={11} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#a9aeb0]" />
      <input
        type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[3px] border border-line-100 bg-surface-input py-[9px] pl-8 pr-3 font-sans text-[12.5px] text-ink-900 outline-none placeholder:text-ink-300 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
      />
    </div>
  );
}
