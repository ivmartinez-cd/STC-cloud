import { useState, useEffect, useCallback } from 'react';
import { KeyRound, Trash2, Loader2, X, Copy, Check, Webhook, RefreshCw, Save } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import ConfirmModal from '../../../shared/components/ConfirmModal';
import ConfigCardShell from './ConfigCardShell';
import type { ApiKeyRecord, WebhookConfig, PublicApiEvent } from '../../../shared/types/monitor';

const EVENT_LABELS: Record<PublicApiEvent, string> = {
  'reading.created': 'Lecturas nuevas',
  'alert.created': 'Alertas nuevas',
  'report.closed': 'Cierres de reporte',
};

/** Modal "mostrar una sola vez" tras crear una key — mismo criterio que RegenKeyModal.tsx (agente). */
function NewKeyModal({ name, apiKey, onClose }: { name: string; apiKey: string; onClose: () => void }) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-[#1a2333]/80 backdrop-blur-md animate-overlay-in">
      <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden animate-modal-in">
        <header className="px-10 py-8 bg-gradient-to-r from-brand to-amber-400 text-white flex justify-between items-center relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-2xl font-black tracking-tight uppercase">Nueva API Key</h2>
            <p className="text-[10px] font-black text-white/70 uppercase tracking-[0.2em] mt-1">{name}</p>
          </div>
          <button onClick={onClose} className="relative z-10 p-3 hover:bg-white/20 rounded-2xl transition-all active:scale-90">
            <X size={28} />
          </button>
          <div className="absolute -right-8 -top-8 opacity-20"><KeyRound size={140} /></div>
        </header>

        <div className="p-10 space-y-8">
          <div className="flex gap-4 bg-amber-50 border border-amber-100 rounded-[28px] p-6">
            <p className="text-sm font-bold text-amber-800">
              Este valor no se puede volver a mostrar. Copialo y guardalo en un lugar seguro antes de cerrar esta ventana.
            </p>
          </div>

          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">API Key</p>
            <div className="relative group">
              <div className="p-8 bg-[#1a2333] rounded-[28px] font-mono text-center shadow-inner border border-white/5">
                <div className="text-lg text-white font-black tracking-widest break-all select-all">{apiKey}</div>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(apiKey);
                  setCopied(true);
                  showToast('Key copiada al portapapeles', 'success');
                  setTimeout(() => setCopied(false), 3000);
                }}
                className="absolute right-4 top-4 p-3 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition-all active:scale-90"
                title="Copiar"
              >
                {copied ? <Check size={20} className="text-emerald-400" /> : <Copy size={20} />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={onClose}
              className="px-10 py-4 bg-[#1a2333] text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-[#58595b] transition-all active:scale-95">
              Ya la guardé
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const ALL_EVENTS: PublicApiEvent[] = ['reading.created', 'alert.created', 'report.closed'];

function WebhookSection({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const { showToast } = useToast();
  const [config, setConfig] = useState<WebhookConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [events, setEvents] = useState<Set<PublicApiEvent>>(new Set(ALL_EVENTS));
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get<WebhookConfig>(`/clients/${clientId}/webhook`)
      .then(setConfig)
      .catch(() => setConfig(null))
      .finally(() => setLoading(false));
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const startEditing = () => {
    setUrlInput(config?.url ?? '');
    setEvents(new Set(config?.events ?? ALL_EVENTS));
    setEditing(true);
  };

  const toggleEvent = (ev: PublicApiEvent) => {
    setEvents((prev) => {
      const next = new Set(prev);
      if (next.has(ev)) next.delete(ev); else next.add(ev);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.put<WebhookConfig>(`/clients/${clientId}/webhook`, {
        url: urlInput.trim(),
        events: Array.from(events),
        active: true,
      });
      setConfig(updated);
      showToast('Webhook actualizado', 'success');
      setEditing(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateSecret = async () => {
    setSaving(true);
    try {
      const updated = await api.put<WebhookConfig>(`/clients/${clientId}/webhook`, { regenerate_secret: true });
      setConfig(updated);
      showToast('Secret regenerado — actualizá la verificación de firma del lado del ERP', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error al regenerar', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-xs font-semibold text-slate-400">Cargando webhook…</p>;

  return (
    <div className="pt-6 mt-6 border-t border-slate-100">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <Webhook size={14} /> Webhook de Integración
        </h4>
        {canEdit && !editing && (
          <button onClick={startEditing} className="text-[11px] font-extrabold text-brand hover:text-brand-hover">
            {config ? 'Editar' : 'Configurar'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          <input type="text" value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://erp.cliente.com/webhooks/stc"
            className="cd-input w-full !bg-slate-50/50 border-transparent focus:!bg-white focus:!border-brand text-sm font-mono" />
          <div className="flex flex-wrap gap-2">
            {ALL_EVENTS.map((ev) => (
              <button key={ev} type="button" onClick={() => toggleEvent(ev)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider transition-all border ${
                  events.has(ev) ? 'bg-brand/10 text-brand border-brand/30' : 'bg-slate-50 text-slate-400 border-slate-100'
                }`}>
                {EVENT_LABELS[ev]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button onClick={() => setEditing(false)} disabled={saving}
              className="flex-1 px-4 py-2.5 border border-slate-100 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-extrabold transition-all">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving || !urlInput.trim()}
              className="flex-1 px-4 py-2.5 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-extrabold transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
            </button>
          </div>
        </div>
      ) : config ? (
        <div className="space-y-3">
          <p className="text-sm font-mono text-slate-600 truncate">{config.url}</p>
          <div className="flex flex-wrap gap-2">
            {config.events.map((ev) => (
              <span key={ev} className="px-2.5 py-1 bg-slate-50 text-slate-500 text-[10px] font-extrabold uppercase tracking-wider rounded-full">
                {EVENT_LABELS[ev] ?? ev}
              </span>
            ))}
          </div>
          {canEdit && (
            <div className="flex items-center gap-2 pt-1">
              <code className="flex-1 text-[11px] font-mono text-slate-400 bg-slate-50 px-3 py-2 rounded-lg truncate">
                {showSecret ? config.secret : '•'.repeat(24)}
              </code>
              <button onClick={() => setShowSecret((v) => !v)} className="text-[10px] font-extrabold text-slate-500 hover:text-brand shrink-0">
                {showSecret ? 'Ocultar' : 'Ver secret'}
              </button>
              <button onClick={handleRegenerateSecret} disabled={saving}
                title="Regenerar secret" className="p-1.5 text-slate-400 hover:text-brand hover:bg-brand/10 rounded-lg transition-all shrink-0">
                <RefreshCw size={13} className={saving ? 'animate-spin' : ''} />
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-300 italic">Sin configurar</p>
      )}
    </div>
  );
}

/**
 * API keys + webhook de integración ERP por cliente (Fase 2 — API pública).
 * Sólo admin/operator: ninguna de estas rutas está en CLIENT_VIEWER_ROUTES.
 */
export default function ApiKeysCard({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const { showToast } = useToast();
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [newKeyModal, setNewKeyModal] = useState<{ name: string; key: string } | null>(null);
  const [keyToRevoke, setKeyToRevoke] = useState<ApiKeyRecord | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get<ApiKeyRecord[]>(`/clients/${clientId}/api-keys`)
      .then(setKeys)
      .catch(() => setKeys([]))
      .finally(() => setLoading(false));
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const created = await api.post<{ id: string; key: string; name: string }>(`/clients/${clientId}/api-keys`, { name: newName.trim() });
      setNewKeyModal({ name: created.name, key: created.key });
      setNewName('');
      setCreating(false);
      load();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error al crear la key', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!keyToRevoke) return;
    setBusy(true);
    try {
      await api.delete(`/clients/${clientId}/api-keys/${keyToRevoke.id}`);
      showToast(`Key "${keyToRevoke.name}" revocada`, 'success');
      setKeyToRevoke(null);
      load();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error al revocar', 'error');
    } finally {
      setBusy(false);
    }
  };

  const activeKeys = keys.filter((k) => !k.revoked_at);

  return (
    <ConfigCardShell
      title="API pública / integración ERP"
      status={{ label: activeKeys.length > 0 ? `${activeKeys.length} activa${activeKeys.length === 1 ? '' : 's'}` : 'SIN CONFIGURAR', active: activeKeys.length > 0 }}
      meta={activeKeys.length > 0 ? `${activeKeys.length} clave(s) activa(s)` : 'Sin claves activas'}
      cta={{ label: 'Generar token', onClick: () => setCreating(true) }}
    >
      <p className="mb-3.5 font-sans text-[12.5px] leading-[1.55] text-ink-100">
        Sincronizá inventario y consumos con el ERP del cliente mediante token de API.
      </p>

      {creating && (
        <div className="flex items-center gap-2 mb-4">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre (ej. Integración SAP)"
            className="cd-input flex-1 !bg-slate-50/50 border-transparent focus:!bg-white focus:!border-brand text-sm" />
          <button onClick={handleCreate} disabled={busy || !newName.trim()}
            className="px-4 py-2.5 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-extrabold transition-all disabled:opacity-60">
            {busy ? <Loader2 size={14} className="animate-spin" /> : 'Crear'}
          </button>
          <button onClick={() => { setCreating(false); setNewName(''); }} className="p-2.5 text-slate-400 hover:bg-slate-50 rounded-xl">
            <X size={16} />
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-xs font-semibold text-slate-400">Cargando…</p>
      ) : activeKeys.length === 0 ? (
        <p className="text-sm text-slate-300 italic">Sin API keys activas</p>
      ) : (
        <div className="space-y-2">
          {activeKeys.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-3 py-2 group">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-700 truncate">{k.name}</p>
                <p className="text-[10px] font-mono text-slate-400">
                  {k.key_prefix}… {k.last_used_at ? `· usada ${new Date(k.last_used_at).toLocaleDateString('es-AR')}` : '· nunca usada'}
                </p>
              </div>
              {canEdit && (
                <button onClick={() => setKeyToRevoke(k)}
                  className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100 shrink-0">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <WebhookSection clientId={clientId} canEdit={canEdit} />

      {newKeyModal && (
        <NewKeyModal name={newKeyModal.name} apiKey={newKeyModal.key} onClose={() => setNewKeyModal(null)} />
      )}

      <ConfirmModal
        isOpen={keyToRevoke !== null}
        onClose={() => setKeyToRevoke(null)}
        onConfirm={handleRevoke}
        title="Revocar API Key"
        message={`¿Revocar "${keyToRevoke?.name}"? Cualquier integración que la use empezará a recibir 401 de inmediato.`}
        confirmText="Revocar"
        isDanger
        isLoading={busy}
      />
    </ConfigCardShell>
  );
}
