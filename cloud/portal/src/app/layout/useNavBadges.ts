import { useState, useEffect } from 'react';
import { api } from '../../shared/lib/api';
import type { BadgeKey } from './navTree';

interface DashboardBadgeFields {
  stats?: { agents?: { total?: number; online?: number } };
  alertsOpenTotal?: number;
  discovered?: { pendingTotal?: number };
  incidents?: { openTotal?: number };
  supplyRequests?: { pending?: number };
}

export type NavBadges = Partial<Record<BadgeKey, number>>;

/**
 * Contadores del sidebar (handoff hifi "Sidebar", 26/08/2026) — reusa `GET
 * /dashboard` (ya scopeado por rol/cliente en el backend), un solo poll para
 * los cinco badges en vez de uno por pantalla. El handoff pide 30s para
 * Alertas y 60s para el resto; como comparten el mismo endpoint se sondea
 * todo a 30s. "Consumibles" y "Correo" quedan sin badge todavía: no hay una
 * consulta liviana para esos conteos (ver conversación de implementación).
 * Comodidad: si falla, los badges no aparecen (no rompe la barra).
 */
export function useNavBadges(role: string): NavBadges {
  const [badges, setBadges] = useState<NavBadges>({});

  useEffect(() => {
    let cancelled = false;
    const fetchBadges = () =>
      api.get<DashboardBadgeFields>('/dashboard')
        .then((data) => {
          if (cancelled) return;
          const isStaff = role === 'admin' || role === 'operator';
          setBadges({
            alerts: data?.alertsOpenTotal ?? 0,
            incidents: data?.incidents?.openTotal ?? 0,
            supplyRequests: data?.supplyRequests?.pending ?? 0,
            pending: isStaff ? data?.discovered?.pendingTotal ?? 0 : 0,
            agentsOffline: isStaff
              ? Math.max(0, (data?.stats?.agents?.total ?? 0) - (data?.stats?.agents?.online ?? 0))
              : 0,
          });
        })
        .catch(() => { /* badges opcionales */ });
    void fetchBadges();
    const interval = setInterval(fetchBadges, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [role]);

  return badges;
}
