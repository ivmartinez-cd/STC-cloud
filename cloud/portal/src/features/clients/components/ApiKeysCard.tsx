import { useState, useEffect, useCallback } from 'react';
import { Trash2, Loader2, X, Copy, Check, Webhook, RefreshCw, Save } from 'lucide-react';
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-overlay-in" style={{ background: 'rgba(20,20,20,.55)' }}>
      <div style={{ boxShadow: '0 20px 60px rgba(0,0,0,.25)' }} className="w-full max-w-2xl overflow-hidden rounded-[5px] bg-white animate-modal-in">
        <header className="flex items-center justify-between border-b border-line-150 px-6 py-4">
          <div>
            <h2 className="font-montserrat text-[18px] font-extrabold tracking-[-.01em] text-ink-900">Nueva API Key</h2>
            <p className="mt-0.5 font-sans text-[11.5px] text-ink-300">{name}</p>
          </div>
          <button onClick={onClose} className="rounded-[3px] p-1.5 text-ink-300 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover hover:text-ink-600">
            <X size={20} />
          </button>
        </header>

        <div className="space-y-6 px-6 py-6">
          <div className="flex gap-3.5 rounded-[3px] border border-brand-chip-border bg-brand-soft p-3.5">
            <p className="font-sans text-[13px] leading-[1.55] text-brand-severe">
              Este valor no se puede volver a mostrar. Copialo y guardalo en un lugar seguro antes de cerrar esta ventana.
            </p>
          </div>

          <div>
            <p className="mb-1.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">API Key</p>
            <div className="relative">
              <div className="rounded-[5px] bg-brand-charcoal p-6 text-center font-mono">
                <div className="select-all break-all text-[16px] font-bold tracking-widest text-white">{apiKey}</div>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(apiKey);
                  setCopied(true);
                  showToast('Key copiada al portapapeles', 'success');
                  setTimeout(() => setCopied(false), 3000);
                }}
                className="absolute right-3 top-3 rounded-[3px] p-2 text-white/60 transition-colors duration-150 ease-in-out hover:bg-white/10 hover:text-white"
                title="Copiar"
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={onClose}
              className="rounded-[3px] bg-brand px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe">
              Ya la guardé
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const ALL_EVENTS: PublicApiEvent[] = ['reading.created', 'alert.created', 'report.closed'];

/** '' = sin vencimiento (comportamiento de siempre). */
const EXPIRY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Sin vencimiento' },
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
  { value: '365', label: '1 año' },
];

function isExpired(k: ApiKeyRecord): boolean {
  return !!k.expires_at && new Date(k.expires_at).getTime() <= Date.now();
}

