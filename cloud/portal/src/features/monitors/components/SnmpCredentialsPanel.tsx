import { useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Loader2, Pencil, X } from 'lucide-react';
import { useToast } from '../../../store/ToastContext';
import { ApiError } from '../../../shared/lib/api';
import type { MaskedSnmpCredential, SnmpCredentialInput } from '../../../shared/types/monitor';
import { type Row, type Draft, emptyDraft, rowsFromMasked, nextKey } from './snmpCredentialsHelpers';
import CredentialChip from './CredentialChip';
import SnmpCredentialDraftForm from './SnmpCredentialDraftForm';

/**
 * Sección "Credenciales SNMP" del tab de Configuración (§2.3 gap analysis:
 * SNMPv3 + lista de credenciales probadas en orden por el agente). Separada
 * de `ConfigTabPanel` porque tiene su propio ciclo de guardado (endpoint,
 * optimistic locking por `rev`, y una forma de dato bastante distinta a un
 * `<form>` plano) — ver `useMonitorDetail.saveSnmpCredentials`.
 *
 * Reglas de edición:
 *  - Una entrada YA GUARDADA que no se toca viaja como `{ref: id}` — nunca
 *    repite secretos, así que reordenar/renombrar/borrar NO requiere volver
 *    a escribir ninguna contraseña.
 *  - "Reemplazar" convierte una entrada guardada en un formulario editable
 *    que manda material nuevo (se re-cifra del lado cloud con un id nuevo).
 *  - Las entradas nuevas siempre requieren los campos completos.
 */

interface Props {
  credentials: MaskedSnmpCredential[];
  rev: number;
  onSave: (credentials: SnmpCredentialInput[], expectedRev: number) => Promise<void>;
}

