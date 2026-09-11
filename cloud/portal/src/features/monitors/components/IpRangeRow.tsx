import { useState } from 'react';
import { ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Trash2, X } from 'lucide-react';
import type { IpRange } from '../../../shared/types/agents';
import type { MaskedSnmpCredential } from '../../../shared/types/monitor';
import { fmt } from '../../../shared/lib/formatters';
import { countDeclaredIps, isRangeEnabled } from '../lib/parseRanges';
import { specProblem } from '../lib/rangeSpecText';
import CredentialIdsSelect from './CredentialIdsSelect';

/**
 * UNA fila del editor de segmentos (`IpRangesEditor`) — layout denso a ancho
 * completo, no tarjeta: con 59 rangos (caso real) la tarjeta de 3-4 filas por
 * rango dejaba 3 o 4 visibles por pantalla, y una lista de 59 se lee
 * escaneándola, no scrolleando de a tres.
 *
 * Un solo input para el segmento: el tipo (rango / CIDR / IP / hostname) se
 * infiere de lo tipeado con el MISMO parser que el pegado masivo
 * (`applySpecText` en el editor) y se muestra como rótulo a la derecha, así
 * el select de tipo desaparece y el operador escribe igual que en la lista
 * pegada. Exclusiones y credenciales van en un detalle desplegable: la enorme
 * mayoría de las filas no tiene ninguna de las dos y ocuparlas siempre
 * duplicaba el alto.
 *
 * Las columnas se comparten con el encabezado de la lista vía `ROW_GRID`.
 */
export const ROW_GRID = 'grid grid-cols-[auto_minmax(0,1.15fr)_minmax(0,1fr)_104px_auto_auto] items-center gap-x-2';

const INPUT = 'w-full min-w-0 rounded-[3px] border bg-white px-2.5 py-1.5 text-[12px] text-ink-900 outline-none focus:border-brand';
const ICON_BTN = 'shrink-0 rounded-[3px] p-1 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover';

interface Props {
  range: IpRange;
  /** Texto del input de segmento: el borrador si la fila tiene el foco, si no
   *  `rangeToText(range)` — lo decide el editor, que es dueño del borrador. */
  text: string;
  credentials: MaskedSnmpCredential[];
  expanded: boolean;
  onText: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onPatch: (patch: Partial<IpRange>) => void;
  onToggleExpand: () => void;
  onRemove: () => void;
}

function kindOf(range: IpRange): string {
  if (range.hostname !== undefined) return 'host';
  if (range.cidr !== undefined) return 'cidr';
  return range.start && range.start === range.end ? 'ip' : 'rango';
}

/** Rótulo del tipo inferido + IPs declaradas: es el feedback de que la
 *  autodetección entendió lo que se tipeó ("cidr · 256 IPs"). */
function SpecMeta({ range }: { range: IpRange }) {
  const kind = kindOf(range);
  const ips = countDeclaredIps(range);
  return (
    <span className="truncate text-right font-montserrat text-[9px] font-bold uppercase tracking-[.1em] text-ink-300 tabular-nums">
      {kind}{kind !== 'host' && ips > 0 ? ` · ${fmt(ips)} IPs` : ''}
    </span>
  );
}

function EnabledToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button" onClick={onToggle} aria-pressed={enabled}
      title={enabled ? 'Deshabilitar: deja de barrerse, se conserva la configuración' : 'Habilitar: vuelve a barrerse'}
      className={`${ICON_BTN} ${enabled ? 'text-brand' : 'text-ink-300'}`}
    >
      {enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
    </button>
  );
}

/** Resume lo que hay adentro del detalle ("2 excl. · 1 cred.") para que no
 *  haga falta desplegar cada fila para saber cuál tiene algo configurado. */
