import { formatRelativeTime, APP_LOCALE } from '../../../shared/lib/formatters';
import type { MonitorData } from '../../../shared/types/monitor';
import type { AgentStats } from '../types/monitorDetail';

interface Props {
  monitor: MonitorData;
  now: number;
  stats: AgentStats | null;
  onViewDiagnostics?: () => void;
}

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

function formatSweep(iso: string | null, newCount: number): string {
  if (!iso) return 'sin barridos aún';
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString(APP_LOCALE, { hour: '2-digit', minute: '2-digit' });
  const base = isToday ? `Hoy ${time}` : `${d.toLocaleDateString(APP_LOCALE)} ${time}`;
  return newCount > 0 ? `${base} · ${newCount} nuevo${newCount === 1 ? '' : 's'}` : base;
}

/** "Estado del monitor" (handoff hifi "Monitor — detalle", 25/08/2026) — valores
 * técnicos (agente, host, IP, subred) en JetBrains Mono; el resto en Source Sans. */
export default function MonitorSpecsCard({ monitor, now, stats, onViewDiagnostics }: Props) {
  const rows: Array<{ label: string; value: string; mono: boolean }> = [
    { label: 'APLICACIÓN REMOTA', value: 'STC Cloud Agent', mono: true },
    { label: 'VERSIÓN', value: monitor.version || '—', mono: false },
    { label: 'ESTADO', value: STATUS_TEXT[monitor.status] ?? monitor.status, mono: false },
    { label: 'NOMBRE DEL HOST', value: monitor.host_name || '—', mono: true },
    { label: 'SISTEMA OPERATIVO', value: monitor.host_os || '—', mono: false },
    { label: 'DIRECCIÓN IP', value: monitor.host_ip || '—', mono: true },
    { label: 'SUBRED BARRIDA', value: subredBarrida(monitor), mono: true },
    { label: 'ÚLTIMO BARRIDO', value: formatSweep(stats?.last_sweep_at ?? null, stats?.last_sweep_new_count ?? 0), mono: false },
    { label: 'ÚLTIMO CONTACTO', value: formatRelativeTime(monitor.last_seen, now), mono: false },
  ];

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
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4 border-b border-line-200 py-[9px] last:border-b-0">
            <span className="whitespace-nowrap font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">{r.label}</span>
            <span
              className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-right ${
                r.mono ? 'font-mono text-[12px] text-ink-900' : 'font-sans text-[12.5px] font-semibold text-ink-900'
              }`}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
