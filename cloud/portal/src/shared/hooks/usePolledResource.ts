import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

const POLL_MS = 60_000; // README: "resto cada 60 s" (aparte del poll de 30/45s de contacto)

function usePollingEffect(load: () => void, enabled: boolean) {
  useEffect(() => {
    load();
    if (!enabled) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load, enabled]);
}

/** Hook genérico "cargar, sondear, reintentar" para un bloque de pantalla que
 * carga y falla de forma INDEPENDIENTE del resto (README: "Cada tarjeta carga
 * y falla de forma independiente"). `enabled=false` evita pedir endpoints
 * fuera del allowlist de un rol (ej. `client_viewer` contra `/activity`).
 *
 * Promovido de `features/monitors/hooks/useMonitorOverview.ts` — mismo
 * patrón reusado por el detalle de Dispositivo. */
export function usePolledResource<T>(path: string, enabled: boolean, fallback: T) {
  const [state, setState] = useState<{ data: T; loading: boolean; error: boolean }>({ data: fallback, loading: enabled, error: false });
  const load = useCallback(() => {
    if (!enabled) { setState((s) => ({ ...s, loading: false })); return; }
    setState((s) => ({ ...s, loading: true, error: false }));
    api.get<T>(path)
      .then((data) => setState({ data, loading: false, error: false }))
      .catch(() => setState((s) => ({ ...s, loading: false, error: true })));
  }, [path, enabled]);
  usePollingEffect(load, enabled);
  return { ...state, refetch: load };
}
