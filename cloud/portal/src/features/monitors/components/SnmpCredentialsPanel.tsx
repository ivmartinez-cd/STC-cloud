import { useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, KeyRound, Loader2, Save, Pencil, X, ShieldCheck } from 'lucide-react';
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
    <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-xl shadow-brand/5 space-y-6 lg:col-span-2">
      <div className="flex items-center gap-4 mb-2">
        <div className="p-3 bg-brand-gray/10 text-brand-gray rounded-2xl">
          <KeyRound size={24} />
        </div>
        <div>
          <h3 className="text-lg font-black text-[#1a2333] tracking-tight uppercase">Credenciales SNMP</h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
            Lista probada en orden (v1 / v2c / v3) — la community de arriba sigue como respaldo legado
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {rows.length === 0 && (
          <div className="py-8 text-center border border-dashed border-slate-200 rounded-[20px]">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Sin credenciales adicionales configuradas</p>
          </div>
        )}

        {rows.map((row, idx) => (
          <div key={row.key} className="bg-slate-50 rounded-[24px] border border-slate-100 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 flex items-center justify-center rounded-full bg-[#1a2333] text-white text-[10px] font-black">{idx + 1}</span>
                {row.kind === 'kept' ? (
                  <CredentialChip masked={row.masked} />
                ) : (
                  <span className="text-[10px] font-black text-brand-gray uppercase tracking-widest">
                    {row.kind === 'replace' ? 'Reemplazando credencial' : 'Credencial nueva'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => moveRow(idx, -1)} disabled={idx === 0}
                  className="p-2 text-slate-400 hover:text-brand disabled:opacity-30 disabled:hover:text-slate-400 rounded-lg transition-all">
                  <ArrowUp size={16} />
                </button>
                <button type="button" onClick={() => moveRow(idx, 1)} disabled={idx === rows.length - 1}
                  className="p-2 text-slate-400 hover:text-brand disabled:opacity-30 disabled:hover:text-slate-400 rounded-lg transition-all">
                  <ArrowDown size={16} />
                </button>
                {row.kind === 'kept' && (
                  <button type="button" onClick={() => startReplace(idx)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black text-brand-gray hover:bg-brand-gray/10 uppercase tracking-widest rounded-lg transition-all">
                    <Pencil size={12} /> Reemplazar
                  </button>
                )}
                {row.kind === 'replace' && (
                  <button type="button" onClick={() => cancelReplace(idx)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black text-slate-500 hover:bg-slate-100 uppercase tracking-widest rounded-lg transition-all">
                    <X size={12} /> Cancelar
                  </button>
                )}
                <button type="button" onClick={() => removeRow(idx)}
                  className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {(row.kind === 'new' || row.kind === 'replace') && (
              <DraftForm draft={row.draft} onChange={(patch) => updateDraft(idx, patch)} />
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center pt-2">
        <button type="button" onClick={addRow}
          className="flex items-center gap-2 text-[10px] font-black text-brand hover:text-brand/80 uppercase tracking-widest">
          <Plus size={14} /> Agregar credencial
        </button>
        <button type="button" onClick={handleSave} disabled={saving}
          className="px-8 py-4 bg-brand text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-brand/20 flex items-center gap-3 disabled:opacity-50 hover:bg-brand-hover transition-all active:scale-95">
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Guardar Credenciales
        </button>
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
    <div className="flex items-center gap-2 flex-wrap">
      <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded-md text-[10px] font-black uppercase tracking-widest">
        {versionLabel(masked.version)}
      </span>
      <span className="text-xs font-bold text-slate-700">
        {masked.label || masked.username || 'Sin nombre'}
      </span>
      {masked.username && masked.version === 'v3' && (
        <span className="text-[10px] font-mono text-slate-400">@{masked.username}</span>
      )}
      {badges.map((b) => (
        <span key={b} className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-[9px] font-black uppercase tracking-widest">
          <ShieldCheck size={10} /> {b}
        </span>
      ))}
    </div>
  );
}

function DraftForm({ draft, onChange }: { draft: Draft; onChange: (patch: Partial<Draft>) => void }) {
  return (
    <div className="space-y-4 pt-2 border-t border-slate-200">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Versión</label>
          <select value={draft.version} onChange={(e) => onChange({ version: e.target.value as SnmpVersion })}
            className="cd-input w-full !h-12 !bg-white border-transparent focus:!border-brand !text-xs font-bold">
            <option value="v2c">v2c (community)</option>
            <option value="v1">v1 (community)</option>
            <option value="v3">v3 (USM)</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Etiqueta (opcional)</label>
          <input type="text" value={draft.label} onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Ej: Corporativa"
            className="cd-input w-full !h-12 !bg-white border-transparent focus:!border-brand !text-xs" />
        </div>
      </div>

      {(draft.version === 'v1' || draft.version === 'v2c') && (
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Community</label>
          <input type="text" value={draft.community} onChange={(e) => onChange({ community: e.target.value })}
            className="cd-input w-full !h-12 !bg-white border-transparent focus:!border-brand !text-xs font-mono" />
        </div>
      )}

      {draft.version === 'v3' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Username</label>
              <input type="text" value={draft.username} onChange={(e) => onChange({ username: e.target.value })}
                className="cd-input w-full !h-12 !bg-white border-transparent focus:!border-brand !text-xs font-mono" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nivel de seguridad</label>
              <select value={draft.security_level} onChange={(e) => onChange({ security_level: e.target.value as SnmpSecurityLevel })}
                className="cd-input w-full !h-12 !bg-white border-transparent focus:!border-brand !text-xs font-bold">
                {SECURITY_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          {draft.security_level !== 'noAuthNoPriv' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Protocolo auth</label>
                <select value={draft.auth_protocol} onChange={(e) => onChange({ auth_protocol: e.target.value as SnmpAuthProtocol })}
                  className="cd-input w-full !h-12 !bg-white border-transparent focus:!border-brand !text-xs font-bold">
                  {AUTH_PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Auth key (≥ 8 caracteres)</label>
                <input type="password" autoComplete="new-password" value={draft.auth_key} onChange={(e) => onChange({ auth_key: e.target.value })}
                  className="cd-input w-full !h-12 !bg-white border-transparent focus:!border-brand !text-xs font-mono" />
              </div>
            </div>
          )}

          {draft.security_level === 'authPriv' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Protocolo priv</label>
                <select value={draft.priv_protocol} onChange={(e) => onChange({ priv_protocol: e.target.value as SnmpPrivProtocol })}
                  className="cd-input w-full !h-12 !bg-white border-transparent focus:!border-brand !text-xs font-bold">
                  {PRIV_PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Priv key (≥ 8 caracteres)</label>
                <input type="password" autoComplete="new-password" value={draft.priv_key} onChange={(e) => onChange({ priv_key: e.target.value })}
                  className="cd-input w-full !h-12 !bg-white border-transparent focus:!border-brand !text-xs font-mono" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
