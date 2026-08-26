import { useNavigate } from 'react-router-dom';
import type { IncidentInstantClosure } from '../../../shared/types/incidents';
import DiagnosticBanner from '../../../shared/components/DiagnosticBanner';
import { fmt } from '../../../shared/lib/formatters';

interface Props {
  instantClosures: IncidentInstantClosure[];
  classLabels: Record<string, string>;
}

/** "N incidentes automáticos se cierran en <1 minuto" (handoff hifi #3, fase 4)
 * — sólo la clase con más ruido, no una lista de todas (sería otro panel, no
 * un banner). "VER REGLA" navega al cliente afectado con más incidentes de
 * esa clase, tab Configuración: ahí vive `IncidentRulesCard`, la única
 * edición de reglas que existe hoy (no hay un editor de la regla GLOBAL
 * como pantalla aparte — un cliente puede overridear la clase puntual desde
 * ahí, que es la acción real disponible). */
export default function IncidentsInstantClosuresBanner({ instantClosures, classLabels }: Props) {
  const navigate = useNavigate();
  const top = instantClosures[0];
  if (!top || top.count === 0) return null;
  const label = classLabels[top.class] ?? top.class;
  return (
    <DiagnosticBanner
      headline={`${fmt(top.count)} INCIDENTES AUTOMÁTICOS SE CIERRAN EN MENOS DE 1 MINUTO`}
      body={<>Se abren y cierran casi en el mismo instante. Son ruido de la regla de <strong className="font-semibold">{label}</strong>: revisá su condición de disparo (demora/auto-cierre) para que no genere pares abierto/cerrado.</>}
      cta={{ label: 'VER REGLA', onClick: () => navigate(`/clients/${top.sampleClientId}?tab=configuracion`) }}
    />
  );
}
