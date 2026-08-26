import { useState, useEffect, useCallback } from 'react';
import { Loader2, X } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import ConfirmModal from '../../../shared/components/ConfirmModal';
import ConfigCardShell from './ConfigCardShell';
import NewKeyModal from './NewKeyModal';
import ApiKeyRow from './ApiKeyRow';
import WebhookSection from './WebhookSection';
import { EXPIRY_OPTIONS, isExpired } from './apiKeysHelpers';
import type { ApiKeyRecord } from '../../../shared/types/monitor';

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
