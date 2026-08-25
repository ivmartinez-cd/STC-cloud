import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserCheck, Loader2 } from 'lucide-react';
import { useToast } from '../../../store/ToastContext';

/**
 * Cola de registro de dispositivos (Fase 7 del gap analysis vs HP SDS) — opt-in
 * por cliente. Prendido, un equipo NUEVO descubierto por el agente entra
 * `pending` (sigue mandando lecturas, sólo queda afuera de inventario/alertas/
 * facturación hasta que un operador lo registre desde `/pending`). Sólo afecta
 * a lo que se descubra DESPUÉS de prenderlo — nunca reclasifica equipos ya
 * `registered`.
 */
export default function DeviceApprovalCard({
  enabled, canEdit, onSave, clientId,
}: {
  enabled: boolean;
  canEdit: boolean;
  onSave: (value: boolean) => Promise<void>;
  clientId: string;
}) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    setSaving(true);
    try {
      await onSave(!enabled);
      showToast(!enabled ? 'Cola de registro activada' : 'Cola de registro desactivada', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cd-panel p-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-black text-[#1a2333] tracking-tight flex items-center gap-3">
          <div className="p-2 bg-brand/10 text-brand rounded-xl"><UserCheck size={18} /></div>
          Registro de Dispositivos
        </h3>
        <Link to={`/pending?client_id=${clientId}`} className="text-[10px] font-extrabold uppercase tracking-widest text-brand hover:underline">
          Ver cola
        </Link>
      </div>
      <div className="flex items-center gap-4">
        <p className="flex-1 text-xs text-slate-500 font-medium leading-relaxed">
          Si está activo, un equipo nuevo descubierto por un agente de este cliente queda pendiente de aprobación
          (sigue reportando, pero no cuenta en inventario, alertas ni facturación) hasta que un operador lo registre.
        </p>
        <button
          type="button"
          onClick={toggle}
          disabled={!canEdit || saving}
          className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider transition-all disabled:opacity-50 ${
            enabled ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'
          }`}
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : enabled ? 'Activo' : 'Inactivo'}
        </button>
      </div>
    </div>
  );
}
