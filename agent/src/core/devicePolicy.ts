import type { AgentConfig } from './config';

/**
 * Fase 10 del gap analysis vs HP SDS — honrar `monitor_state`/
 * `registration_state` del lado agente. Fail-open a propósito: un estado
 * desconocido o ausente de `devicePolicies` es 'full' (comportamiento de
 * siempre) — un agente nunca deja de monitorear un equipo por un bug de
 * matching acá; el cloud sigue siendo la autoridad real (ya filtra en
 * Fase 5/7), esto sólo ahorra tráfico/CPU del agente.
 */
export type DevicePolicyState = 'full' | 'supplies_only' | 'reports_only' | 'disabled' | 'ignored';

const KNOWN_STATES: ReadonlySet<string> = new Set(['full', 'supplies_only', 'reports_only', 'disabled', 'ignored']);

export function policyFor(config: AgentConfig, ip: string): DevicePolicyState {
  const entry = config.devicePolicies?.find((p) => p.ip === ip);
  const state = entry?.state;
  return state && KNOWN_STATES.has(state) ? (state as DevicePolicyState) : 'full';
}
