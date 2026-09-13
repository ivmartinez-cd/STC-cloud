import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';

/**
 * Habilitar/deshabilitar el acceso remoto a la web embebida (EWS) de los
 * equipos de un monitor. Es el interruptor del que depende la pestaña "EWS" de
 * la ficha de cada dispositivo: viene apagado de fábrica y sin él la nube ni
 * siquiera encola el pedido (403).
 *
 * PUT directo, sin optimistic locking y aparte del botón "Guardar cambios" de
 * la configuración (a diferencia de credenciales SNMP / horario laboral): es un
 * permiso, no un parámetro de monitoreo, y el backend lo audita por separado
 * (`REMOTE_EWS_TOGGLE`, distinto de cada uso `REMOTE_EWS_ACCESS`). Acumularlo
 * con el resto del formulario habría escondido ese cambio de permiso entre
 * ajustes de umbrales.
 */
/** Devuelve el mensaje de error, o `null` si salió bien. */
async function saveRemoteEws(agentId: string, enabled: boolean): Promise<string | null> {
  try {
    await api.put(`/agents/${agentId}/remote-ews`, { enabled });
    return null;
  } catch (e: unknown) {
    return e instanceof Error ? e.message : String(e);
  }
}

function toggleToast(failure: string | null, enabled: boolean): [string, 'error' | 'success'] {
  if (failure) return [`Error al cambiar el acceso remoto a EWS: ${failure}`, 'error'];
  return [enabled ? 'Acceso remoto a EWS habilitado para este monitor' : 'Acceso remoto a EWS deshabilitado', 'success'];
}

export function useRemoteEwsToggle(agentId: string | null | undefined, initial: boolean) {
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);

  // El valor llega con el fetch del monitor/agente, que puede resolver después del primer render.
  useEffect(() => { setEnabled(initial); }, [initial]);

  const toggle = useCallback(async () => {
    if (!agentId || saving) return;
    const next = !enabled;
    setSaving(true);
    const failure = await saveRemoteEws(agentId, next);
    if (!failure) setEnabled(next);
    setSaving(false);
    showToast(...toggleToast(failure, next));
  }, [agentId, enabled, saving, showToast]);

  return { enabled, saving, toggle };
}
