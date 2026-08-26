export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

function ChipCount({ count, active }: { count: number; active: boolean }) {
  return (
    <span className={`font-montserrat text-[10px] font-bold ${active || count > 0 ? '' : 'text-ink-200'}`}>
      {count}
    </span>
  );
}

function Chip<T extends string>({ opt, active, onClick }: { opt: SegmentOption<T>; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-[3px] border px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] transition-colors duration-150 ease-in-out focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 ${
        active ? 'border-brand-chip-border bg-brand-soft text-brand-accent' : 'border-line-100 bg-white text-ink-100 hover:bg-surface-btn-hover'
      }`}
    >
      {opt.label}
      {opt.count != null && <ChipCount count={opt.count} active={active} />}
    </button>
  );
}

interface Props<T extends string> {
  options: Array<SegmentOption<T>>;
  active: T;
  onChange: (v: T) => void;
}

/** Chips de segmento/estado genéricos (handoff hifi #3, 26/08/2026) — extraído de
 * `features/devices/components/DeviceInventoryFilterBar.tsx`, replicado hasta
 * ahora en 6 barras de filtro con CSS idéntico. `count` opcional cubre tanto
 * "chips de segmento" (Consumibles/Incidentes/Alertas/Movimientos) como
 * "tabs → chips" con contador (Pedidos), que el handoff pide en Montserrat 700
 * dentro del chip y en `ink-200` cuando es 0. */
export default function SegmentChips<T extends string>({ options, active, onChange }: Props<T>) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((opt) => (
        <Chip key={opt.value} opt={opt} active={active === opt.value} onClick={() => onChange(opt.value)} />
      ))}
    </div>
  );
}
