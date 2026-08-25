import type { SuppliesSummaryResponse } from '../../../shared/types/supplies';
import CounterPanel from './CounterPanel';

/** "Consumibles en alerta": críticos / bajos / total, con deep-link a
 * `/supplies`. Reemplaza la tabla de 8 columnas — el listado completo vive
 * en la página de consumibles, acá sólo los conteos (criterio SDS). */
export default function SuppliesPanel({ summary, className }: { summary: SuppliesSummaryResponse | null; className?: string }) {
  const critical = summary?.criticalCount ?? 0;
  const low = summary?.lowCount ?? 0;
  return (
    <CounterPanel
      title="Consumibles en alerta"
      to="/supplies"
      className={className}
      footer={critical + low === 0 ? '✔ Niveles óptimos en toda la flota' : undefined}
      cells={[
        { label: 'Críticos', value: critical, tone: 'rose', to: '/supplies' },
        { label: 'Nivel bajo', value: low, tone: 'amber', to: '/supplies' },
        { label: 'Total', value: critical + low, to: '/supplies' },
      ]}
    />
  );
}
