import { useState, useEffect, useCallback } from 'react';
import { Loader2, Save } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import ConfirmModal from '../../../shared/components/ConfirmModal';
import ConfigCardShell from './ConfigCardShell';
import { APP_LOCALE } from '../../../shared/lib/formatters';
import type { SftpDestinationConfig } from '../../../shared/types/monitor';

type AuthMethod = 'password' | 'private_key';

const emptyForm = { host: '', port: '22', username: '', auth_method: 'password' as AuthMethod, password: '', private_key: '', remote_path: '/' };

/**
 * Destino SFTP de entrega automática de reportes por cliente (Fase 19 del
 * gap analysis). Mismo criterio "write-only" que las API keys: el
 * password/private_key nunca vuelve del servidor una vez guardado — editar
 * implica volver a escribirlo (mismo motivo que un secret de webhook, salvo
 * que acá ni siquiera se puede "ver" después: es una credencial de un
 * tercero, no algo generado por STC).
 */
export default function SftpDestinationCard({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const { showToast } = useToast();
  const [config, setConfig] = useState<SftpDestinationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get<SftpDestinationConfig>(`/clients/${clientId}/sftp-destination`)
      .then(setConfig)
      .catch(() => setConfig({ configured: false }))
      .finally(() => setLoading(false));
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const startEditing = () => {
    setForm({
      ...emptyForm,
      host: config?.host ?? '', port: String(config?.port ?? 22), username: config?.username ?? '',
      auth_method: config?.auth_method ?? 'password', remote_path: config?.remote_path ?? '/',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        host: form.host.trim(), port: Number(form.port) || 22, username: form.username.trim(),
        auth_method: form.auth_method, remote_path: form.remote_path.trim() || '/',
      };
      if (form.auth_method === 'password') body.password = form.password;
      else body.private_key = form.private_key;
      const updated = await api.put<SftpDestinationConfig>(`/clients/${clientId}/sftp-destination`, body);
      setConfig(updated);
      showToast('Destino SFTP guardado', 'success');
      setEditing(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await api.delete(`/clients/${clientId}/sftp-destination`);
      setConfig({ configured: false });
      showToast('Destino SFTP quitado — la entrega por SFTP queda desactivada para este cliente', 'success');
      setConfirmRemove(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error al quitar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const configured = !!config?.configured;

  return (
    <ConfigCardShell
      title="Entrega de reportes por SFTP"
      status={{ label: configured ? 'Configurado' : 'SIN CONFIGURAR', active: configured }}
      meta={configured ? `${config?.host}:${config?.port}` : 'Sin destino configurado'}
      cta={{ label: configured ? 'Editar' : 'Configurar', onClick: startEditing }}
    >
      <p className="mb-3.5 font-sans text-[12.5px] leading-[1.55] text-ink-100">
        Cada cierre mensual se sube automáticamente como PDF al SFTP del cliente, además de email/webhook.
      </p>

      {loading ? (
        <p className="font-sans text-[12.5px] text-ink-300">Cargando…</p>
      ) : editing ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input type="text" value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
              placeholder="sftp.cliente.com"
              className="flex-1 rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-mono text-[12.5px] text-ink-900 outline-none focus:border-brand" />
            <input type="number" value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
              placeholder="22"
              className="w-20 shrink-0 rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-mono text-[12.5px] text-ink-900 outline-none focus:border-brand" />
          </div>
          <input type="text" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            placeholder="usuario"
            className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-mono text-[12.5px] text-ink-900 outline-none focus:border-brand" />
          <div className="flex gap-2">
            {(['password', 'private_key'] as AuthMethod[]).map((m) => (
              <button key={m} type="button" onClick={() => setForm((f) => ({ ...f, auth_method: m }))}
                className={`flex-1 rounded-[2px] border px-3 py-1.5 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] transition-colors duration-150 ease-in-out ${
                  form.auth_method === m ? 'border-brand-chip-border bg-brand-soft text-brand-accent' : 'border-line-300 bg-white text-ink-300 hover:bg-surface-btn-hover'
                }`}>
                {m === 'password' ? 'Contraseña' : 'Clave privada'}
              </button>
            ))}
          </div>
          {form.auth_method === 'password' ? (
            <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder={configured ? 'Nueva contraseña (dejar vacío no la cambia)' : 'Contraseña'}
              className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-mono text-[12.5px] text-ink-900 outline-none focus:border-brand" />
          ) : (
            <textarea value={form.private_key} onChange={(e) => setForm((f) => ({ ...f, private_key: e.target.value }))}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..." rows={4}
              className="w-full resize-none rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-mono text-[11px] text-ink-900 outline-none focus:border-brand" />
          )}
          <input type="text" value={form.remote_path} onChange={(e) => setForm((f) => ({ ...f, remote_path: e.target.value }))}
            placeholder="/ (ruta remota donde subir el PDF)"
            className="w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-mono text-[12.5px] text-ink-900 outline-none focus:border-brand" />
          <div className="flex items-center gap-2.5 pt-1">
            <button onClick={() => setEditing(false)} disabled={saving}
              className="flex-1 rounded-[3px] border border-line-300 bg-white px-4 py-2.5 font-montserrat text-[10.5px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover">
              Cancelar
            </button>
            <button onClick={handleSave}
              disabled={saving || !form.host.trim() || !form.username.trim() || (form.auth_method === 'password' ? (!configured && !form.password) : !form.private_key)}
              className="flex flex-1 items-center justify-center gap-2 rounded-[3px] bg-brand px-4 py-2.5 font-montserrat text-[10.5px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-60">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar
            </button>
          </div>
        </div>
      ) : configured ? (
        <div className="space-y-2">
          <p className="font-mono text-[12.5px] text-ink-700">{config?.username}@{config?.host}:{config?.port}</p>
          <p className="font-sans text-[11.5px] text-ink-300">
            Ruta: <code className="font-mono">{config?.remote_path}</code> · Auth: {config?.auth_method === 'password' ? 'contraseña' : 'clave privada'}
          </p>
          {config?.updated_at && (
            <p className="font-sans text-[11px] text-ink-200">
              Actualizado {new Date(config.updated_at).toLocaleString(APP_LOCALE, { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          )}
          {canEdit && (
            <button onClick={() => setConfirmRemove(true)}
              className="font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-300 hover:text-rose-600">
              Quitar destino
            </button>
          )}
        </div>
      ) : (
        <p className="font-sans text-[13px] italic text-ink-200">Sin configurar</p>
      )}

      <ConfirmModal
        isOpen={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={handleRemove}
        title="Quitar destino SFTP"
        message="Los próximos cierres mensuales van a dejar de subirse a este SFTP. Email y webhook (si están configurados) no se ven afectados."
        confirmText="Quitar"
        isDanger
        isLoading={saving}
      />
    </ConfigCardShell>
  );
}
