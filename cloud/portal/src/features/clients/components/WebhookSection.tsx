import { useState, useEffect, useCallback } from 'react';
import { Webhook, RefreshCw, Save, Loader2 } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import type { WebhookConfig, PublicApiEvent } from '../../../shared/types/monitor';
import { ALL_EVENTS, EVENT_LABELS } from './apiKeysHelpers';

export default function WebhookSection({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
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