export default function SnmpCredentialsPanel({ credentials, rev, onSave }: Props) {
  const [rows, setRows] = useState<Row[]>(() => rowsFromMasked(credentials));
  const [baseline, setBaseline] = useState(credentials);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  // Si llega una lista distinta desde el server (guardado exitoso, u otra
  // pestaña) y el panel no tiene ediciones en curso, resincronizar la vista.
  if (credentials !== baseline && !rows.some((r) => r.kind !== 'kept')) {
    setBaseline(credentials);
    setRows(rowsFromMasked(credentials));
  }

  const moveRow = (idx: number, dir: -1 | 1) => {
    setRows((prev) => {
      const next = prev.slice();
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const addRow = () => setRows((prev) => [...prev, { kind: 'new', key: nextKey(), draft: emptyDraft() }]);

  const startReplace = (idx: number) => setRows((prev) => prev.map((r, i) => {
    if (i !== idx || r.kind !== 'kept') return r;
    return { kind: 'replace', key: r.key, id: r.id, masked: r.masked, draft: emptyDraft() };
  }));

  const cancelReplace = (idx: number) => setRows((prev) => prev.map((r, i) => {
    if (i !== idx || r.kind !== 'replace') return r;
    return { kind: 'kept', key: r.key, id: r.id, masked: r.masked };
  }));

  const updateDraft = (idx: number, patch: Partial<Draft>) => setRows((prev) => prev.map((r, i) => {
    if (i !== idx || r.kind === 'kept') return r;
    return { ...r, draft: { ...r.draft, ...patch } };
  }));

  const buildPayload = (): SnmpCredentialInput[] | null => {
    const out: SnmpCredentialInput[] = [];
    for (const r of rows) {
      if (r.kind === 'kept') { out.push({ ref: r.id }); continue; }
      const d = r.draft;
      if (d.version === 'v1' || d.version === 'v2c') {
        if (!d.community.trim()) { showToast('Falta la community', 'warning'); return null; }
        out.push({ version: d.version, label: d.label.trim() || null, community: d.community.trim() });
        continue;
      }
      if (!d.username.trim()) { showToast('Falta el username SNMPv3', 'warning'); return null; }
      if (d.security_level !== 'noAuthNoPriv') {
        if (!d.auth_key || d.auth_key.length < 8) { showToast('La auth_key requiere al menos 8 caracteres', 'warning'); return null; }
      }
      if (d.security_level === 'authPriv') {
        if (!d.priv_key || d.priv_key.length < 8) { showToast('La priv_key requiere al menos 8 caracteres', 'warning'); return null; }
      }
      out.push({
        version: 'v3', label: d.label.trim() || null, username: d.username.trim(),
        security_level: d.security_level,
        ...(d.security_level !== 'noAuthNoPriv' ? { auth_protocol: d.auth_protocol, auth_key: d.auth_key } : {}),
        ...(d.security_level === 'authPriv' ? { priv_protocol: d.priv_protocol, priv_key: d.priv_key } : {}),
      });
    }
    return out;
  };

  const handleSave = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    try {
      await onSave(payload, rev);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        showToast('La lista cambió desde otra sesión — se recargó con los valores más recientes, revisá y volvé a guardar', 'warning');
      } else {
        showToast((err as Error).message || 'Error al guardar las credenciales SNMP', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[5px] border border-line-100 bg-white">
      <div className="border-b border-line-150 px-5 py-3.5">
        <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Credenciales SNMP</span>
        <p className="mt-1 font-sans text-[11.5px] leading-[1.5] text-ink-300 short:hidden">
          Lista probada en orden (v1 / v2c / v3) — la community de arriba sigue como respaldo legado
        </p>
      </div>

      <div className="space-y-4 px-5 pb-[18px] pt-4">
        {rows.length === 0 && (
          <div className="rounded-[5px] border border-dashed border-line-300 bg-white py-8 short:py-3 text-center">
            <p className="font-montserrat text-[10px] font-bold uppercase tracking-[.13em] text-ink-300">Sin credenciales adicionales configuradas</p>
          </div>
        )}

        {rows.map((row, idx) => (
          <div key={row.key} className="space-y-3.5 rounded-[5px] border border-line-150 bg-surface-input p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-[3px] border border-line-avatar bg-surface-avatar font-montserrat text-[10px] font-bold text-ink-400">{idx + 1}</span>
                {row.kind === 'kept' ? (
                  <CredentialChip masked={row.masked} />
                ) : (
                  <span className="font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent">
                    {row.kind === 'replace' ? 'Reemplazando credencial' : 'Credencial nueva'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => moveRow(idx, -1)} disabled={idx === 0}
                  className="rounded-[3px] p-1.5 text-ink-300 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover hover:text-ink-600 disabled:opacity-30 disabled:hover:text-ink-300">
                  <ArrowUp size={16} />
                </button>
                <button type="button" onClick={() => moveRow(idx, 1)} disabled={idx === rows.length - 1}
                  className="rounded-[3px] p-1.5 text-ink-300 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover hover:text-ink-600 disabled:opacity-30 disabled:hover:text-ink-300">
                  <ArrowDown size={16} />
                </button>
                {row.kind === 'kept' && (
                  <button type="button" onClick={() => startReplace(idx)}
                    className="flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover">
                    <Pencil size={12} /> Reemplazar
                  </button>
                )}
                {row.kind === 'replace' && (
                  <button type="button" onClick={() => cancelReplace(idx)}
                    className="flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-400 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover">
                    <X size={12} /> Cancelar
                  </button>
                )}
                <button type="button" onClick={() => removeRow(idx)}
                  className="rounded-[3px] p-1.5 text-ink-300 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover hover:text-brand-severe">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {(row.kind === 'new' || row.kind === 'replace') && (
              <SnmpCredentialDraftForm draft={row.draft} onChange={(patch) => updateDraft(idx, patch)} />
            )}
          </div>
        ))}

        <div className="flex items-center justify-between pt-2">
          <button type="button" onClick={addRow}
            className="flex items-center gap-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand transition-colors duration-150 ease-in-out hover:text-brand-severe">
            <Plus size={14} /> Agregar credencial
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex items-center gap-2.5 rounded-[3px] bg-brand px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin" />} Guardar credenciales
          </button>
        </div>
      </div>
    </div>
  );
}
