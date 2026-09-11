import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardPaste, Plus } from 'lucide-react';
import type { IpRange } from '../../../shared/types/agents';
import { emptyRange } from '../../../shared/types/agents';
import type { MaskedSnmpCredential } from '../../../shared/types/monitor';
import { fmt } from '../../../shared/lib/formatters';
import { capWarnings } from '../lib/parseRanges';
import { applySpecText, rangeToText, summaryText } from '../lib/rangeSpecText';
import BulkRangesModal, { WarningsList } from './BulkRangesModal';
import IpRangeRow, { ROW_GRID } from './IpRangeRow';

/**
 * Editor de `ip_ranges` — una fila densa por entrada (`IpRangeRow`): rango
 * inicio-fin, CIDR, IP suelta o hostname (point lookup — el agente lo
 * resuelve por DNS en cada ciclo de discovery), con etiqueta, toggle de
 * habilitado, exclusiones y credenciales SNMP por rango. Controlado
 * (`ranges`/`onChange`) — el guardado real sigue viviendo en el
 * `PUT /agents/:id/config` de cada consumidor (tab Segmentos del detalle del
 * monitor y `ConfigAgentModal`); acá sólo se edita el array en memoria. El
 * cloud valida formato/topes en serio al guardar (`services/ipRangeSpec.ts`)
 * y puede devolver `warnings` no bloqueantes que cada consumidor muestra aparte.
 *
 * El tipo de cada entrada se infiere de lo tipeado (`applySpecText`, mismo
 * parser que el pegado masivo). El borrador de la fila con foco vive acá
 * (`editing`) y no en `ranges`: mientras se tipea `10.0.0.1-10.0.0.2` el
 * texto intermedio no es un rango válido y el input tiene que seguir
 * mostrando lo escrito, no la última forma válida.
 *
 * Carga masiva (`BulkRangesModal`) + resumen fijo arriba: un cliente real
 * llegó con 59 rangos exportados del sistema viejo en un solo string. Con esa
 * cantidad la lista mide varias pantallas, así que el resumen (rangos / IPs /
 * vuelta estimada), los avisos de tope, los dos botones y el encabezado de
 * columnas viven en una barra `sticky` arriba de todo, no al pie.
 *
 * `credential_ids` sólo aparece si el agente tiene credenciales adicionales
 * configuradas (`credentials`, ver `SnmpCredentialsPanel`). Un valor ya
 * seteado por API se preserva intacto al editar otro campo de la misma
 * entrada (`update()` spreadea el objeto entero, nunca reconstruye uno "limpio").
 */
interface Props {
  ranges: IpRange[];
  onChange: (ranges: IpRange[]) => void;
  credentials?: MaskedSnmpCredential[];
}

const TOOLBAR_BTN = 'flex items-center gap-1.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand transition-colors duration-150 ease-in-out hover:text-brand-severe';
const COL_LABEL = 'font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300';

/** Tarjeta placeholder sin nada tipeado. La carga masiva la barre: si queda,
 *  la validación de forma previa al PUT rechaza el guardado entero por una
 *  fila vacía que encima quedó arriba de las 59 recién pegadas. */
function isBlankEntry(range: IpRange): boolean {
  return !rangeToText(range).trim() && !range.label?.trim();
}

/** Resumen + acciones + avisos de tope + encabezado SIEMPRE arriba y pegados
 *  al scroll: con 59 filas el pie de la lista queda fuera de la pantalla y el
 *  operador no se entera de que se pasó de los topes hasta el 400. El `max-h`
 *  acota los avisos: son 4 como mucho, pero envuelven. */
function RangesToolbar({ ranges, onAdd, onPaste }: { ranges: IpRange[]; onAdd: () => void; onPaste: () => void }) {
  const warnings = capWarnings(ranges);
  return (
    <div className="sticky top-0 z-10 border-b border-line-150 bg-white pb-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="font-sans text-[11.5px] text-ink-400">{summaryText(ranges, fmt)}</p>
        <div className="flex items-center gap-4">
          <button type="button" onClick={onPaste} className={TOOLBAR_BTN}><ClipboardPaste size={13} /> Pegar lista</button>
          <button type="button" onClick={onAdd} className={TOOLBAR_BTN}><Plus size={14} /> Adjuntar rango</button>
        </div>
      </div>
      {warnings.length > 0 && (
        <div className="mt-2 max-h-[5.5rem] overflow-y-auto"><WarningsList items={warnings} /></div>
      )}
      {ranges.length > 0 && (
        <div className={`${ROW_GRID} mt-2.5 px-2`}>
          <span className="w-[26px]" />
          <span className={COL_LABEL}>Segmento (rango, CIDR, IP o hostname)</span>
          <span className={COL_LABEL}>Etiqueta</span>
          <span /><span /><span />
        </div>
      )}
    </div>
  );
}

export default function IpRangesEditor({ ranges, onChange, credentials = [] }: Props) {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<{ idx: number; text: string } | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const update = (idx: number, patch: Partial<IpRange>) =>
    onChange(ranges.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const setText = (idx: number, text: string) => {
    setEditing({ idx, text });
    onChange(ranges.map((r, i) => (i === idx ? applySpecText(r, text) : r)));
  };

  // Los índices se corren al borrar: el borrador y el detalle abierto se
  // resuelven por índice, así que se cierran o se corrigen acá mismo.
  const remove = (idx: number) => {
    onChange(ranges.filter((_, i) => i !== idx));
    setEditing(null);
    setExpanded((e) => (e === null || e === idx ? null : e > idx ? e - 1 : e));
  };

  const addBulk = (added: IpRange[]) => {
    onChange([...ranges.filter((r) => !isBlankEntry(r)), ...added]);
    setEditing(null);
    setExpanded(null);
    setBulkOpen(false);
  };

  return (
    <div className="space-y-1.5">
      <RangesToolbar ranges={ranges} onAdd={() => onChange([...ranges, emptyRange()])} onPaste={() => setBulkOpen(true)} />

      {/* Al `body`, no acá: la card de `ConfigAgentModal` queda con `transform`
          computado (`animate-modal-in` es `fill-mode: forwards`) + `overflow-hidden`,
          así que es el bloque contenedor de todo `position: fixed` descendiente y
          recortaba el overlay del pegado contra ella en vez de contra la pantalla. */}
      {bulkOpen && createPortal(
        <BulkRangesModal existing={ranges} onAdd={addBulk} onClose={() => setBulkOpen(false)} />,
        document.body,
      )}

      {ranges.length === 0 && (
        <div className="rounded-[5px] border border-dashed border-line-300 bg-white py-8 text-center">
          <p className="font-montserrat text-[10px] font-bold uppercase tracking-[.13em] text-ink-300">Sin segmentación configurada</p>
          <p className="mt-1.5 font-sans text-[11.5px] text-ink-300">Pegá la lista del cliente o adjuntá un rango a mano.</p>
        </div>
      )}

      {ranges.map((range, idx) => (
        <IpRangeRow
          key={idx}
          range={range}
          text={editing?.idx === idx ? editing.text : rangeToText(range)}
          credentials={credentials}
          expanded={expanded === idx}
          onText={(text) => setText(idx, text)}
          onFocus={() => setEditing({ idx, text: rangeToText(range) })}
          onBlur={() => setEditing(null)}
          onPatch={(patch) => update(idx, patch)}
          onToggleExpand={() => setExpanded((e) => (e === idx ? null : idx))}
          onRemove={() => remove(idx)}
        />
      ))}
    </div>
  );
}
