import { useState, useEffect } from 'react';
import { api } from '../../shared/lib/api';

/**
 * Badge de "Pendientes" (Fase 7 del gap analysis vs HP SDS) — reusa
 * GET /dashboard (ya scopeado por rol/cliente en el backend), sondeado cada
 * 60s. Sólo admin/operator ven el ítem de nav, así que no tiene sentido
 * pedirlo para un client_viewer. Comodidad: si falla, el badge no aparece.
 */
export function usePendingBadge(role: string): number {
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    if (role !== 'admin' && role !== 'operator') return;
    let cancelled = false;
    const fetchPending = () =>
      api.get<{ discovered?: { pendingTotal?: number } }>('/dashboard')
        .then((data) => { if (!cancelled) setPendingCount(data?.discovered?.pendingTotal ?? 0); })
        .catch(() => { /* badge opcional */ });
    void fetchPending();
    const interval = setInterval(fetchPending, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [role]);
  return pendingCount;
}
