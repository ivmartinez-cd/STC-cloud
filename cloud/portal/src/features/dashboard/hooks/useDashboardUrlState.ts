import { useUrlState, enumParam } from '../../../shared/hooks/useUrlState';
import { HOTSPOT_KINDS, TREND_RANGES, type HotspotKind, type TrendRange } from '../../../shared/types/monitor';

/**
 * Los dos controles del panel viven en la URL, no en `useState` — patrón
 * obligatorio del portal desde la auditoría de navegación del 12/09/2026:
 * así "volver" deshace el cambio de rango, un F5 conserva la vista y el panel
 * se puede compartir por link tal como se está mirando.
 *
 * Constante de módulo porque `useUrlState` necesita codecs estables.
 */
const CODECS = {
  range: enumParam<TrendRange>(TREND_RANGES, '7d'),
  by: enumParam<HotspotKind>(HOTSPOT_KINDS, 'device'),
};

type DashboardUrl = { [K in keyof typeof CODECS]: ReturnType<(typeof CODECS)[K]['parse']> };

export function useDashboardUrlState() {
  const [url, patch] = useUrlState<DashboardUrl>(CODECS);
  return {
    range: url.range,
    by: url.by,
    setRange: (range: TrendRange) => patch({ range }),
    setBy: (by: HotspotKind) => patch({ by }),
  };
}
