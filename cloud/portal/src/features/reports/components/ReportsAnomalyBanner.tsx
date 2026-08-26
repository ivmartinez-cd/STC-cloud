import DiagnosticBanner from '../../../shared/components/DiagnosticBanner';
import { fmtInt } from '../lib/reportsPresentation';
import type { ReportRow } from '../lib/reportsPresentation';

interface Props { rows: ReportRow[]; onViewCalc: () => void }

/** Banner de anomalía (handoff hifi #3, fase 5) — sólo si hay equipos con
 * reset de contador. "VER CÁLCULO" hace scroll a la tabla, donde cada fila
 * anómala ya lleva el chip "RESET DE CONTADOR": no hay un desglose de
 * cálculo aparte (día a día del histórico) todavía, así que el link real es
 * "andá a ver esas filas", no una promesa de detalle que no existe. */
export default function ReportsAnomalyBanner({ rows, onViewCalc }: Props) {
  const anomalous = rows.filter((r) => r.hadCounterReset);
  if (anomalous.length === 0) return null;
  const sample = anomalous[0];
  const estimated = sample.deltaEstimated != null && sample.deltaEstimated > 0;
  const label = sample.model || sample.serial || 'un equipo';
  const plural = anomalous.length > 1;
  return (
    <DiagnosticBanner
      headline={`${fmtInt(anomalous.length)} EQUIPO${plural ? 'S' : ''} CON RESET DE CONTADOR${estimated ? ' — DELTA ESTIMADO' : ''}`}
      body={
        plural
          ? <>El contador se reinició durante el período en {fmtInt(anomalous.length)} equipos. {estimated ? 'El delta de los afectados es una estimación a partir del histórico diario, no una resta de lecturas.' : 'No hay histórico previo suficiente para estimar — el delta de esos equipos queda subcontado.'} Revisá antes de facturar.</>
          : <><strong className="font-semibold">{label}</strong> cerró en {sample.lastTotal ?? '—'} habiendo abierto en {sample.firstTotal ?? '—'}: el contador se reinició durante el período. {estimated ? <>El delta de {fmtInt(sample.deltaEstimated!)} páginas es una estimación a partir del histórico diario, no una resta de lecturas.</> : 'No hay histórico previo suficiente para estimar — el delta queda subcontado.'} Revisá antes de facturar.</>
      }
      cta={{ label: 'VER CÁLCULO', onClick: onViewCalc }}
    />
  );
}
