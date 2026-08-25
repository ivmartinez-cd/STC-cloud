import { useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import { useToast } from '../../../store/ToastContext';

const ROW = 'flex items-center justify-between gap-3 border-b border-line-200 py-2 last:border-0 font-sans text-[12.5px]';

/**
 * "Notificaciones de alertas" de la zona "Requiere atención" (handoff hifi
 * "Cliente — detalle", 25/08/2026). El prototipo muestra "Destinatario principal /
 * Copia / Frecuencia" pero el modelo real sólo tiene `notification_email` +
 * `notification_webhook_url` (no hay "copia" ni "frecuencia" configurable en el
 * backend — la frecuencia es siempre inmediata salvo el resumen diario opt-in de
 * `NotificationEventsCard`) — se muestran los 2 campos reales, no se inventan los
 * otros 2 del prototipo.
 */
export default function NotificationSettingsCard({
  email, webhookUrl, canEdit, onSave,
}: {
  email: string | null;
  webhookUrl: string | null;
  canEdit: boolean;
  onSave: (fields: { notification_email: string; notification_webhook_url: string }) => Promise<void>;
}) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [emailInput, setEmailInput] = useState(email ?? '');
  const [webhookInput, setWebhookInput] = useState(webhookUrl ?? '');
  const [saving, setSaving] = useState(false);

  const startEditing = () => { setEmailInput(email ?? ''); setWebhookInput(webhookUrl ?? ''); setEditing(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ notification_email: emailInput.trim(), notification_webhook_url: webhookInput.trim() });
      showToast('Canales de notificación actualizados', 'success');
      setEditing(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[5px] border border-line-100 bg-white">
      <div className="flex items-baseline justify-between gap-3 border-b border-line-150 px-5 py-3.5">
        <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Notificaciones de alertas</span>
        {canEdit && !editing && (
          <button type="button" onClick={startEditing} className="font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline">
            Editar
          </button>
        )}
      </div>
      <div className="px-5 pb-4 pt-3">
        {editing ? (
          <div className="space-y-3">
            <input type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="alertas@cliente.com"
              className="cd-input w-full !bg-slate-50/50 border-transparent text-sm focus:!border-brand focus:!bg-white" />
            <input type="text" value={webhookInput} onChange={(e) => setWebhookInput(e.target.value)} placeholder="https://webhook..."
              className="cd-input w-full !bg-slate-50/50 border-transparent font-mono text-sm focus:!border-brand focus:!bg-white" />
            <div className="flex items-center gap-2 pt-1">
              <button type="button" onClick={() => setEditing(false)} disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-100 px-4 py-2 text-xs font-extrabold text-slate-600 hover:bg-slate-50">
                <X size={13} /> Cancelar
              </button>
              <button type="button" onClick={handleSave} disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-extrabold text-white hover:bg-brand-hover disabled:opacity-60">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={ROW}>
              <span className="text-ink-700">Email de alertas</span>
              <span className={email ? 'font-semibold text-ink-900' : 'text-ink-200'}>{email || 'Sin asignar'}</span>
            </div>
            <div className={ROW}>
              <span className="text-ink-700">Webhook</span>
              <span className={`truncate max-w-[220px] ${webhookUrl ? 'font-mono text-[11.5px] text-ink-900' : 'text-ink-200'}`}>{webhookUrl || 'Sin asignar'}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
