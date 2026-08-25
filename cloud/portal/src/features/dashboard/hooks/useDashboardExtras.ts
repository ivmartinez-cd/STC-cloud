import { useEffect, useState } from 'react';
import { api } from '../../../shared/lib/api';
import type { SuppliesSummaryResponse } from '../../../shared/types/supplies';

export interface IncidentStats { byStatus: Record<string, number>; openTotal: number }

/** Contadores del Dashboard que NO viajan en `/dashboard` (endpoints propios
 * de cada módulo): incidencias, pedidos de consumibles y resumen de
 * consumibles. Se cargan una vez por montaje — no encarecen el polling de
 * `useDashboard`, mismo criterio que tenía `Dashboard.tsx` antes. */
export function useDashboardExtras() {
  const [incidents, setIncidents] = useState<IncidentStats | null>(null);
  const [supplyRequests, setSupplyRequests] = useState<Record<string, number> | null>(null);
  const [supplies, setSupplies] = useState<SuppliesSummaryResponse | null>(null);

  useEffect(() => {
    api.get<IncidentStats>('/incidents/stats').then(setIncidents).catch(() => setIncidents(null));
    api.get<Record<string, number>>('/supply-requests/stats').then(setSupplyRequests).catch(() => setSupplyRequests(null));
    api.get<SuppliesSummaryResponse>('/supplies/summary').then(setSupplies).catch(() => setSupplies(null));
  }, []);

  return { incidents, supplyRequests, supplies };
}