function ApiKeyRow({ k, canEdit, onRevoke }: { k: ApiKeyRecord; canEdit: boolean; onRevoke: (k: ApiKeyRecord) => void }) {
  const expired = isExpired(k);
  return (
    <div className="group flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate font-sans text-[13px] font-semibold text-ink-900">
          {k.name}
          {expired && (
            <span className="ml-2 rounded-[2px] bg-brand-soft px-1.5 py-0.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.08em] text-brand-severe">Vencida</span>
          )}
        </p>
        <p className="font-mono text-[10.5px] text-ink-300">
          {k.key_prefix}… {k.last_used_at ? `· usada ${new Date(k.last_used_at).toLocaleDateString('es-AR')}` : '· nunca usada'}
          {k.expires_at && ` · ${expired ? 'venció' : 'vence'} ${new Date(k.expires_at).toLocaleDateString('es-AR')}`}
        </p>
      </div>
      {canEdit && (
        <button onClick={() => onRevoke(k)}
          className="shrink-0 rounded-[3px] p-2 text-ink-200 opacity-0 transition-colors duration-150 ease-in-out hover:bg-brand-soft hover:text-brand-severe group-hover:opacity-100">
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}

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

  if (loading) return <p className="font-sans text-[12.5px] text-ink-300">Cargando webhook…</p>;

  return (
    <div className="mt-6 border-t border-line-150 pt-5">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="flex items-center gap-2 font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">
          <Webhook size={13} className="text-ink-300" /> Webhook de integración
        </h4>
        {canEdit && !editing && (
          <button onClick={startEditing} className="font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline">
            {config ? 'Editar' : 'Configurar'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3.5">
          <input type="text" value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://erp.cliente.com/webhooks/stc"
            className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-mono text-[12.5px] text-ink-900 outline-none focus:border-brand" />
          <div className="flex flex-wrap gap-2">
            {ALL_EVENTS.map((ev) => (
              <button key={ev} type="button" onClick={() => toggleEvent(ev)}
                className={`rounded-[2px] border px-3 py-1.5 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] transition-colors duration-150 ease-in-out ${
                  events.has(ev) ? 'border-brand-chip-border bg-brand-soft text-brand-accent' : 'border-line-300 bg-white text-ink-300 hover:bg-surface-btn-hover'
                }`}>
                {EVENT_LABELS[ev]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2.5 pt-1">
            <button onClick={() => setEditing(false)} disabled={saving}
              className="flex-1 rounded-[3px] border border-line-300 bg-white px-4 py-2.5 font-montserrat text-[10.5px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving || !urlInput.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-[3px] bg-brand px-4 py-2.5 font-montserrat text-[10.5px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-60">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar
            </button>
          </div>
        </div>
      ) : config ? (
        <div className="space-y-3">
          <p className="truncate font-mono text-[12.5px] text-ink-700">{config.url}</p>
          <div className="flex flex-wrap gap-2">
            {config.events.map((ev) => (
              <span key={ev} className="rounded-[2px] bg-surface-avatar px-2.5 py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-ink-650">
                {EVENT_LABELS[ev] ?? ev}
              </span>
            ))}
          </div>
          {canEdit && (
            <div className="flex items-center gap-2 pt-1">
              <code className="flex-1 truncate rounded-[3px] bg-surface-input px-3 py-2 font-mono text-[11.5px] text-ink-300">
                {showSecret ? config.secret : '•'.repeat(24)}
              </code>
              <button onClick={() => setShowSecret((v) => !v)} className="shrink-0 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-300 hover:text-brand-accent">
                {showSecret ? 'Ocultar' : 'Ver secret'}
              </button>
              <button onClick={handleRegenerateSecret} disabled={saving}
                title="Regenerar secret" className="shrink-0 rounded-[3px] p-1.5 text-ink-300 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover hover:text-brand-accent">
                <RefreshCw size={13} className={saving ? 'animate-spin' : ''} />
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="font-sans text-[12.5px] italic text-ink-200">Sin configurar</p>
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
  const [newExpiry, setNewExpiry] = useState('');
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
      const created = await api.post<{ id: string; key: string; name: string }>(`/clients/${clientId}/api-keys`, {
        name: newName.trim(),
        ...(newExpiry ? { expires_in_days: Number(newExpiry) } : {}),
      });
      setNewKeyModal({ name: created.name, key: created.key });
      setNewName('');
      setNewExpiry('');
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

  // "Activa" de verdad: ni revocada ni vencida. Una vencida sigue LISTADA
  // (el admin necesita verla para renovarla) pero no cuenta para el header.
  const visibleKeys = keys.filter((k) => !k.revoked_at);
  const activeCount = visibleKeys.filter((k) => !isExpired(k)).length;

  return (
    <ConfigCardShell
      title="API pública / integración ERP"
      status={{ label: activeCount > 0 ? `${activeCount} activa${activeCount === 1 ? '' : 's'}` : 'SIN CONFIGURAR', active: activeCount > 0 }}
      meta={activeCount > 0 ? `${activeCount} clave(s) activa(s)` : 'Sin claves activas'}
      cta={{ label: 'Generar token', onClick: () => setCreating(true) }}
    >
      <p className="mb-3.5 font-sans text-[12.5px] leading-[1.55] text-ink-100">
        Sincronizá inventario y consumos con el ERP del cliente mediante token de API.
      </p>

      {creating && (
        <div className="mb-4 flex items-center gap-2">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre (ej. Integración SAP)"
            className="flex-1 rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[13px] text-ink-900 outline-none focus:border-brand" />
          <select value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)}
            className="shrink-0 rounded-[3px] border border-line-300 bg-white px-2.5 py-2.5 font-sans text-[12.5px] text-ink-900 outline-none focus:border-brand">
            {EXPIRY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button onClick={handleCreate} disabled={busy || !newName.trim()}
            className="rounded-[3px] bg-brand px-4 py-2.5 font-montserrat text-[10.5px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-60">
            {busy ? <Loader2 size={14} className="animate-spin" /> : 'Crear'}
          </button>
          <button onClick={() => { setCreating(false); setNewName(''); setNewExpiry(''); }} className="rounded-[3px] p-2.5 text-ink-300 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover hover:text-ink-600">
            <X size={16} />
          </button>
        </div>
      )}

      {loading ? (
        <p className="font-sans text-[12.5px] text-ink-300">Cargando…</p>
      ) : visibleKeys.length === 0 ? (
        <p className="font-sans text-[13px] italic text-ink-200">Sin API keys activas</p>
      ) : (
        <div className="space-y-2">
          {visibleKeys.map((k) => (
            <ApiKeyRow key={k.id} k={k} canEdit={canEdit} onRevoke={setKeyToRevoke} />
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
