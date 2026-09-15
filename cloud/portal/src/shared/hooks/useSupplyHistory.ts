import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useLatestRequest } from './useLatestRequest';
import type { SupplyHistory } from '../types/supplyHistory';

interface Target {
  deviceId: string;
  supplyKey: string;
}

export interface SupplyHistoryState {
  history: SupplyHistory | null;
  loading: boolean;
  /** `true` sólo si la API falló; un consumible sin serie NO es un error (llega con `points: []`). */
  error: boolean;
  reload: () => void;
}

/**
 * Carga el detalle histórico de UN consumible (modal "Detalles del
 * consumible"). Una sola llamada: el backend devuelve la serie diaria
 * completa y el selector 12M/24M/TODO recorta en el navegador, así que
 * cambiar de ventana no vuelve a pegarle a la API.
 */
export function useSupplyHistory(target: Target | null): SupplyHistoryState {
  const [history, setHistory] = useState<SupplyHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const beginRequest = useLatestRequest();

  const load = useCallback(async (t: Target) => {
    const isLatest = beginRequest();
    setLoading(true);
    setError(false);
    try {
      const data = await api.get<SupplyHistory>(
        `/devices/${t.deviceId}/supply-history?key=${encodeURIComponent(t.supplyKey)}`
      );
      if (!isLatest()) return;
      setHistory(data);
    } catch {
      if (!isLatest()) return;
      setHistory(null);
      setError(true);
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [beginRequest]);

  useEffect(() => {
    if (!target) { setHistory(null); setError(false); return; }
    void load(target);
  }, [target?.deviceId, target?.supplyKey, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(() => { if (target) void load(target); }, [target, load]);

  return { history, loading, error, reload };
}
