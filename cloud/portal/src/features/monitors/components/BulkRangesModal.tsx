import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { BrandModal } from '../../../shared/components/BrandModal';
import { fmt } from '../../../shared/lib/formatters';
import type { IpRange } from '../../../shared/types/agents';
import { capWarnings, countTotalDeclaredIps, formatLapDuration, isRangeEnabled, parseRanges, type InvalidEntry, type ParseRangesResult } from '../lib/parseRanges';

const LABEL = 'mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300';
const TEXTAREA = 'w-full resize-y rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-mono text-[12px] leading-[1.6] text-ink-900 outline-none focus:border-brand';
const PLACEHOLDER = '10.10.7.1-10.10.7.254, 10.7.7.1-10.7.7.254, 10.101.7.0/24, 10.4.1.20, impresora-piso3.corp.local';

/** Resumen en vivo del pegado — es lo único que el operador puede mirar para
 *  decidir si el texto que trajo del sistema viejo entró bien. La vuelta se
 *  estima sobre la lista RESULTANTE (`resultingIps`), no sobre el pegado: si se
 *  pega encima de una lista ya cargada, el costo del pegado solo es un número
 *  que no existe en ningún lado y siempre miente para abajo. */
function PreviewLine({ result, resultingIps }: { result: ParseRangesResult; resultingIps: number }) {
  const box = 'rounded-[3px] border border-line-150 bg-surface-input px-3 py-2.5 font-sans text-[12px]';
  if (result.valid.length + result.duplicates.length + result.invalid.length === 0) {
    return <div className={`${box} text-ink-300`}>La previa aparece acá a medida que pegás.</div>;
  }
  return (
    <div className={`${box} text-ink-400`}>
      <span className="font-semibold text-ink-900">{result.valid.length} válidos</span>
      {' · '}{result.duplicates.length} duplicados descartados
      {' · '}<span className={result.invalid.length > 0 ? 'font-semibold text-brand-severe' : undefined}>{result.invalid.length} inválidos</span>
      {' · '}{fmt(result.totalIps)} IPs nuevas
      {' · '}vuelta estimada ~{formatLapDuration(resultingIps)}
    </div>
  );
}

function InvalidList({ items }: { items: InvalidEntry[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-[3px] border border-brand-chip-border bg-brand-soft p-3">
      <p className={`${LABEL} text-brand-accent`}>Entradas a corregir</p>
      <ul className="max-h-32 space-y-1 overflow-y-auto pr-1">
        {items.map((entry, i) => (
          <li key={`${entry.text}-${i}`} className="font-mono text-[11px] text-ink-700">
            {entry.text} <span className="font-sans text-ink-400">— {entry.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Exportado para que el editor de rangos (`IpRangesEditor`) muestre los MISMOS
 *  avisos que el pegado: los topes son del agente entero, así que también se
 *  pasan agregando rangos de a uno, y ahí antes no se avisaba nada. */
export function WarningsList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex gap-2.5 rounded-[3px] border border-brand-warn-border bg-brand-soft p-3 text-brand-warn-text">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <ul className="space-y-1 font-sans text-[11.5px] font-semibold leading-tight">
        {items.map((w) => <li key={w}>{w}</li>)}
      </ul>
    </div>
  );
}

function PasteField({ text, onText }: { text: string; onText: (value: string) => void }) {
  return (
    <div>
      <label className={LABEL} htmlFor="bulk-ranges">Rangos separados por coma, punto y coma, espacio o salto de línea</label>
      <textarea
        id="bulk-ranges" rows={7} value={text} placeholder={PLACEHOLDER}
        onChange={(e) => onText(e.target.value)} className={TEXTAREA}
      />
      <p className="mt-1.5 font-sans text-[11px] text-ink-300">
        Acepta rangos <span className="font-mono">inicio-fin</span>, bloques <span className="font-mono">CIDR</span>, IPs sueltas y hostnames.
      </p>
    </div>
  );
}

function ModalFooter({ onClose, onAdd, count }: { onClose: () => void; onAdd: () => void; count: number }) {
  return (
    <div className="flex justify-end gap-3 pt-1">
      <button type="button" onClick={onClose} className="rounded-[3px] border border-line-300 bg-white px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover">
        Cancelar
      </button>
      <button
        type="button" onClick={onAdd} disabled={count === 0}
        className="rounded-[3px] bg-brand px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50"
      >
        {count > 0 ? `Agregar ${count}` : 'Agregar'}
      </button>
    </div>
  );
}

/** Todo lo que se deriva del texto pegado en un solo lugar: lo que se va a
 *  agregar, cómo queda la lista después de agregarlo y qué cuesta esa lista. */
function usePastePreview(text: string, existing: IpRange[]) {
  const result = useMemo(() => parseRanges(text, existing), [text, existing]);
  const merged = useMemo(() => [...existing, ...result.valid], [existing, result.valid]);
  const warnings = useMemo(() => capWarnings(merged), [merged]);
  // Sólo lo habilitado cuesta vuelta — mismo criterio que el resumen del editor.
  const resultingIps = useMemo(() => countTotalDeclaredIps(merged.filter(isRangeEnabled)), [merged]);
  return { result, warnings, resultingIps };
}

/**
 * Carga masiva de rangos IP pegando el listado del sistema viejo (caso real:
 * 59 rangos en un solo string separado por comas). SUMA a la lista existente,
 * nunca la reemplaza, y deduplica contra ella — el operador puede pegar dos
 * veces el mismo export sin ensuciar la configuración.
 *
 * Todo el parseo vive en `lib/parseRanges.ts` (puro y testeado); acá sólo se
 * refleja el resultado en vivo mientras se pega.
 */
export default function BulkRangesModal({ existing, onAdd, onClose }: {
  existing: IpRange[]; onAdd: (ranges: IpRange[]) => void; onClose: () => void;
}) {
  const [text, setText] = useState('');
  const { result, warnings, resultingIps } = usePastePreview(text, existing);

  return (
    <BrandModal isOpen onClose={onClose} title="Pegar lista de rangos" widthPx={620}>
      <div className="space-y-4">
        <PasteField text={text} onText={setText} />
        <PreviewLine result={result} resultingIps={resultingIps} />
        <WarningsList items={warnings} />
        <InvalidList items={result.invalid} />
        <ModalFooter onClose={onClose} onAdd={() => onAdd(result.valid)} count={result.valid.length} />
      </div>
    </BrandModal>
  );
}
