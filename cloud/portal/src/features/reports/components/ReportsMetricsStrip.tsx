import MetricsStrip, { type MetricCell } from '../../../shared/components/MetricsStrip';
import { fmtInt } from '../lib/reportsPresentation';
import type { ReportsPageState } from '../hooks/useReportsPage';

function cellsFor(k: ReportsPageState['kpis']): MetricCell[] {
  const colorPct = k.totalPages > 0 ? Math.round((k.totalColor / k.totalPages) * 100) : 0;
  return [
    { label: 'TOTAL FACTURABLE', value: fmtInt(k.totalPages), note: 'páginas del período' },
    { label: 'MONOCROMO', value: fmtInt(k.totalMono), note: k.totalPages > 0 ? `${100 - colorPct}% del volumen` : '' },
    { label: 'COLOR', value: fmtInt(k.totalColor), note: k.totalColor > 0 ? `${colorPct}% del volumen` : 'sin equipos color' },
    { label: 'EQUIPOS FACTURADOS', value: fmtInt(k.deviceCount), note: 'con lectura en el período' },
    { label: 'CON ANOMALÍA', value: fmtInt(k.anomalies), note: 'delta estimado', accent: k.anomalies > 0 },
  ];
}

/** Tira de 5 (handoff hifi #3, fase 5) — derivada de las filas ya cargadas
 * (preview o cierre), nunca un fetch aparte: son las mismas 52 filas que
 * ve la tabla de abajo, no un resumen que pueda desincronizarse. */
export default function ReportsMetricsStrip({ s }: { s: ReportsPageState }) {
  return <MetricsStrip cells={cellsFor(s.kpis)} loading={s.loading} error={!!s.error} onRetry={s.fetchRows} />;
}
