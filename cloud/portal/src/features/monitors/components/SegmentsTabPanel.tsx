import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '../../../store/ToastContext';
import type { IpRange } from '../../../shared/types/agents';
import type { EditFormData, MonitorData } from '../../../shared/types/monitor';
import { firstRangeProblem } from '../lib/rangeSpecText';
import IpRangesEditor from './IpRangesEditor';
import { formFromMonitor } from './configFormHelpers';

interface Props {
  monitor: MonitorData;
  onSave: (form: EditFormData) => Promise<void>;
}

/**
 * Tab "Segmentos" del detalle del monitor: los rangos IP barridos, solos y a
 * ancho completo. Antes vivían en la columna izquierda del tab Configuración,
 * con scroll interno en un tercio del ancho: con 59 rangos (caso real) se
 * veían 3 o 4 por pantalla. Es lo único de la configuración que crece con el
 * cliente; el resto (umbrales, horario, credenciales) es chico y estable.
 *
 * Formulario y guardado propios: manda `ip_ranges` y el resto de la config
 * tal cual está en el monitor (`formFromMonitor`) por el mismo
 * `PUT /agents/:id/config` que el tab Configuración. `baseline` es lo último
 * guardado (no `monitor.config`, que se refresca después y podría venir
 * normalizado distinto): contra eso se mide "cambios sin guardar" y a eso
 * vuelve Descartar.
 */
export default function SegmentsTabPanel({ monitor, onSave }: Props) {
  const [baseline, setBaseline] = useState<IpRange[]>(() => monitor.config?.ip_ranges ?? []);
  const [ranges, setRanges] = useState<IpRange[]>(baseline);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const dirty = JSON.stringify(ranges) !== JSON.stringify(baseline);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = firstRangeProblem(ranges);
    if (problem) { showToast(problem, 'warning'); return; }
    setSaving(true);
    try {
      await onSave({ ...formFromMonitor(monitor), ip_ranges: ranges });
      setBaseline(ranges);
    } catch (err: unknown) {
      showToast((err as Error).message || 'Error al actualizar los segmentos', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex min-h-0 flex-1 flex-col rounded-[5px] border border-line-100 bg-white p-5 short:p-4">
        <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line-150 pb-3">
          <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Segmentos IP barridos</span>
          <p className="font-sans text-[11.5px] text-ink-300">
            El agente recorre estas direcciones en cada vuelta de descubrimiento. Un segmento deshabilitado conserva su configuración pero no se barre.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <IpRangesEditor ranges={ranges} onChange={setRanges} credentials={monitor.config?.snmp_credentials ?? []} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {dirty && <span className="mr-auto font-sans text-[11.5px] text-brand-accent">Cambios sin guardar</span>}
        <button
          type="button" disabled={!dirty} onClick={() => setRanges(baseline)}
          className="rounded-[3px] border border-line-300 bg-white px-5 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover disabled:opacity-50"
        >
          Descartar
        </button>
        <button
          type="submit" disabled={saving || !dirty}
          className="flex items-center gap-2.5 rounded-[3px] bg-brand px-5 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50"
        >
          {saving && <Loader2 size={14} className="animate-spin" />} Guardar segmentos
        </button>
      </div>
    </form>
  );
}
