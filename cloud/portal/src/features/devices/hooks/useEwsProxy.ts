import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../shared/lib/api';
import { useLatestRequest } from '../../../shared/hooks/useLatestRequest';
import { EWS_PATH_MAX_LENGTH, normalizeEwsPath } from '../lib/ewsPaths';
import type { EwsProxyResponse } from '../lib/ewsResponse';

/**
 * El backend espera hasta 15 s a que el agente conteste por WSS
 * (`EwsProxyUseCase`), y el agente corta su propio GET a la impresora a los
 * 10 s. Con el timeout por defecto del portal (15 s) el navegador abortaba
 * justo en el empate y el operador veía "La solicitud tardó demasiado" en vez
 * del error real que el backend estaba por devolver.
 */
const EWS_TIMEOUT_MS = 30_000;

/**
 * El flag es del AGENTE, no del equipo: `remote_ews_enabled` se habilita por
 * monitor (opt-in, default `false`). Se pide aparte de `useEwsProxy` a
 * propósito: la pestaña decide con esto si siquiera monta el panel de consulta,
 * así que montarlo no puede volver a pedir lo mismo.
 *
 * `null` = todavía no se sabe. Un error de red cae a `false` (fail-closed): más
 * vale mostrar "deshabilitado" y que el operador lo verifique en el monitor,
 * que ofrecer una consulta que la nube va a rechazar con 403.
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

interface EwsRequestState {
  loading: boolean;
  error: string | null;
  result: EwsProxyResponse | null;
  /** La ruta YA normalizada de la última consulta: lo que se muestra en la cabecera del resultado. */
  lastPath: string | null;
}

const IDLE: EwsRequestState = { loading: false, error: null, result: null, lastPath: null };

/**
 * Nunca tira: el error del backend (403 flag apagado, 409 equipo con datos
 * viejos, 502 timeout del agente, 503 agente desconectado) ya viene redactado
 * para el operador, así que se muestra tal cual en vez de traducirlo acá.
 */
async function runEwsRequest(agentId: string, deviceId: string, path: string): Promise<Pick<EwsRequestState, 'error' | 'result'>> {
  if (path.length > EWS_PATH_MAX_LENGTH) {
    return { result: null, error: `La ruta supera los ${EWS_PATH_MAX_LENGTH} caracteres que acepta el agente.` };
  }
  try {
    const page = await api.post<EwsProxyResponse>(`/agents/${agentId}/ews-proxy`, { device_id: deviceId, path }, { timeoutMs: EWS_TIMEOUT_MS });
    return { result: page, error: null };
  } catch (e: unknown) {
    return { result: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Una consulta puntual a la web embebida de un equipo, por el túnel sobre el
 * WSS ya existente (sección 10 de la auditoría de IT). Cada llamada es un GET
 * suelto y auditado — no hay sesión de túnel abierta que mantener, así que no
 * hay nada que cerrar al desmontar más allá de descartar la respuesta en vuelo
 * (`useLatestRequest`: dos consultas encadenadas y la lenta pisaba a la nueva).
 */
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

  const open = useCallback(async () => {
    if (!agentId) return;
    // SIN `noopener`: con esa feature `window.open` devuelve null por spec, y
    // entonces no hay handle para navegar la pestaña — quedaba en blanco y el
    // fallback terminaba sacando al operador de la ficha. Se abre `about:blank`
    // ahora (con el gesto del usuario, si no el navegador la bloquea) y se le
    // asigna la URL cuando vuelve el ticket.
    const tab = window.open('about:blank', '_blank');
    setOpening(true); setError(null);
    const failure = await navigateToGateway(tab, agentId, deviceId);
    setOpening(false);
    if (failure) { tab?.close(); setError(failure); }
  }, [agentId, deviceId]);

  return { opening, error, open };
}

/** Devuelve el mensaje de error, o `null` si la pestaña quedó apuntando al gateway. */
async function navigateToGateway(tab: Window | null, agentId: string, deviceId: string): Promise<string | null> {
  try {
    const { url } = await api.post<{ url: string }>(`/agents/${agentId}/ews-session`, { device_id: deviceId });
    // Si el navegador bloqueó la pestaña, se avisa — NUNCA se navega la actual:
    // sacar al operador de la ficha sin que lo haya pedido es peor que no abrir nada.
    if (!tab) return 'El navegador bloqueó la pestaña emergente. Permitila para este sitio y volvé a intentar.';
    tab.location.replace(url);
    return null;
  } catch (e: unknown) {
    return e instanceof Error ? e.message : String(e);
  }
}

export function useEwsProxy(agentId: string | null | undefined, deviceId: string) {
  const [state, setState] = useState<EwsRequestState>(IDLE);
  const beginRequest = useLatestRequest();

  const request = useCallback(async (raw: string) => {
    if (!agentId) return;
    const path = normalizeEwsPath(raw);
    const isLatest = beginRequest();
    setState({ ...IDLE, loading: true, lastPath: path });
    const outcome = await runEwsRequest(agentId, deviceId, path);
    if (isLatest()) setState({ ...outcome, loading: false, lastPath: path });
  }, [agentId, deviceId, beginRequest]);

  return { ...state, request };
}
