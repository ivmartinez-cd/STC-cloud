import SearchInput from '../../../shared/components/SearchInput';
import ScopeChips, { type ScopeChip } from '../../../shared/components/ScopeChips';
import type { Incident } from '../../../shared/types/incidents';
import type { IncidentFiltersState } from '../hooks/useIncidentsPage';

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

interface Props { filters: IncidentFiltersState; rows: Incident[] }

/** `?client_id=` llega por deep-link desde Cliente Detalle sin nombre: el legible
 * sale de la primera fila que matchea (ver `ScopeChips`). */
function scopeChips(f: IncidentFiltersState, rows: Incident[]): ScopeChip[] {
  if (!f.clientId) return [];
  return [{ kind: 'Cliente', value: rows[0]?.client_name ?? undefined, onClear: () => f.setClientId('') }];
}

/** Barra de filtros de Incidentes (handoff hifi #3, fase 4) — 3 chips
 * independientes (se combinan con AND), igual criterio que `AlertsFilterBar`.
 * El mockup también muestra "TODOS" pero es sólo el estado por default sin
 * ningún chip activo — no hace falta un chip propio para eso (mismo criterio
 * que Alertas, que tampoco tiene un chip "TODAS"). */
export default function IncidentsFilterBar({ filters: f, rows }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line-150 px-5 py-3.5">
      <SearchInput value={f.q} onChange={f.setQ} placeholder="Buscar por número, título o cliente…" />
      <div className="flex flex-wrap items-center gap-1.5">
        <ScopeChips chips={scopeChips(f, rows)} />
        <ToggleChip label="ABIERTOS" active={f.openOnly} onClick={() => f.setOpenOnly(!f.openOnly)} />
        <ToggleChip label="+24 H" active={f.old24h} onClick={() => f.setOld24h(!f.old24h)} />
        <ToggleChip label="SIN EQUIPO" active={f.noDevice} onClick={() => f.setNoDevice(!f.noDevice)} />
      </div>
      <div className="ml-auto font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-ink-300">Ordenado por antigüedad · desc</div>
    </div>
  );
}
