import { Link } from 'react-router-dom';
import type { DashboardData } from '../../types/monitor';
import SdsPanel from './SdsPanel';
import MiniBar from './MiniBar';
import { fmtPct, pctOf } from '../../lib/formatters';

interface StatCell { label: string; value: string; to?: string; pct?: number }

function buildCells(s: DashboardData['stats'] | undefined): StatCell[] {
  const agents = s?.agents.total ?? 0;
  const online = s?.agents.online ?? 0;
  const reporting = s?.agents.reporting ?? 0;
  const devices = s?.devices ?? 0;
  const unmanaged = s?.devicesUnmanaged ?? 0;
  const devReporting = s?.devicesReporting ?? 0;
  const n = (v: number) => v.toLocaleString('es-AR');
  return [
    { label: 'Clientes', value: n(s?.clients ?? 0), to: '/clients' },
    { label: 'Monitores', value: n(agents), to: '/agents' },
    { label: 'Monitores en línea', value: `${n(online)} (${fmtPct(online, agents)})`, to: '/agents', pct: pctOf(online, agents) },
    { label: 'Monitores reportando', value: `${n(reporting)} (${fmtPct(reporting, agents)})`, to: '/agents', pct: pctOf(reporting, agents) },
    { label: 'Total dispositivos', value: n(devices), to: '/clients' },
    { label: 'Dispositivos reportando', value: `${n(devReporting)} (${fmtPct(devReporting, devices)})`, pct: pctOf(devReporting, devices) },
    { label: 'Gestionados', value: n(devices - unmanaged) },
    { label: 'No gestionados', value: n(unmanaged) },
    { label: 'Volumen mensual', value: n(s?.volume ?? 0), to: '/reports' },
  ];
}

function StatCellView({ cell }: { cell: StatCell }) {
  const body = (
    <span className="flex flex-col items-center gap-0.5 px-3 py-1.5 min-w-0">
      <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">{cell.label}</span>
      <span className="text-[13px] font-black text-[#1a2333] tabular-nums whitespace-nowrap">{cell.value}</span>
      {cell.pct != null && <MiniBar pct={cell.pct} />}
    </span>
  );
  return cell.to ? <Link to={cell.to} className="hover:bg-slate-50 rounded-lg transition-colors">{body}</Link> : body;
}

/** Franja "Statistics" del SDS: una sola fila de indicadores globales. */
export default function StatsStrip({ stats }: { stats: DashboardData['stats'] | undefined }) {
  return (
    <SdsPanel title="Estadísticas">
      <div className="flex flex-wrap items-stretch justify-between divide-x divide-slate-100">
        {buildCells(stats).map((c) => <StatCellView key={c.label} cell={c} />)}
      </div>
    </SdsPanel>
  );
}
