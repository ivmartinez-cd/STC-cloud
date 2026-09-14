import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../shared/lib/api';

/**
 * El flag es del AGENTE, no del equipo: `remote_ews_enabled` se habilita por
 * monitor (opt-in, default `false`).
 *
 * `null` = todavía no se sabe. Un error de red cae a `false` (fail-closed): más
 * vale mostrar "deshabilitado" y que el operador lo verifique en el monitor,
 * que ofrecer un botón que la nube va a rechazar con 403.
 */
export function useRemoteEwsFlag(agentId: string | null | undefined): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    if (!agentId) { setEnabled(false); return; }
    let alive = true;
    api.get<{ remote_ews_enabled?: boolean }>(`/agents/${agentId}`)
      .then((agent) => { if (alive) setEnabled(!!agent?.remote_ews_enabled); })
      .catch(() => { if (alive) setEnabled(false); });
    return () => { alive = false; };
  }, [agentId]);
  return enabled;
}

/**
 * Abre la EWS navegable en una pestaña nueva. La pestaña se abre ANTES del
 * fetch y se le asigna la URL después: si se abriera al volver la respuesta,
 * el navegador la trataría como popup no solicitado y la bloquearía (no hay
 * gesto del usuario en ese momento).
 *
 * El ticket dura 60 s y un solo uso, así que la URL no sirve para compartir.
 */
export function useEwsGateway(agentId: string | null | undefined, deviceId: string) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { close, closed, reset } = useCloseEwsSessions(agentId, setError);

  const open = useCallback(async () => {
    if (!agentId) return;
    const tab = openBlankTab();
    if (!tab) { setError('El navegador bloqueó la pestaña emergente. Permitila para este sitio y volvé a intentar.'); return; }
    setOpening(true); setError(null); reset();
    const failure = await navigateToGateway(tab, agentId, deviceId);
    setOpening(false);
    if (failure) { tab.close(); setError(failure); }
  }, [agentId, deviceId, reset]);

  return { opening, error, open, close, closed };
}

/**
 * Cierra todas las sesiones del monitor (no sólo la de este equipo): la
 * pestaña del EWS es la web del firmware y no tiene dónde poner un botón
 * nuestro, así que el cierre vive en la ficha. `closed` es cuántas había.
 */
function useCloseEwsSessions(agentId: string | null | undefined, setError: (m: string | null) => void) {
  const [closed, setClosed] = useState<number | null>(null);
  const close = useCallback(async () => {
    if (!agentId) return;
    setError(null);
    try {
      const { sessions_closed } = await api.delete<{ sessions_closed: number }>(`/agents/${agentId}/ews-session`);
      setClosed(sessions_closed);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [agentId, setError]);
  const reset = useCallback(() => setClosed(null), []);
  return { close, closed, reset };
}

/**
 * SIN `noopener`: con esa feature `window.open` devuelve null por spec, y
 * entonces no hay handle para navegar la pestaña — quedaba en blanco y el
 * fallback terminaba sacando al operador de la ficha. Se abre `about:blank`
 * ahora (con el gesto del usuario, si no el navegador la bloquea) y se le
 * asigna la URL cuando vuelve el ticket.
 *
 * Si el navegador la bloqueó, el caller avisa ANTES de pedir la sesión: NUNCA
 * se navega la pestaña actual (sacar al operador de la ficha sin que lo haya
 * pedido es peor que no abrir nada), y no se deja una sesión abierta y
 * auditada que nadie va a usar.
 */
function openBlankTab(): Window | null {
  return window.open('about:blank', '_blank');
}

/** Devuelve el mensaje de error, o `null` si la pestaña quedó apuntando al gateway. */
async function navigateToGateway(tab: Window, agentId: string, deviceId: string): Promise<string | null> {
  try {
    const { url } = await api.post<{ url: string }>(`/agents/${agentId}/ews-session`, { device_id: deviceId });
    tab.location.replace(url);
    return null;
  } catch (e: unknown) {
    return e instanceof Error ? e.message : String(e);
  }
}
