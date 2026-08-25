import { useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Loader2, Pencil, X, ShieldCheck } from 'lucide-react';
import { useToast } from '../../../store/ToastContext';
import { ApiError } from '../../../shared/lib/api';
import type {
  MaskedSnmpCredential, SnmpCredentialInput, SnmpVersion,
  SnmpSecurityLevel, SnmpAuthProtocol, SnmpPrivProtocol,
} from '../../../shared/types/monitor';

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

const AUTH_PROTOCOLS: SnmpAuthProtocol[] = ['md5', 'sha', 'sha224', 'sha256', 'sha384', 'sha512'];
const PRIV_PROTOCOLS: SnmpPrivProtocol[] = ['des', 'aes', 'aes256b', 'aes256r'];
const SECURITY_LEVELS: SnmpSecurityLevel[] = ['noAuthNoPriv', 'authNoPriv', 'authPriv'];

const LABEL = 'block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300';
const INPUT = 'w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[12.5px] text-ink-900 outline-none focus:border-brand';

interface Draft {
  version: SnmpVersion;
  label: string;
  community: string;
  username: string;
  security_level: SnmpSecurityLevel;
  auth_protocol: SnmpAuthProtocol;
  auth_key: string;
  priv_protocol: SnmpPrivProtocol;
  priv_key: string;
}

function emptyDraft(): Draft {
  return {
    version: 'v2c', label: '', community: '',
    username: '', security_level: 'authPriv',
    // sha/aes por default — no aes256b/aes256r: son variantes no estándar,
    // mutuamente incompatibles entre sí, que casi ningún firmware de
    // impresora soporta. Un admin que necesite otra cosa la elige a mano.
    auth_protocol: 'sha', auth_key: '',
    priv_protocol: 'aes', priv_key: '',
  };
}

type Row =
  | { kind: 'kept'; key: string; id: string; masked: MaskedSnmpCredential }
  | { kind: 'replace'; key: string; id: string; masked: MaskedSnmpCredential; draft: Draft }
  | { kind: 'new'; key: string; draft: Draft };

let keySeq = 0;
const nextKey = () => `row-${++keySeq}`;

function rowsFromMasked(list: MaskedSnmpCredential[]): Row[] {
  return list.map((masked) => ({ kind: 'kept' as const, key: nextKey(), id: masked.id, masked }));
}

function versionLabel(v: SnmpVersion): string {
  return v === 'v1' ? 'v1' : v === 'v2c' ? 'v2c' : 'v3';
}

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
    <div className="rounded-[5px] border border-line-100 bg-white lg:col-span-2">
      <div className="border-b border-line-150 px-5 py-3.5">
        <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Credenciales SNMP</span>
        <p className="mt-1 font-sans text-[11.5px] leading-[1.5] text-ink-300">
          Lista probada en orden (v1 / v2c / v3) — la community de arriba sigue como respaldo legado
        </p>
      </div>

      <div className="space-y-4 px-5 pb-[18px] pt-4">
        {rows.length === 0 && (
          <div className="rounded-[5px] border border-dashed border-line-300 bg-white py-8 text-center">
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
              <DraftForm draft={row.draft} onChange={(patch) => updateDraft(idx, patch)} />
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

function CredentialChip({ masked }: { masked: MaskedSnmpCredential }) {
  const badges: string[] = [];
  if (masked.has_community) badges.push('community configurada');
  if (masked.has_auth_key) badges.push('auth configurada');
  if (masked.has_priv_key) badges.push('priv configurada');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-[2px] bg-surface-avatar px-2 py-0.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-650">
        {versionLabel(masked.version)}
      </span>
      <span className="font-sans text-[12.5px] font-semibold text-ink-700">
        {masked.label || masked.username || 'Sin nombre'}
      </span>
      {masked.username && masked.version === 'v3' && (
        <span className="font-mono text-[10px] text-ink-300">@{masked.username}</span>
      )}
      {badges.map((b) => (
        <span key={b} className="flex items-center gap-1 rounded-[2px] bg-brand-soft px-2 py-0.5 font-montserrat text-[9px] font-semibold uppercase tracking-[.08em] text-brand-accent">
          <ShieldCheck size={10} /> {b}
        </span>
      ))}
    </div>
  );
}

function DraftForm({ draft, onChange }: { draft: Draft; onChange: (patch: Partial<Draft>) => void }) {
  return (
    <div className="space-y-3.5 border-t border-line-150 pt-3.5">
      <div className="grid grid-cols-2 gap-3.5">
        <div className="space-y-1.5">
          <label className={LABEL}>Versión</label>
          <select value={draft.version} onChange={(e) => onChange({ version: e.target.value as SnmpVersion })}
            className={`${INPUT} font-semibold`}>
            <option value="v2c">v2c (community)</option>
            <option value="v1">v1 (community)</option>
            <option value="v3">v3 (USM)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className={LABEL}>Etiqueta (opcional)</label>
          <input type="text" value={draft.label} onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Ej: Corporativa"
            className={INPUT} />
        </div>
      </div>

      {(draft.version === 'v1' || draft.version === 'v2c') && (
        <div className="space-y-1.5">
          <label className={LABEL}>Community</label>
          <input type="text" value={draft.community} onChange={(e) => onChange({ community: e.target.value })}
            className={`${INPUT} font-mono`} />
        </div>
      )}

      {draft.version === 'v3' && (
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className={LABEL}>Username</label>
              <input type="text" value={draft.username} onChange={(e) => onChange({ username: e.target.value })}
                className={`${INPUT} font-mono`} />
            </div>
            <div className="space-y-1.5">
              <label className={LABEL}>Nivel de seguridad</label>
              <select value={draft.security_level} onChange={(e) => onChange({ security_level: e.target.value as SnmpSecurityLevel })}
                className={`${INPUT} font-semibold`}>
                {SECURITY_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          {draft.security_level !== 'noAuthNoPriv' && (
            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label className={LABEL}>Protocolo auth</label>
                <select value={draft.auth_protocol} onChange={(e) => onChange({ auth_protocol: e.target.value as SnmpAuthProtocol })}
                  className={`${INPUT} font-semibold`}>
                  {AUTH_PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={LABEL}>Auth key (≥ 8 caracteres)</label>
                <input type="password" autoComplete="new-password" value={draft.auth_key} onChange={(e) => onChange({ auth_key: e.target.value })}
                  className={`${INPUT} font-mono`} />
              </div>
            </div>
          )}

          {draft.security_level === 'authPriv' && (
            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label className={LABEL}>Protocolo priv</label>
                <select value={draft.priv_protocol} onChange={(e) => onChange({ priv_protocol: e.target.value as SnmpPrivProtocol })}
                  className={`${INPUT} font-semibold`}>
                  {PRIV_PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={LABEL}>Priv key (≥ 8 caracteres)</label>
                <input type="password" autoComplete="new-password" value={draft.priv_key} onChange={(e) => onChange({ priv_key: e.target.value })}
                  className={`${INPUT} font-mono`} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
