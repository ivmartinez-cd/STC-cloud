import { useParams } from 'react-router-dom';
import type { Client, Monitor, UsageMonth } from '../../../shared/types/monitor';
import type { ClientDetailStats } from '../types/clientDetail';
import { currentMonthDelta } from '../lib/usageMonths';
import { OFFLINE_THRESHOLD_MS } from '../../../shared/lib/constants';
import { fmt, APP_LOCALE } from '../../../shared/lib/formatters';
import { useAuth } from '../../../store/AuthContext';
import { useDuplicateDevices } from '../hooks/useDuplicateDevices';

interface Cell { label: string; value: string; note?: string; accent?: boolean; contact?: { name: string; email: string } | null; }

function Metric({ cell, first }: { cell: Cell; first: boolean }) {
  return (
    <div className={`bg-white ${first ? 'px-6' : 'border-l border-line-400 px-5'} pb-4 pt-3.5`}>
      <div className="font-montserrat text-[8px] font-bold uppercase leading-[1.3] tracking-[.13em] text-ink-300">{cell.label}</div>
      {cell.contact ? (
        <>
          <div className="mt-1 font-sans text-[13px] font-semibold leading-[1.35] text-ink-900">{cell.contact.name}</div>
          <div className="font-sans text-[11px] leading-[1.3] text-ink-300">{cell.contact.email}</div>
        </>
      ) : (
        <>
          <div className={`font-montserrat text-[21px] font-bold leading-[1.35] tabular-nums ${cell.accent ? 'text-brand-severe' : 'text-ink-900'}`}>
            {cell.value}
          </div>
          <div className={`font-sans text-[11px] leading-[1.3] ${cell.accent ? 'text-brand-severe' : 'text-ink-300'}`}>{cell.note}</div>
        </>
      )}
    </div>
  );
}

/** Celda de "Duplicados sin resolver" — separada para que su recuento (fetch propio,
 * ver `useDuplicateDevices`) no bloquee el resto de la tira si el endpoint (sólo
 * admin/operator) no está disponible para este rol. */
function DuplicatesCell() {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  const canSee = role !== 'client_viewer';
  const { candidates } = useDuplicateDevices(id ?? '', canSee);
  const count = canSee ? candidates.length : 0;
  return (
    <Metric
      cell={{
        label: 'Duplicados sin resolver', value: fmt(count), accent: count > 0,
        note: count > 0 ? 'requieren decisión' : '—',
      }}
      first={false}
    />
  );
}

/** Tira de 6 métricas del handoff hifi "Cliente — detalle" (25/08/2026) — reemplaza
 * las 3 cifras sueltas de antes. `auto-fit` la reflow 6→3→2→1 (README), divisorias
 * por `border-left` (no gap-as-divider: con recuentos que no dividen 6 quedan huecos). */
export default function ClientMetricsCards({
  client, monitors, usage, stats,
}: {
  client: Client;
  monitors: Monitor[];
  usage: UsageMonth[];
  stats: ClientDetailStats | null;
}) {
  const now = Date.now();
  const monitorsOffline = monitors.filter((m) => m.last_seen === null || now - new Date(m.last_seen).getTime() > OFFLINE_THRESHOLD_MS).length;
  const { total: volumeMonth, deltaPct, previousMonthLabel } = currentMonthDelta(usage);

  const cells: Cell[] = [
    { label: 'Dispositivos', value: fmt(client.device_count), note: stats ? `${fmt(stats.managed_device_count)} gestionados` : undefined },
    {
      label: 'Monitores', value: fmt(monitors.length),
      note: monitorsOffline > 0 ? `${fmt(monitorsOffline)} sin conexión` : 'todos con reporte reciente',
      accent: monitorsOffline > 0,
    },
    {
      label: 'Volumen del mes', value: fmt(volumeMonth),
      note: deltaPct !== null && previousMonthLabel
        ? `páginas · ${deltaPct >= 0 ? '+' : ''}${deltaPct.toLocaleString(APP_LOCALE, { maximumFractionDigits: 1 })}% vs ${previousMonthLabel}`
        : 'páginas',
    },
    {
      label: 'Alertas abiertas', value: fmt(stats?.alerts_open_count ?? 0), accent: (stats?.alerts_open_count ?? 0) > 0,
      note: stats ? `${fmt(stats.alerts_availability_count)} de disponibilidad` : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-0 border-t border-line-100">
      {cells.map((c, i) => <Metric key={c.label} cell={c} first={i === 0} />)}
      <DuplicatesCell />
      <Metric
        cell={{ label: 'Contacto directo', value: '', contact: client.contact_name ? { name: client.contact_name, email: client.contact_email ?? '' } : null }}
        first={false}
      />
    </div>
  );
}
