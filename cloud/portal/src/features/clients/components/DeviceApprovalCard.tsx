import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';

interface PendingDevice { id: string; }
interface PendingDevicesResponse { items: PendingDevice[]; total: number; }

/**
 * "Registro de dispositivos" de la zona "Requiere atención" (handoff hifi
 * "Cliente — detalle", 25/08/2026) — cola real de `GET/POST
 * /clients/:id/pending-devices*` (Fase 7 del gap analysis), no sólo el toggle de
 * `device_approval_required` que tenía antes esta tarjeta.
 */
export default function DeviceApprovalCard({
  clientId, canEdit, requireApproval, onToggleRequireApproval,
}: {
  clientId: string;
  canEdit: boolean;
  /** Opt-in: si está activo, un equipo nuevo descubierto por un agente de este
   * cliente queda pendiente hasta que un operador lo registre (antes, todo el
   * contenido de esta tarjeta). */
  requireApproval: boolean;
  onToggleRequireApproval: (value: boolean) => Promise<void>;
}) {
  const { showToast } = useToast();
  const [pending, setPending] = useState<PendingDevice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [togglingApproval, setTogglingApproval] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get<PendingDevicesResponse>(`/clients/${clientId}/pending-devices?limit=500`)
      .then((d) => { setPending(d.items ?? []); setTotal(d.total ?? 0); })
      .catch(() => { setPending([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const approveAll = async () => {
    if (pending.length === 0) return;
    setApproving(true);
    try {
      await api.post(`/clients/${clientId}/pending-devices/register`, { deviceIds: pending.map((d) => d.id) });
      showToast(`${pending.length} equipo(s) registrado(s)`, 'success');
      load();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error al aprobar', 'error');
    } finally {
      setApproving(false);
    }
  };

  const toggleRequireApproval = async () => {
    setTogglingApproval(true);
    try {
      await onToggleRequireApproval(!requireApproval);
      showToast(!requireApproval ? 'Aprobación de nuevos equipos activada' : 'Aprobación de nuevos equipos desactivada', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error al guardar', 'error');
    } finally {
      setTogglingApproval(false);
    }
  };

  return (
    <div className="rounded-[5px] border border-line-100 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-line-150 px-5 py-3.5">
        <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Registro de dispositivos</span>
        <span className="inline-flex items-center gap-[7px] rounded-[2px] bg-brand-soft px-[9px] py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-brand-accent">
          <span className="block h-1.5 w-1.5 rounded-full bg-brand" />
          {loading ? '…' : `${total} pendiente${total === 1 ? '' : 's'}`}
        </span>
      </div>
      <div className="px-5 pb-[18px] pt-4">
        <p className="mb-3.5 max-w-[52ch] font-sans text-[12.5px] leading-[1.55] text-ink-100">
          Los equipos descubiertos por el agente de red quedan en espera de aprobación. Al aprobarlos se incorporan
          al inventario y comienzan a reportar consumo y alertas.
        </p>
        {canEdit && (
          <div className="flex gap-2.5">
            <button
              type="button" onClick={approveAll} disabled={approving || total === 0}
              className="flex items-center gap-2 rounded-[3px] bg-brand px-3.5 py-2.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50"
            >
              {approving && <Loader2 size={12} className="animate-spin" />} Aprobar {total}
            </button>
            <Link
              to={`/pending?client_id=${clientId}`}
              className="rounded-[3px] border border-line-300 px-3.5 py-2.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover"
            >
              Ver cola
            </Link>
          </div>
        )}
        <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-line-200 pt-3">
          <span className="font-sans text-[11.5px] text-ink-400">Exigir aprobación para equipos nuevos</span>
          <button
            type="button" onClick={toggleRequireApproval} disabled={!canEdit || togglingApproval}
            className={`rounded-full px-2.5 py-1 font-montserrat text-[9px] font-semibold uppercase tracking-wider transition-all disabled:opacity-50 ${
              requireApproval ? 'border border-brand-chip-border bg-brand-soft text-brand-accent' : 'border border-line-300 bg-surface-avatar text-ink-100'
            }`}
          >
            {togglingApproval ? <Loader2 size={11} className="animate-spin" /> : requireApproval ? 'Activo' : 'Inactivo'}
          </button>
        </div>
      </div>
    </div>
  );
}
