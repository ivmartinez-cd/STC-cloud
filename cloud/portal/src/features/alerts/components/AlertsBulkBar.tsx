import { BTN_PRIMARY_SM, BTN_SECONDARY_SM } from '../../../shared/lib/buttons';

interface Props {
  count: number;
  busy: boolean;
  groupByCode: boolean;
  onAcknowledge: () => void;
  onOpenIncident: () => void;
  onToggleGroupByCode: () => void;
  onClear: () => void;
}

/** Barra de acciones masivas de Alertas (handoff hifi #3, 26/08/2026):
 * `RECONOCER` / `ABRIR INCIDENTE` / `AGRUPAR POR CÓDIGO`. El mockup también
 * muestra `SILENCIAR 24 H`, pero no hay backend de silenciado/snooze
 * (`mute_until` no existe en `alerts` ni hay job que lo respete) — inventar el
 * botón sin esa base sería un control que promete algo que no hace. Se deja
 * fuera hasta que exista la feature real, igual que la automatización de
 * datos faltantes en Configuración. `AGRUPAR POR CÓDIGO` es un toggle de
 * vista sobre la página visible (`groupByCode`), no una request nueva. */
function BulkActionButtons({ busy, groupByCode, onAcknowledge, onOpenIncident, onToggleGroupByCode }: Omit<Props, 'count' | 'onClear'>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={onAcknowledge} disabled={busy} className={BTN_PRIMARY_SM}>RECONOCER</button>
      <button type="button" onClick={onOpenIncident} disabled={busy} className={BTN_SECONDARY_SM}>ABRIR INCIDENTE</button>
      <button type="button" onClick={onToggleGroupByCode} aria-pressed={groupByCode} className={BTN_SECONDARY_SM}>
        {groupByCode ? 'VER LISTADO' : 'AGRUPAR POR CÓDIGO'}
      </button>
    </div>
  );
}

export default function AlertsBulkBar(props: Props) {
  if (props.count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-brand-chip-border bg-brand-soft px-5 py-3">
      <span className="whitespace-nowrap font-sans text-[11.5px] font-semibold text-brand-accent">
        {props.count} alerta{props.count === 1 ? '' : 's'} seleccionada{props.count === 1 ? '' : 's'}
      </span>
      <BulkActionButtons {...props} />
      <div className="flex-1" />
      <button type="button" onClick={props.onClear} className="whitespace-nowrap font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline">
        LIMPIAR SELECCIÓN
      </button>
    </div>
  );
}
