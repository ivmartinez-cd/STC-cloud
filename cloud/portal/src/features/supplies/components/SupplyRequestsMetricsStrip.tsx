import MetricsStrip, { type MetricCell } from '../../../shared/components/MetricsStrip';
import { fmt } from '../../../shared/lib/formatters';
import type { SupplyRequestStats } from '../types/supplyRequests';

function buildCells(s: SupplyRequestStats | null): MetricCell[] {
  const pending = s?.pending ?? 0;
  const inProgress = (s?.reviewed ?? 0) + (s?.processed ?? 0);
  const window = s?.window;
  const automationPct = window && window.completed > 0 ? Math.round((window.autoCount / window.completed) * 100) : null;
  return [
    { label: 'PENDIENTES', value: fmt(pending), accent: pending > 0, note: 'esperan confirmación' },
    { label: 'EN CURSO', value: fmt(inProgress), note: 'consultadas o procesadas' },
    { label: 'COMPLETADAS (30 D)', value: fmt(window?.completed ?? 0), note: 'reemplazo detectado solo' },
    { label: 'AUTOMATIZACIÓN', value: automationPct != null ? `${automationPct}%` : '—', note: window ? `${fmt(window.autoCount)} de ${fmt(window.completed)} sin intervención` : undefined },
  ];
}

/** Tira de 4 métricas de Pedidos (handoff hifi #3, fase 3, 26/08/2026). */
export default function SupplyRequestsMetricsStrip({ stats, loading }: { stats: SupplyRequestStats | null; loading: boolean }) {
  return <MetricsStrip cells={buildCells(stats)} loading={loading} error={false} onRetry={() => {}} />;
}
