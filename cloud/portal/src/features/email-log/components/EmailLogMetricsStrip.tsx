import MetricsStrip, { type MetricCell } from '../../../shared/components/MetricsStrip';
import { fmt, fmtPct } from '../../../shared/lib/formatters';
import type { EmailLogSummary } from '../types/emailLog';

function buildCells(s: EmailLogSummary | null): MetricCell[] {
  return [
    { label: 'INTENTOS EN LA VENTANA', value: fmt(s?.intentos ?? 0), note: `${fmt(s?.entregados ?? 0)} entregados` },
    { label: 'SIN DESTINATARIO', value: fmt(s?.sinDestinatario ?? 0), accent: true, note: s ? `${fmtPct(s.sinDestinatario, s.intentos)} de los intentos` : undefined },
    { label: 'SIN SMTP', value: fmt(s?.sinSmtp ?? 0), accent: true, note: 'con destinatario válido' },
    { label: 'CLIENTES SIN CONTACTO', value: fmt(s?.clientesSinContacto ?? 0), accent: true, note: s ? `de ${fmt(s.clientesTotal)} en la red` : undefined },
    { label: 'REINTENTOS EN COLA', value: fmt(s?.reintentos ?? 0), note: 'sin servidor no reintenta' },
  ];
}

/** Tira de 5 métricas de Correo (handoff hifi #3, 26/08/2026) — reusa el
 * `MetricsStrip` compartido (ver `shared/components/MetricsStrip.tsx`). */
export default function EmailLogMetricsStrip({ summary, loading, error, onRetry }: {
  summary: EmailLogSummary | null; loading: boolean; error: boolean; onRetry: () => void;
}) {
  return <MetricsStrip cells={buildCells(summary)} loading={loading} error={error} onRetry={onRetry} />;
}
