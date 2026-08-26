import { useState } from 'react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import type { PendingQueueActionResult } from '../types/pendingDevices';

type Toast = (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;

function reportSkips(showToast: Toast, skipped: PendingQueueActionResult['skipped']) {
  if (skipped.length > 0) showToast(`${skipped.length} equipo(s) no se pudieron procesar`, 'warning');
}

/** Cuerpo común de aprobar/ignorar — separado del hook para no cruzar el
 * límite de 20 líneas/función de la guía. Devuelve `true`/`false` (éxito): el
 * caller lo usa para decidir si cierra su modal (p.ej. `IgnoreReasonModal`
 * sólo cierra si `ignore` resolvió bien) — nunca un éxito silencioso parcial,
 * `reportSkips` siempre avisa de lo que quedó afuera. */
async function runAction(
  showToast: Toast, onDone: () => void, path: string, body: Record<string, unknown>,
  countOf: (r: PendingQueueActionResult) => number, successVerb: string, errorFallback: string,
): Promise<boolean> {
  try {
    const result = await api.post<PendingQueueActionResult>(path, body);
    showToast(`${countOf(result)} equipo(s) ${successVerb}`, 'success');
    reportSkips(showToast, result.skipped);
    onDone();
    return true;
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : errorFallback, 'error');
    return false;
  }
}

/** Aprobar/ignorar sobre la cola cross-cliente — cada id resuelve su propio
 * `client_id` en el backend (`ApprovePendingQueueUseCase`/`IgnorePendingQueueUseCase`),
 * el front sólo manda la lista de ids. */
export function usePendingQueueActions(onDone: () => void) {
  const { showToast } = useToast();
  const [acting, setActing] = useState(false);

  const approve = async (deviceIds: string[]): Promise<boolean> => {
    setActing(true);
    const ok = await runAction(showToast, onDone, '/devices/pending/approve', { deviceIds }, (r) => r.approved ?? 0, 'aprobado(s)', 'Error al aprobar');
    setActing(false);
    return ok;
  };

  const ignore = async (deviceIds: string[], reason: string): Promise<boolean> => {
    setActing(true);
    const ok = await runAction(showToast, onDone, '/devices/pending/ignore', { deviceIds, reason }, (r) => r.ignored ?? 0, 'ignorado(s)', 'Error al ignorar');
    setActing(false);
    return ok;
  };

  return { acting, approve, ignore };
}
