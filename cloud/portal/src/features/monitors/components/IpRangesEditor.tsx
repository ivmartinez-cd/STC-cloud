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

const INPUT = 'w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[12.5px] text-ink-900 outline-none focus:border-brand';

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
    <div className="space-y-3">
      {ranges.length === 0 && (
        <div className="rounded-[5px] border border-dashed border-line-300 bg-white py-8 text-center">
          <p className="font-montserrat text-[10px] font-bold uppercase tracking-[.13em] text-ink-300">Sin segmentación configurada</p>
        </div>
      )}

      {ranges.map((range, idx) => {
        const mode: Mode = range.hostname !== undefined ? 'hostname' : range.cidr !== undefined ? 'cidr' : 'range';
        return (
          <div key={idx} className="space-y-3 rounded-[5px] border border-line-150 bg-surface-input p-3.5">
            <div className="flex items-center gap-2">
              <select
                value={mode}
                onChange={e => setMode(idx, e.target.value as Mode)}
                className="w-32 shrink-0 rounded-[3px] border border-line-300 bg-white px-2.5 py-2 font-sans text-[11px] font-semibold text-ink-900 outline-none focus:border-brand"
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
                className={`${INPUT} text-[12px]`}
              />

              {ranges.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="shrink-0 rounded-[3px] p-1.5 text-ink-300 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover hover:text-brand-severe"
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
                  className={`${INPUT} font-mono`}
                />
                <span className="font-semibold text-ink-200">—</span>
                <input
                  type="text"
                  placeholder="IP Fin"
                  value={range.end ?? ''}
                  onChange={e => update(idx, { end: e.target.value })}
                  className={`${INPUT} font-mono`}
                />
              </div>
            ) : mode === 'cidr' ? (
              <input
                type="text"
                placeholder="Ej: 10.0.1.0/24"
                value={range.cidr ?? ''}
                onChange={e => update(idx, { cidr: e.target.value })}
                className={`${INPUT} font-mono`}
              />
            ) : (
              <input
                type="text"
                placeholder="Ej: impresora-piso3.corp.local"
                value={range.hostname ?? ''}
                onChange={e => update(idx, { hostname: e.target.value })}
                className={`${INPUT} font-mono`}
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
        className="flex items-center gap-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand transition-colors duration-150 ease-in-out hover:text-brand-severe"
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
          className="w-full rounded-[3px] border border-line-300 bg-white px-2.5 py-2 font-mono text-[11px] text-ink-900 outline-none focus:border-brand"
        />
        <button
          type="button"
          onClick={addExclusion}
          className="shrink-0 rounded-[3px] px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-400 transition-colors duration-150 ease-in-out hover:text-brand"
        >
          Excluir
        </button>
      </div>
      {exclude.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {exclude.map(ip => (
            <span key={ip} className="flex items-center gap-1.5 rounded-[2px] border border-line-300 bg-white px-2.5 py-1 font-mono text-[11px] text-ink-700">
              {ip}
              <button type="button" onClick={() => onChange(exclude.filter(e => e !== ip))} className="text-ink-300 transition-colors duration-150 ease-in-out hover:text-brand-severe">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
