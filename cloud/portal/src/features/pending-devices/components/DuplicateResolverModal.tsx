import { useEffect, useState } from 'react';
import { api } from '../../../shared/lib/api';
import { MergeDeviceModal } from '../../../shared/components/DeviceLifecycleModals/MergeDeviceModal';
import { useToast } from '../../../store/ToastContext';
import type { PendingQueueRow } from '../types/pendingDevices';

interface DuplicatePair { a_id: string; b_id: string }

/** El equipo YA REGISTRADO que matchea el serial del pendiente (mismo par que
 * ya detectó `revision==='duplicado'` server-side, vía `GET /devices/duplicates`
 * — la misma consulta que usa `DuplicateDevicesCard`/`MergeDeviceModal`). */
async function findExistingCounterpart(pending: PendingQueueRow): Promise<string | null> {
  if (!pending.client_id) return null;
  const pairs = await api.get<DuplicatePair[]>(`/devices/duplicates?client_id=${pending.client_id}`);
  const pair = pairs.find((p) => p.a_id === pending.id || p.b_id === pending.id);
  if (!pair) return null;
  return pair.a_id === pending.id ? pair.b_id : pair.a_id;
}

function candidatesOf(deviceIds: string[], rows: PendingQueueRow[]): PendingQueueRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return deviceIds.map((id) => byId.get(id)).filter((r): r is PendingQueueRow => !!r && r.revision === 'duplicado');
}

interface Props { isOpen: boolean; onClose: () => void; onDone: () => void; deviceIds: string[]; rows: PendingQueueRow[] }

/** Arma la cola de candidatos al abrir — avisa de los que se saltean (nada que
 * fusionar) y cierra sin más si ninguno califica. */
function useResolverEntry(isOpen: boolean, deviceIds: string[], rows: PendingQueueRow[], onClose: () => void, setQueue: (q: PendingQueueRow[]) => void, setIndex: (i: number) => void) {
  const { showToast } = useToast();
  useEffect(() => {
    if (!isOpen) return;
    const candidates = candidatesOf(deviceIds, rows);
    const skipped = deviceIds.length - candidates.length;
    if (skipped > 0) showToast(`${skipped} equipo(s) sin duplicado detectado, no requieren fusión`, 'info');
    if (candidates.length === 0) { onClose(); return; }
    setQueue(candidates);
    setIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
}

/** Resuelve el `deviceId` (target) del paso actual — separado del componente
 * para no cruzar el límite de 20 líneas/función. Cierra el resolver cuando la
 * cola se termina; salta al siguiente si no encuentra contraparte. */
function useTargetResolution(
  queue: PendingQueueRow[], index: number, setTargetId: (id: string | null) => void,
  advance: () => void, onClose: () => void, onDone: () => void,
) {
  useEffect(() => {
    if (queue.length === 0) return;
    if (index >= queue.length) { onClose(); onDone(); return; }
    setTargetId(null);
    findExistingCounterpart(queue[index]).then((id) => { if (id) setTargetId(id); else advance(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, index]);
}

/**
 * "FUSIONAR CON EXISTENTE" en bloque no existe como endpoint — cada duplicado
 * resuelve contra un equipo YA REGISTRADO distinto (no hay fusión masiva
 * posible). Este resolver abre `MergeDeviceModal` una vez por seleccionado con
 * `revision==='duplicado'`, en secuencia ("Resolviendo N de M"), pasándole el
 * equipo YA REGISTRADO como `deviceId` — `MergeDeviceModal` fusiona SIEMPRE
 * hacia el `deviceId` que se le pasa (queda como target/sobreviviente), así
 * que debe ser el registrado y NUNCA el recién descubierto: fusionar al revés
 * dejaría al equipo con historial real como lápida.
 */
export default function DuplicateResolverModal({ isOpen, onClose, onDone, deviceIds, rows }: Props) {
  const [queue, setQueue] = useState<PendingQueueRow[]>([]);
  const [index, setIndex] = useState(0);
  const [targetId, setTargetId] = useState<string | null>(null);
  useResolverEntry(isOpen, deviceIds, rows, onClose, setQueue, setIndex);
  const advance = () => setIndex((i) => i + 1);
  useTargetResolution(queue, index, setTargetId, advance, onClose, onDone);

  if (!isOpen || queue.length === 0 || index >= queue.length || !targetId) return null;
  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[210] flex justify-center pt-3">
        <div className="rounded-[3px] border border-brand-chip-border bg-brand-soft px-4 py-2 font-montserrat text-[10.5px] font-semibold uppercase tracking-[.08em] text-brand-accent shadow-sm">
          Resolviendo {index + 1} de {queue.length} posibles duplicados
        </div>
      </div>
      <MergeDeviceModal isOpen onClose={advance} onDone={advance} deviceId={targetId} clientId={queue[index].client_id} />
    </>
  );
}
