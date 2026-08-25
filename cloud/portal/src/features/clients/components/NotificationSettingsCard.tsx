import { useState } from 'react';
import { Bell, Mail, Webhook, Edit2, Save, X, Loader2 } from 'lucide-react';
import { useToast } from '../../../store/ToastContext';

/**
 * Canales de notificación por cliente (email + webhook para alertas críticas).
 * No existía ningún formulario de edición de cliente antes de esto — la única
 * escritura era `createClient`. Sólo admin/operator: `PUT /clients/:id` no está en
 * el allowlist de RBAC para client_viewer.
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

  const startEditing = () => {
    setEmailInput(email ?? '');
    setWebhookInput(webhookUrl ?? '');
    setEditing(true);
  };

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
    <div className="cd-panel p-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-black text-[#1a2333] tracking-tight flex items-center gap-3">
          <div className="p-2 bg-brand/10 text-brand rounded-xl"><Bell size={18} /></div>
          Notificaciones de Alertas
        </h3>
        {canEdit && !editing && (
          <button onClick={startEditing} className="p-2 text-slate-400 hover:text-brand hover:bg-brand/10 rounded-xl transition-all">
            <Edit2 size={16} />
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest ml-1">Email para alertas críticas</label>
            <div className="relative">
              <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
              <input type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)}
                placeholder="alertas@cliente.com"
                className="cd-input w-full !pl-9 !bg-slate-50/50 border-transparent focus:!bg-white focus:!border-brand text-sm" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest ml-1">Webhook (https)</label>
            <div className="relative">
              <Webhook size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
              <input type="text" value={webhookInput} onChange={(e) => setWebhookInput(e.target.value)}
                placeholder="https://..."
                className="cd-input w-full !pl-9 !bg-slate-50/50 border-transparent focus:!bg-white focus:!border-brand text-sm font-mono" />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button onClick={() => setEditing(false)} disabled={saving}
              className="flex-1 px-4 py-2.5 border border-slate-100 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2">
              <X size={14} /> Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 px-4 py-2.5 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-extrabold transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-4 group">
            <div className="p-2 bg-slate-50 text-slate-400 rounded-xl"><Mail size={16} /></div>
            <span className={`text-sm font-medium ${email ? 'text-slate-600' : 'text-slate-300 italic'}`}>
              {email || 'Sin configurar'}
            </span>
          </div>
          <div className="flex items-center gap-4 group">
            <div className="p-2 bg-slate-50 text-slate-400 rounded-xl"><Webhook size={16} /></div>
            <span className={`text-sm font-mono truncate ${webhookUrl ? 'text-slate-600' : 'text-slate-300 italic font-sans'}`}>
              {webhookUrl || 'Sin configurar'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
