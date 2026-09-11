import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardPaste, Plus, ToggleLeft, ToggleRight, Trash2, X } from 'lucide-react';
import type { IpRange } from '../../../shared/types/agents';
import type { MaskedSnmpCredential } from '../../../shared/types/monitor';
import { fmt } from '../../../shared/lib/formatters';
import { capWarnings, countTotalDeclaredIps, formatLapDuration, isRangeEnabled } from '../lib/parseRanges';
import BulkRangesModal, { WarningsList } from './BulkRangesModal';
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
 *
 * Carga masiva (`BulkRangesModal`) + resumen fijo arriba: un cliente real
 * llegó con 59 rangos exportados del sistema viejo en un solo string, y de a
 * una tarjeta por rango eso no se carga. Con esa cantidad la lista mide varias
 * pantallas, así que el resumen (rangos / IPs / vuelta estimada), los avisos de
 * tope y los dos botones viven en una barra `sticky` arriba de todo, no al pie.
 *
 * El toggle por rango escribe `enabled` (ausente = habilitado): apagar un
 * segmento deja de barrerlo sin perder etiqueta, exclusiones ni credenciales
 * — el cloud lo filtra al compilar el heartbeat, el agente nunca lo ve.
 */
interface Props {
  ranges: IpRange[];
  onChange: (ranges: IpRange[]) => void;
  credentials?: MaskedSnmpCredential[];
}

const INPUT = 'w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[12.5px] text-ink-900 outline-none focus:border-brand';
const TOOLBAR_BTN = 'flex items-center gap-1.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand transition-colors duration-150 ease-in-out hover:text-brand-severe';

function emptyRangeEntry(): IpRange {
  return { start: '', end: '' };
}

/** Tarjeta placeholder sin nada tipeado. `ConfigTabPanel` siembra una cuando el
 *  agente todavía no tiene rangos, así que la carga masiva tiene que barrerla:
 *  si queda, la validación de forma previa al PUT rechaza el guardado entero
 *  ("todos los rangos deben tener...") por una tarjeta vacía que encima quedó
 *  arriba de las 59 recién pegadas. */
function isBlankEntry(range: IpRange): boolean {
  return !range.start?.trim() && !range.end?.trim()
    && !range.cidr?.trim() && !range.hostname?.trim() && !range.label?.trim();
}

/** Con un rango apagado son DOS números distintos y hay que mostrar los dos: la
 *  vuelta cuesta sólo lo habilitado (lo apagado ni se le manda al agente), pero
 *  los topes del cloud se miden sobre lo DECLARADO, apagado incluido
 *  (`validateIpRangeSpecs`). Rotular sólo lo habilitado es rotular justo el
 *  número que NO dispara el 400 del guardado. */
function summaryText(ranges: IpRange[]): string {
  const enabled = ranges.filter(isRangeEnabled);
  const off = ranges.length - enabled.length;
  const scanned = countTotalDeclaredIps(enabled);
  const declared = countTotalDeclaredIps(ranges);
  const offText = off > 0 ? ` (${off} deshabilitado${off === 1 ? '' : 's'})` : '';
  const head = `${ranges.length} ${ranges.length === 1 ? 'rango' : 'rangos'}${offText}`;
  if (declared === 0) return `${head} · sin IPs declaradas`;
  const ips = scanned === declared ? `${fmt(scanned)} IPs` : `${fmt(scanned)} IPs a barrer de ${fmt(declared)} declaradas`;
  if (scanned === 0) return `${head} · ${ips}`;
  return `${head} · ${ips} · vuelta estimada ~${formatLapDuration(scanned)}`;
}

/** Resumen + acciones + avisos de tope SIEMPRE arriba y pegados al scroll: con
 *  59 tarjetas (caso real de carga masiva) el pie de la lista queda fuera de la
 *  pantalla y el operador no se entera de que se pasó de los topes hasta el 400.
 *  El `max-h` acota la barra: son 4 avisos como mucho, pero envuelven, y el
 *  editor vive en un contenedor con scroll (300px en `ConfigAgentModal`). */
function RangesToolbar({ ranges, onAdd, onPaste }: { ranges: IpRange[]; onAdd: () => void; onPaste: () => void }) {
  const warnings = capWarnings(ranges);
  return (
    <div className="sticky top-0 z-10 border-b border-line-150 bg-white pb-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="font-sans text-[11.5px] text-ink-400">{summaryText(ranges)}</p>
        <div className="flex items-center gap-4">
          <button type="button" onClick={onPaste} className={TOOLBAR_BTN}><ClipboardPaste size={13} /> Pegar lista</button>
          <button type="button" onClick={onAdd} className={TOOLBAR_BTN}><Plus size={14} /> Adjuntar rango</button>
        </div>
      </div>
      {warnings.length > 0 && (
        <div className="mt-2 max-h-[5.5rem] overflow-y-auto"><WarningsList items={warnings} /></div>
      )}
    </div>
  );
}

function EnabledToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button" onClick={onToggle} aria-pressed={enabled}
      title={enabled ? 'Deshabilitar: deja de barrerse, se conserva la configuración' : 'Habilitar: vuelve a barrerse'}
      className={`shrink-0 rounded-[3px] p-1 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover ${enabled ? 'text-brand' : 'text-ink-300'}`}
    >
      {enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
    </button>
  );
}

export default function IpRangesEditor({ ranges, onChange, credentials = [] }: Props) {
  const [bulkOpen, setBulkOpen] = useState(false);

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
      <RangesToolbar ranges={ranges} onAdd={add} onPaste={() => setBulkOpen(true)} />

      {/* Al `body`, no acá: la card de `ConfigAgentModal` queda con `transform`
          computado (`animate-modal-in` es `fill-mode: forwards`) + `overflow-hidden`,
          así que es el bloque contenedor de todo `position: fixed` descendiente y
          recortaba el overlay del pegado contra ella en vez de contra la pantalla. */}
      {bulkOpen && createPortal(
        <BulkRangesModal
          existing={ranges}
          onAdd={added => { onChange([...ranges.filter(r => !isBlankEntry(r)), ...added]); setBulkOpen(false); }}
          onClose={() => setBulkOpen(false)}
        />,
        document.body,
      )}

      {ranges.length === 0 && (
        <div className="rounded-[5px] border border-dashed border-line-300 bg-white py-8 text-center">
          <p className="font-montserrat text-[10px] font-bold uppercase tracking-[.13em] text-ink-300">Sin segmentación configurada</p>
        </div>
      )}

      {ranges.map((range, idx) => {
        const mode: Mode = range.hostname !== undefined ? 'hostname' : range.cidr !== undefined ? 'cidr' : 'range';
        const enabled = isRangeEnabled(range);
        return (
          <div key={idx} className={`space-y-3 rounded-[5px] border p-3.5 ${enabled ? 'border-line-150 bg-surface-input' : 'border-dashed border-line-300 bg-white'}`}>
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
                className={`${INPUT} text-[12px] ${enabled ? '' : 'opacity-55'}`}
              />

              {/* `enabled: undefined` al rehabilitar (no `true`): así el rango
                  vuelve a la forma histórica y el JSON del PUT queda limpio. */}
              <EnabledToggle enabled={enabled} onToggle={() => update(idx, { enabled: enabled ? false : undefined })} />

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

            <div className={`space-y-3 ${enabled ? '' : 'opacity-55'}`}>
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
          </div>
        );
      })}
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
