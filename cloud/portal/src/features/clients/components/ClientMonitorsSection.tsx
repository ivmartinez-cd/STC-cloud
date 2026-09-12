import { Radio, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import ZoneLabel from '../../../shared/components/ZoneLabel';
import { useReturnParam } from '../../../shared/hooks/useReturnParam';
import HifiPagination from '../../../shared/components/HifiPagination';
import { useFitRows } from '../../../shared/hooks/useFitRows';
import { useClientPagination } from '../../../shared/hooks/useClientPagination';
import { OFFLINE_THRESHOLD_MS } from '../../../shared/lib/constants';
import type { Monitor } from '../../../shared/types/monitor';

const GRID_COLS = 'grid-cols-[minmax(240px,1fr)_150px_170px_130px_50px]';

type Severity = 'ok' | 'warning' | 'critical';

const CHIP_STYLES: Record<Severity, string> = {
  ok: 'bg-surface-avatar text-ink-650',
  warning: 'bg-brand-soft text-brand-accent',
  critical: 'bg-severity-critical/10 text-severity-critical',
};
const DOT_STYLES: Record<Severity, string> = {
  ok: 'bg-severity-ok',
  warning: 'bg-severity-warning',
  critical: 'bg-severity-critical',
};

/** Mapea estado del monitor a severidad + rótulo — nunca emerald/amber/rose,
 * sólo la escala `--color-severity-*` (naranja/gris): en línea = ok, sin
 * contacto/pendiente = warning, offline = critical. */
function monitorSeverity(status: string, isOnline: boolean): { level: Severity; label: string } {
  if (status === 'active' && isOnline) return { level: 'ok', label: 'En línea' };
  if ((status === 'active' && !isOnline) || status === 'pending') {
    return { level: 'warning', label: status === 'pending' ? 'Pendiente' : 'Sin contacto' };
  }
  return { level: 'critical', label: 'Offline' };
}

/** Chip de estado del monitor — mismo patrón que `EstadoChip` de
 * `ClientDevicesTable`/`ClientsDirectoryTable`, extendido a 3 niveles. */
function MonitorStatusChip({ status, last_seen, now }: { status: string; last_seen: string | null; now: number }) {
  const isOnline = status === 'active' && last_seen !== null && (now - new Date(last_seen).getTime() <= OFFLINE_THRESHOLD_MS);
  const { level, label } = monitorSeverity(status, isOnline);
  return (
    <span className={`inline-flex items-center gap-[6px] justify-self-start rounded-[2px] px-[9px] py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] ${CHIP_STYLES[level]}`}>
      <span className={`block h-1.5 w-1.5 rounded-full ${DOT_STYLES[level]}`} /> {label}
    </span>
  );
}

/** "hace N min/h/d" — mismo formato que `formatLastReport` de `ClientDevicesTable`. */
function formatLastSeen(iso: string | null, now: number): string {
  if (!iso) return 'nunca';
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.round(min / 60);
  return hrs < 24 ? `hace ${hrs} h` : `hace ${Math.round(hrs / 24)} d`;
}

/** Contador de equipos del nodo — linkea a la tab "Dispositivos" del monitor. */
function DeviceCountLink({ id, count, returnParam }: { id: string; count: number; returnParam: string }) {
  return (
    <Link
      to={`/monitors/${id}?tab=devices&${returnParam}`}
      className="inline-flex h-[26px] min-w-[36px] items-center justify-center rounded-[3px] border border-line-avatar bg-surface-avatar px-2 font-montserrat text-[11.5px] font-semibold tabular-nums text-ink-600 transition-colors duration-150 ease-in-out hover:border-brand hover:text-brand-accent"
    >
      {count}
    </Link>
  );
}

function DeleteMonitorButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Eliminar monitor"
      className="flex h-[26px] w-[26px] items-center justify-center rounded-[3px] border border-line-avatar text-ink-300 transition-colors duration-150 ease-in-out hover:border-severity-critical hover:text-severity-critical"
    >
      <Trash2 size={13} />
    </button>
  );
}