function DetailToggle({ range, open, onToggle }: { range: IpRange; open: boolean; onToggle: () => void }) {
  const excl = range.exclude?.length ?? 0;
  const creds = range.credential_ids?.length ?? 0;
  const parts = [excl > 0 ? `${excl} excl.` : null, creds > 0 ? `${creds} cred.` : null].filter((p) => p !== null);
  return (
    <button
      type="button" onClick={onToggle} aria-expanded={open}
      className={`flex shrink-0 items-center gap-1 rounded-[3px] px-1.5 py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover hover:text-brand ${parts.length > 0 ? 'text-ink-700' : 'text-ink-300'}`}
    >
      {parts.length > 0 ? parts.join(' · ') : 'Detalle'}
      {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
    </button>
  );
}

export default function IpRangeRow({ range, text, credentials, expanded, onText, onFocus, onBlur, onPatch, onToggleExpand, onRemove }: Props) {
  const enabled = isRangeEnabled(range);
  const problem = specProblem(text);
  const isHost = range.hostname !== undefined;
  // Un hostname no tiene exclusiones; sin credenciales adicionales no hay nada que elegir.
  const canExpand = !isHost || credentials.length > 0;
  const dim = enabled ? '' : 'opacity-55';
  return (
    <div className={`rounded-[3px] border px-2 py-1.5 ${enabled ? 'border-line-150 bg-surface-input' : 'border-dashed border-line-300 bg-white'}`}>
      <div className={ROW_GRID}>
        {/* `enabled: undefined` al rehabilitar (no `true`): así el rango vuelve
            a la forma histórica y el JSON del PUT queda limpio. */}
        <EnabledToggle enabled={enabled} onToggle={() => onPatch({ enabled: enabled ? false : undefined })} />
        <input
          type="text" value={text} placeholder="10.0.1.1-10.0.1.254 · 10.0.2.0/24 · host.corp.local"
          title={problem ?? undefined} aria-invalid={problem !== null}
          onChange={(e) => onText(e.target.value)} onFocus={onFocus} onBlur={onBlur}
          className={`${INPUT} font-mono ${problem ? 'border-brand-severe' : 'border-line-300'} ${dim}`}
        />
        <input
          type="text" value={range.label ?? ''} placeholder="Etiqueta (opcional)"
          onChange={(e) => onPatch({ label: e.target.value })}
          className={`${INPUT} border-line-300 font-sans ${dim}`}
        />
        <SpecMeta range={range} />
        {canExpand ? <DetailToggle range={range} open={expanded} onToggle={onToggleExpand} /> : <span />}
        <button type="button" onClick={onRemove} title="Quitar" className={`${ICON_BTN} text-ink-300 hover:text-brand-severe`}>
          <Trash2 size={15} />
        </button>
      </div>
      {expanded && canExpand && (
        <div className={`mt-2 space-y-2.5 border-t border-line-150 pt-2.5 ${dim}`}>
          {!isHost && (
            <ExcludeList exclude={range.exclude ?? []} onChange={(excl) => onPatch({ exclude: excl.length > 0 ? excl : undefined })} />
          )}
          <CredentialIdsSelect available={credentials} selected={range.credential_ids} onChange={(ids) => onPatch({ credential_ids: ids })} />
        </div>
      )}
    </div>
  );
}

function ExcludeList({ exclude, onChange }: { exclude: string[]; onChange: (exclude: string[]) => void }) {
  const [draft, setDraft] = useState('');

  const addExclusion = () => {
    const ip = draft.trim();
    if (ip && !exclude.includes(ip)) onChange([...exclude, ip]);
    setDraft('');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text" placeholder="Excluir IP (ej: 10.0.1.5)" value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExclusion(); } }}
        className={`${INPUT} w-56 border-line-300 font-mono text-[11px]`}
      />
      <button
        type="button" onClick={addExclusion}
        className="shrink-0 rounded-[3px] px-2.5 py-1.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-400 transition-colors duration-150 ease-in-out hover:text-brand"
      >
        Excluir
      </button>
      {exclude.map((ip) => (
        <span key={ip} className="flex items-center gap-1.5 rounded-[2px] border border-line-300 bg-white px-2 py-1 font-mono text-[11px] text-ink-700">
          {ip}
          <button type="button" onClick={() => onChange(exclude.filter((e) => e !== ip))} className="text-ink-300 transition-colors duration-150 ease-in-out hover:text-brand-severe">
            <X size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}
