import { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { BrandModal } from '../../../shared/components/BrandModal';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import {
  NEXT_STATUSES, SUPPLY_REQUEST_STATUS_COLORS, SUPPLY_REQUEST_STATUS_LABELS,
  type SupplyRequestDetail, type SupplyRequestStatus,
} from '../types/supplyRequests';

interface Props {
  requestId: string | null;
  onClose: () => void;
  onChanged: () => void;
  canManage: boolean;
}

const EVENT_LABELS: Record<string, string> = {
  status_change: 'Cambio de estado',
  comment: 'Comentario',
  auto_complete: 'Auto-completado',
};

function fmtDate(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Detalle + timeline + acciones de un pedido (Fase 4.2 gap analysis vs HP SDS). */
export default function SupplyRequestDetailModal({ requestId, onClose, onChanged, canManage }: Props) {
  const { showToast } = useToast();
  const [detail, setDetail] = useState<SupplyRequestDetail | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const load = (id: string) => {
    api.get<SupplyRequestDetail>(`/supply-requests/${id}`).then(setDetail).catch(() => setDetail(null));
  };

  useEffect(() => {
    setDetail(null);
    if (requestId) load(requestId);
  }, [requestId]);

  const setStatus = async (status: SupplyRequestStatus) => {
    if (!requestId) return;
    setBusy(true);
    try {
      await api.post(`/supply-requests/${requestId}/status`, { status });
      showToast(`Pedido → ${SUPPLY_REQUEST_STATUS_LABELS[status]}`, 'success');
      load(requestId);
      onChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  const sendComment = async () => {
    if (!requestId || !comment.trim()) return;
    setBusy(true);
    try {
      await api.post(`/supply-requests/${requestId}/comments`, { body: comment.trim() });
      setComment('');
      load(requestId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BrandModal isOpen={!!requestId} onClose={onClose} title="Pedido de consumible" widthPx={620}>
      {!detail ? (
        <div className="py-10 flex justify-center"><Loader2 size={24} className="text-brand animate-spin" /></div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-[#1a2333]">{detail.description ?? `${detail.supply_kind} ${detail.supply_color ?? ''}`}</p>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {detail.device_serial ?? 'Sin equipo'} · {detail.sku ?? 'Sin SKU'} ·
                {detail.level_pct != null ? ` ${detail.level_pct}% al abrir` : ' nivel s/d'}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${SUPPLY_REQUEST_STATUS_COLORS[detail.status]}`}>
              {SUPPLY_REQUEST_STATUS_LABELS[detail.status]}
            </span>
          </div>

          {canManage && NEXT_STATUSES[detail.status].length > 0 && (
            <div className="flex flex-wrap gap-2">
              {NEXT_STATUSES[detail.status].map((s) => (
                <button key={s} disabled={busy} onClick={() => setStatus(s)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50">
                  {SUPPLY_REQUEST_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          )}

          <div className="border-t border-slate-100 pt-3 max-h-64 overflow-y-auto space-y-2">
            {detail.events.map((e) => (
              <div key={e.id} className="text-xs">
                <span className="font-black text-slate-500 uppercase tracking-wider text-[9px]">
                  {EVENT_LABELS[e.kind] ?? e.kind} · {fmtDate(e.created_at)}
                </span>
                {e.body && <p className="text-slate-600 font-medium">{e.body}</p>}
              </div>
            ))}
          </div>

          {canManage && (
            <div className="flex gap-2">
              <input value={comment} onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendComment()}
                placeholder="Agregar comentario…"
                className="flex-1 bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand" />
              <button onClick={sendComment} disabled={busy || !comment.trim()}
                className="p-2.5 bg-brand/10 text-brand rounded-xl hover:bg-brand/20 transition-all disabled:opacity-50">
                <Send size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </BrandModal>
  );
}
