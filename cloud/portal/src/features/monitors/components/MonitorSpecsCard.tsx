import { TriangleAlert } from 'lucide-react';
import { fmt, formatRelativeTime, APP_LOCALE } from '../../../shared/lib/formatters';
import { updateChannelInfo } from '../lib/updateChannel';
import type { MonitorData } from '../../../shared/types/monitor';
import type { AgentDiscoveryState, AgentStats } from '../types/monitorDetail';

interface Props {
  monitor: MonitorData;
  now: number;
  stats: AgentStats | null;
  onViewDiagnostics?: () => void;
}

interface SpecRow { label: string; value: string; mono: boolean; warning?: string | null }

const STATUS_TEXT: Record<string, string> = {
  active: 'Activo · telemetría en curso',
  offline: 'Inactivo · sin señal',
  revoked: 'Revocado',
  pending: 'Pendiente de activación',
};

function subredBarrida(monitor: MonitorData): string {
  const ranges = monitor.config?.ip_ranges ?? [];
  if (ranges.length === 0) return '—';
  const [first] = ranges;
  const label = first.cidr ? first.cidr : (first.start && first.end) ? `${first.start} – ${first.end}` : '—';
  return ranges.length > 1 ? `${label} (+${ranges.length - 1})` : label;
}

/** Barrido MANUAL: sale de un comando RESCAN/FORCE_SCAN que disparó un
 *  operador (`agent_commands`). El "manual" es explícito desde que la ficha
 *  también muestra el barrido automático del agente, que es otra cosa
 *  (`formatDiscovery`): con el nombre viejo, un agente barriendo sano se leía
 *  como "sin barridos aún". */
function formatSweep(iso: string | null, newCount: number): string {
  if (!iso) return 'sin barridos manuales aún';
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString(APP_LOCALE, { hour: '2-digit', minute: '2-digit' });
  const base = isToday ? `Hoy ${time}` : `${d.toLocaleDateString(APP_LOCALE)} ${time}`;
  return newCount > 0 ? `${base} · ${newCount} nuevo${newCount === 1 ? '' : 's'}` : base;
}

/** Barrido AUTOMÁTICO continuo (`discovery_state` del heartbeat: el agente
 *  recorre sus rangos por chunks con cursor persistido). Con una vuelta en
 *  curso lo que importa es el avance; parada, el tamaño del barrido y cuándo
 *  cerró la última vuelta. */
function formatDiscovery(state: AgentDiscoveryState, now: number): string {
  if (state.in_progress) return `${fmt(state.scanned)}/${fmt(state.total)} IPs`;
  const lap = state.last_lap_at
    ? `última vuelta ${formatRelativeTime(state.last_lap_at, now).toLowerCase()}`
    : 'sin vuelta completa aún';
  return `${fmt(state.total)} IPs · ${lap}`;
}

function specRows(monitor: MonitorData, now: number, stats: AgentStats | null): SpecRow[] {
  const discovery = stats?.discovery_state ?? null;
  const channel = updateChannelInfo(monitor.channel, monitor.runtime);
  return [
    { label: 'APLICACIÓN REMOTA', value: 'STC Cloud Agent', mono: true },
    { label: 'VERSIÓN', value: monitor.version || '—', mono: false },
    { label: 'CANAL DE ACTUALIZACIÓN', value: channel.value, mono: true, warning: channel.warning },
    { label: 'ESTADO', value: STATUS_TEXT[monitor.status] ?? monitor.status, mono: false },
    { label: 'NOMBRE DEL HOST', value: monitor.host_name || '—', mono: true },
    { label: 'SISTEMA OPERATIVO', value: monitor.host_os || '—', mono: false },
    { label: 'DIRECCIÓN IP', value: monitor.host_ip || '—', mono: true },
    { label: 'SUBRED BARRIDA', value: subredBarrida(monitor), mono: true },
    // Sólo si el agente lo reporta: uno viejo (o una API anterior al campo) no
    // manda `discovery_state` y la ficha queda igual que antes, sin fila fantasma.
    ...(discovery ? [{ label: 'BARRIDO AUTOMÁTICO', value: formatDiscovery(discovery, now), mono: false }] : []),
    { label: 'BARRIDO MANUAL', value: formatSweep(stats?.last_sweep_at ?? null, stats?.last_sweep_new_count ?? 0), mono: false },
    { label: 'ÚLTIMO CONTACTO', value: formatRelativeTime(monitor.last_seen, now), mono: false },
  ];
}

/** Una fila con su aviso debajo cuando el dato es contradictorio (hoy: canal
 *  declarado vs. runtime real). El aviso va en la fila y no en un banner
 *  aparte porque sólo se entiende pegado al valor que lo produce. */
const SpecRowLine = ({ row }: { row: SpecRow }) => (
  <div className="border-b border-line-200 py-[9px] short:py-[5px] last:border-b-0">
    <div className="flex items-baseline justify-between gap-4">
      <span className="whitespace-nowrap font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">{row.label}</span>
      <span
        className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-right ${
          row.warning ? 'font-mono text-[12px] font-semibold text-severity-critical'
            : row.mono ? 'font-mono text-[12px] text-ink-900' : 'font-sans text-[12.5px] font-semibold text-ink-900'
        }`}
      >
        {row.warning && <TriangleAlert size={12} className="mr-1 inline align-[-2px]" />}
        {row.value}
      </span>
    </div>
    {row.warning && (
      <p className="mt-1 font-sans text-[11.5px] leading-[1.45] text-severity-critical">{row.warning}</p>
    )}
  </div>
);

/** "Estado del monitor" (handoff hifi "Monitor — detalle", 25/08/2026) — valores
 * técnicos (agente, host, IP, subred) en JetBrains Mono; el resto en Source Sans. */
export default function MonitorSpecsCard({ monitor, now, stats, onViewDiagnostics }: Props) {
  return (
    <div className="flex h-full flex-col rounded-[5px] border border-line-100 bg-white">
      <div className="flex items-baseline justify-between px-5 py-3.5">
        <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Estado del monitor</span>
        {onViewDiagnostics && (
          <button
            type="button" onClick={onViewDiagnostics}
            className="font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          >
            Ver diagnóstico →
          </button>
        )}
      </div>
      <div className="flex-1 px-5 pb-4 pt-1">
        {specRows(monitor, now, stats).map((r) => <SpecRowLine key={r.label} row={r} />)}
      </div>
    </div>
  );
}