/** Zona "Monitores instalados" (handoff hifi "Cliente — detalle", 25/08/2026) —
 * los nodos DCA del cliente, no confundir con `ClientDevicesSection` (equipos/
 * impresoras) que vive en la tab "Dispositivos". Es el elemento que crece en la
 * columna del resumen: la lista viene entera del backend, así que se pagina en
 * memoria con las filas que entran en el alto disponible (`useFitRows`, 27/08/2026). */
export default function ClientMonitorsSection({
  monitors,
  now,
  isReadOnlyViewer,
  onCreateClick,
  onDeleteClick,
}: {
  monitors: Monitor[];
  now: number;
  isReadOnlyViewer: boolean;
  onCreateClick: () => void;
  onDeleteClick: (monitor: { id: string; name: string }) => void;
}) {
  // `from` = esta ficha con su tab/página: el breadcrumb del monitor vuelve acá.
  // Vía `useReturnParam` para que no se anide el `from` con el que se llegó.
  const returnParam = useReturnParam();
  const fit = useFitRows({ estimate: 54, min: 2 });
  const pg = useClientPagination(monitors, fit.rows);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <ZoneLabel text={`Monitores instalados · ${monitors.length} nodos`} lineColorClass="bg-brand-gray" />
        {!isReadOnlyViewer && (
          <button
            type="button"
            onClick={onCreateClick}
            className="rounded-[3px] bg-brand px-3.5 py-2.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe"
          >
            + Registrar monitor
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-[5px] border border-line-100 bg-white">
        <div ref={fit.ref} className="min-h-0 flex-1 overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[760px]" role="table" aria-label="Monitores instalados">
              <div role="row" data-fit-fixed className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-100 bg-surface-table-head px-5 py-3`}>
                <div role="columnheader" className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">NODO</div>
                <div role="columnheader" className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">ESTADO</div>
                <div role="columnheader" className="text-right font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">ÚLTIMA ACTIVIDAD</div>
                <div role="columnheader" className="text-right font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">DISPOSITIVOS</div>
                <div role="columnheader" />
              </div>

              {monitors.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-1.5 py-20 text-center">
                  <span className="font-sans text-[12.5px] text-ink-300">Sin monitores configurados</span>
                </div>
              )}

              {pg.visible.map((m) => (
                <div
                  key={m.id}
                  role="row" data-fit-row
                  className={`grid ${GRID_COLS} min-h-[54px] items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px] transition-colors duration-150 ease-in-out hover:bg-surface-hover`}
                >
                  <div role="cell" className="min-w-0">
                    <Link to={`/monitors/${m.id}?${returnParam}`} className="group/m flex min-w-0 items-center gap-3">
                      <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[3px] border border-line-avatar bg-surface-avatar text-ink-400 transition-colors duration-150 ease-in-out group-hover/m:border-brand group-hover/m:text-brand">
                        <Radio size={14} />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-sans text-[12.5px] font-semibold text-ink-900 transition-colors duration-150 ease-in-out group-hover/m:text-brand-accent">{m.name}</div>
                        {m.host_name && <div className="truncate font-sans text-[11px] text-ink-300">{m.host_name}</div>}
                      </div>
                    </Link>
                  </div>

                  <MonitorStatusChip status={m.status} last_seen={m.last_seen} now={now} />

                  <div className="text-right font-sans text-[12px] text-ink-400">{formatLastSeen(m.last_seen, now)}</div>

                  <div className="flex justify-end"><DeviceCountLink id={m.id} count={m.device_count} returnParam={returnParam} /></div>

                  <div className="flex justify-end">
                    {!isReadOnlyViewer && <DeleteMonitorButton onClick={() => onDeleteClick({ id: m.id, name: m.name })} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <HifiPagination page={pg.page} totalPages={pg.totalPages} total={pg.total} pageSize={pg.pageSize} itemLabel="nodos" onPageChange={pg.setPage} />
      </div>
    </section>
  );
}
