import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { IpRange } from '../../../shared/types/agents';
import type { MaskedSnmpCredential } from '../../../shared/types/monitor';
import CredentialIdsSelect from './CredentialIdsSelect';

type Mode = 'range' | 'cidr' | 'hostname';

/**
 * Editor de `ip_ranges` — rango manual (start/end, como siempre), CIDR, o un
 * hostname puntual (point lookup — el agente lo resuelve por DNS en cada
 * ciclo de discovery, el cloud no lo resuelve), más una lista opcional de
 * IPs a excluir (no aplica a hostname). Factoriza la edición que antes vivía
 * duplicada casi byte-a-byte en `MonitorDetail.tsx` (ConfigTabPanel) y
 * `ConfigAgentModal.tsx`. Controlado (`ranges`/`onChange`) — el guardado
 * real sigue viviendo en el `PUT /agents/:id/config` de cada consumidor, acá
 * sólo se edita el array en memoria; el cloud valida formato/topes en serio
 * al guardar (`services/ipRangeSpec.ts`) y puede devolver `warnings` no
 * bloqueantes (ej. rango con IP pública, o rangos superpuestos con
 * credenciales distintas) que cada consumidor muestra aparte.
 *
 * `credential_ids` (credenciales SNMP por rango) se edita acá vía
 * `CredentialIdsSelect` — sólo aparece si el agente tiene credenciales
 * adicionales configuradas (`credentials`, ver `SnmpCredentialsPanel`). Un
 * valor ya seteado por API se preserva intacto si se edita otro campo de la
 * misma entrada (ver `update()`, que spreadea el objeto entero, nunca
 * reconstruye uno "limpio").
 */
interface Props {
  ranges: IpRange[];
  onChange: (ranges: IpRange[]) => void;
  credentials?: MaskedSnmpCredential[];
}

function emptyRangeEntry(): IpRange {
  return { start: '', end: '' };
}

export default function IpRangesEditor({ ranges, onChange, credentials = [] }: Props) {
  const update = (idx: number, patch: Partial<IpRange>) =>
    onChange(ranges.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const remove = (idx: number) => onChange(ranges.filter((_, i) => i !== idx));

  const add = () => onChange([...ranges, emptyRangeEntry()]);

  const setMode = (idx: number, mode: Mode) => {
    const current = ranges[idx];
    if (mode === 'cidr') update(idx, { cidr: current.cidr ?? '', start: undefined, end: undefined, hostname: undefined });
    else if (mode === 'hostname') update(idx, { hostname: current.hostname ?? '', start: undefined, end: undefined, cidr: undefined, exclude: undefined });
    else update(idx, { start: current.start ?? '', end: current.end ?? '', cidr: undefined, hostname: undefined });
  };

  return (
    <div className="space-y-4">
      {ranges.length === 0 && (
        <div className="py-8 text-center border border-dashed border-slate-200 rounded-[20px]">
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Sin segmentación configurada</p>
        </div>
      )}

      {ranges.map((range, idx) => {
        const mode: Mode = range.hostname !== undefined ? 'hostname' : range.cidr !== undefined ? 'cidr' : 'range';
        return (
          <div key={idx} className="bg-slate-50 p-3 rounded-[20px] border border-slate-100 space-y-3">
            <div className="flex items-center gap-2">
              <select
                value={mode}
                onChange={e => setMode(idx, e.target.value as Mode)}
                className="cd-input !h-10 !w-32 !text-[11px] font-bold !bg-white border-transparent focus:!border-brand"
              >
                <option value="range">Rango</option>
                <option value="cidr">CIDR</option>
                <option value="hostname">Hostname</option>
              </select>

              <input
                type="text"
                placeholder="Etiqueta (opcional)"
                value={range.label ?? ''}
                onChange={e => update(idx, { label: e.target.value })}
                className="cd-input w-full !h-10 !text-xs !bg-white border-transparent focus:!border-brand"
              />

              {ranges.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all shrink-0"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            {mode === 'range' ? (
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="IP Inicio"
                  value={range.start ?? ''}
                  onChange={e => update(idx, { start: e.target.value })}
                  className="cd-input w-full !h-12 !text-xs font-mono !bg-white border-transparent focus:!border-brand"
                />
                <span className="text-slate-300 font-black">—</span>
                <input
                  type="text"
                  placeholder="IP Fin"
                  value={range.end ?? ''}
                  onChange={e => update(idx, { end: e.target.value })}
                  className="cd-input w-full !h-12 !text-xs font-mono !bg-white border-transparent focus:!border-brand"
                />
              </div>
            ) : mode === 'cidr' ? (
              <input
                type="text"
                placeholder="Ej: 10.0.1.0/24"
                value={range.cidr ?? ''}
                onChange={e => update(idx, { cidr: e.target.value })}
                className="cd-input w-full !h-12 !text-xs font-mono !bg-white border-transparent focus:!border-brand"
              />
            ) : (
              <input
                type="text"
                placeholder="Ej: impresora-piso3.corp.local"
                value={range.hostname ?? ''}
                onChange={e => update(idx, { hostname: e.target.value })}
                className="cd-input w-full !h-12 !text-xs font-mono !bg-white border-transparent focus:!border-brand"
              />
            )}

            {mode !== 'hostname' && (
              <ExcludeList
                exclude={range.exclude ?? []}
                onChange={excl => update(idx, { exclude: excl.length > 0 ? excl : undefined })}
              />
            )}

            <CredentialIdsSelect
              available={credentials}
              selected={range.credential_ids}
              onChange={ids => update(idx, { credential_ids: ids })}
            />
          </div>
        );
      })}

      <button
        type="button"
        onClick={add}
        className="flex items-center gap-2 text-[10px] font-black text-brand hover:text-brand/80 uppercase tracking-widest"
      >
        <Plus size={14} /> Adjuntar rango
      </button>
    </div>
  );
}

function ExcludeList({ exclude, onChange }: { exclude: string[]; onChange: (exclude: string[]) => void }) {
  const [draft, setDraft] = useState('');

  const addExclusion = () => {
    const ip = draft.trim();
    if (!ip || exclude.includes(ip)) { setDraft(''); return; }
    onChange([...exclude, ip]);
    setDraft('');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Excluir IP (ej: 10.0.1.5)"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExclusion(); } }}
          className="cd-input w-full !h-9 !text-[11px] font-mono !bg-white border-transparent focus:!border-brand"
        />
        <button
          type="button"
          onClick={addExclusion}
          className="px-3 py-2 text-[10px] font-black text-slate-500 hover:text-brand uppercase tracking-widest shrink-0"
        >
          Excluir
        </button>
      </div>
      {exclude.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {exclude.map(ip => (
            <span key={ip} className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-mono text-slate-600">
              {ip}
              <button type="button" onClick={() => onChange(exclude.filter(e => e !== ip))} className="text-slate-400 hover:text-rose-500">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
