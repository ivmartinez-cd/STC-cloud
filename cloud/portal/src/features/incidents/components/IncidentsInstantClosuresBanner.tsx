import type { IncidentInstantClosure } from '../../../shared/types/incidents';
import DiagnosticBanner from '../../../shared/components/DiagnosticBanner';
import { fmt } from '../../../shared/lib/formatters';

interface Props {
  instantClosures: IncidentInstantClosure[];
  classLabels: Record<string, string>;
}

/** "N incidentes automáticos se cierran en <1 minuto" (handoff hifi #3, fase 4)
 * — sólo la clase con más ruido, no una lista de todas (sería otro panel, no
 * un banner). "VER REGLA" navega al editor de reglas GLOBALES en
 * Configuración del sistema (`GlobalIncidentRulesCard`, cierre de gap
 * post-verificación 26/08/2026): el ruido de la MISMA clase repartido entre
 * varios clientes distintos casi siempre viene de la regla global default
 * heredada por todos, no de un override puntual — es el destino más útil
 * en la práctica, aunque `ruleId` no siempre resuelva a la fila global
 * exacta (un cliente con override propio para la misma clase no se
 * distingue acá; ver la fila de ese cliente en su propia Configuración si
 * el global no explica el ruido). */
export default function IncidentsInstantClosuresBanner({ instantClosures, classLabels }: Props) {
  const top = instantClosures[0];
  if (!top || top.count === 0) return null;
  const label = classLabels[top.class] ?? top.class;
  return (
    <DiagnosticBanner
      headline={`${fmt(top.count)} INCIDENTES AUTOMÁTICOS SE CIERRAN EN MENOS DE 1 MINUTO`}
      body={<>Se abren y cierran casi en el mismo instante. Son ruido de la regla de <strong className="font-semibold">{label}</strong>: revisá su condición de disparo (demora/auto-cierre) para que no genere pares abierto/cerrado.</>}
      cta={{ label: 'VER REGLA', to: '/settings#global-incident-rules' }}
    />
  );
}
