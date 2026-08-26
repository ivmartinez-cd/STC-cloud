import MetricsStrip, { type MetricCell } from '../../../shared/components/MetricsStrip';
import { fmt, fmtPct } from '../../../shared/lib/formatters';
import type { SuppliesSummaryResponse } from '../../../shared/types/supplies';

function buildCells(s: SuppliesSummaryResponse | null): MetricCell[] {
  return [
    { label: 'ÍTEMS MONITOREADOS', value: fmt(s?.total ?? 0), note: 'en toda la flota' },
    { label: 'CRÍTICOS · ≤15%', value: fmt(s?.criticalCount ?? 0), accent: true, note: 'reposición inmediata' },
    { label: 'NIVEL BAJO · ≤35%', value: fmt(s?.lowCount ?? 0), accent: true, note: 'próximos 30 días' },
    { label: 'SIN LECTURA SNMP', value: fmt(s?.noReadingCount ?? 0), note: s ? `${fmtPct(s.noReadingCount, s.total)} del total` : undefined },
    { label: 'PEDIDOS ABIERTOS', value: fmt(s?.openOrders ?? 0), note: 'ver Pedidos' },
  ];
}

/** Tira de 5 métricas de Consumibles (handoff hifi #3, fase 3, 26/08/2026). */
export default function SuppliesMetricsStrip({ summary, loading, error, onRetry }: {
  summary: SuppliesSummaryResponse | null; loading: boolean; error: boolean; onRetry: () => void;
}) {
  return <MetricsStrip cells={buildCells(summary)} loading={loading} error={error} onRetry={onRetry} />;
}
