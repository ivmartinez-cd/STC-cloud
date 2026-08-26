import SearchInput from '../../../shared/components/SearchInput';
import type { AlertFiltersState } from '../hooks/useAlertsPage';

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      className={`rounded-[3px] border px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] transition-colors duration-150 ease-in-out focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 ${
        active ? 'border-brand-chip-border bg-brand-soft text-brand-accent' : 'border-line-100 bg-white text-ink-100 hover:bg-surface-btn-hover'
      }`}
    >
      {label}
    </button>
  );
}

interface Props { filters: AlertFiltersState }

/** Barra de filtros de Alertas (handoff hifi #3, 26/08/2026) — 5 `<select>`
 * pasan a chips independientes (no segmento único): cada uno prende/apaga su
 * propio filtro y se combinan con AND (`SIN RESOLVER` + `CRÍTICAS` a la vez es
 * válido). Por eso usa un `ToggleChip` local en vez de `shared/SegmentChips`
 * (ese componente es de selección única, semántica distinta). */
export default function AlertsFilterBar({ filters: f }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line-150 px-5 py-3.5">
      <SearchInput value={f.q} onChange={f.setQ} placeholder="Buscar por código, cliente o equipo…" />
      <div className="flex flex-wrap items-center gap-1.5">
        <ToggleChip label="SIN RESOLVER" active={f.unresolved} onClick={() => f.setUnresolved(!f.unresolved)} />
        <ToggleChip label="CRÍTICAS" active={f.critical} onClick={() => f.setCritical(!f.critical)} />
        <ToggleChip label="SIN RECONOCER" active={f.unacknowledged} onClick={() => f.setUnacknowledged(!f.unacknowledged)} />
        <ToggleChip label="DISPONIBILIDAD" active={f.availability} onClick={() => f.setAvailability(!f.availability)} />
        <ToggleChip label="+24 H" active={f.last24h} onClick={() => f.setLast24h(!f.last24h)} />
      </div>
      <div className="ml-auto font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-ink-300">Ordenado por severidad · desc</div>
    </div>
  );
}
