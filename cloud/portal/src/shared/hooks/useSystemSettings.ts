import { usePolledResource } from './usePolledResource';
import { DEVICE_OFFLINE_THRESHOLD_MS, OFFLINE_THRESHOLD_MS } from '../lib/constants';

interface SystemSettingsResponse {
  agent_offline_threshold_minutes: number;
  device_offline_threshold_minutes: number;
}

const FALLBACK: SystemSettingsResponse = {
  agent_offline_threshold_minutes: OFFLINE_THRESHOLD_MS / 60_000,
  device_offline_threshold_minutes: DEVICE_OFFLINE_THRESHOLD_MS / 60_000,
};

/**
 * "Modelo unificado de umbrales" (26/08/2026) — lectura live de
 * `GET /settings/system` para cualquier pantalla que necesite pintar el
 * umbral de "sin señal" vigente, en vez de asumir el valor hardcodeado de
 * `constants.ts` (que ahora es sólo el fallback antes de que resuelva el
 * fetch, para no cambiar de opinión visualmente ni bloquear el render).
 * Cualquier rol autenticado puede leer `GET /settings/system`.
 */
export function useSystemSettings() {
  const { data } = usePolledResource<SystemSettingsResponse>('/settings/system', true, FALLBACK);
  return {
    agentOfflineThresholdMs: data.agent_offline_threshold_minutes * 60_000,
    deviceOfflineThresholdMs: data.device_offline_threshold_minutes * 60_000,
  };
}
