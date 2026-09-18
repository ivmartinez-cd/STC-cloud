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
 * Tab "Red" del detalle del monitor (ex "Segmentos", 18/09/2026): todo lo que
 * es de red del sitio — nombre, comunidad SNMP y los rangos IP barridos — a
 * ancho completo. Antes el nombre y la comunidad vivían en "Parámetros de
 * red" dentro de Configuración, y los rangos en una columna angosta con
 * scroll interno: con 59 rangos (caso real) se veían 3 o 4 por pantalla.
 *
 * Formulario y guardado propios: manda `name` + `snmp` + `ip_ranges` y el
 * resto de la config tal cual está en el monitor (`formFromMonitor`) por el
 * mismo `PUT /agents/:id/config` que el tab Configuración. `baseline` es lo
 * último guardado (no `monitor.config`/`monitor.name`, que se refrescan
 * después y podrían venir normalizados distinto): contra eso se mide
 * "cambios sin guardar" y a eso vuelve Descartar.
 */
export default function SegmentsTabPanel({ monitor, onSave }: Props) {
  const [baseline, setBaseline] = useState<IpRange[]>(() => monitor.config?.ip_ranges ?? []);
  const [ranges, setRanges] = useState<IpRange[]>(baseline);
  const [nameBaseline, setNameBaseline] = useState(() => monitor.name);
  const [name, setName] = useState(nameBaseline);
  const [snmpBaseline, setSnmpBaseline] = useState(() => monitor.config?.snmp_community ?? 'public');
  const [snmp, setSnmp] = useState(snmpBaseline);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const dirty = JSON.stringify(ranges) !== JSON.stringify(baseline) || snmp !== snmpBaseline || name !== nameBaseline;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { showToast('El nombre del sitio no puede quedar vacío', 'warning'); return; }
    const problem = firstRangeProblem(ranges);
    if (problem) { showToast(problem, 'warning'); return; }
    setSaving(true);
    try {
      await onSave({ ...formFromMonitor(monitor), ip_ranges: ranges, snmp, name });
      setBaseline(ranges);
      setSnmpBaseline(snmp);
      setNameBaseline(name);
    } catch (err: unknown) {
      showToast((err as Error).message || 'Error al actualizar la red', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex min-h-0 flex-1 flex-col rounded-[5px] border border-line-100 bg-white p-5 short:p-4">
        <div className="mb-3.5 flex flex-wrap items-end gap-4 border-b border-line-150 pb-3.5">
          <div>
            <label className="mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Nombre del sitio</label>
            <input
              required type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-56 rounded-[3px] border border-line-300 bg-white px-3 py-2 font-sans text-[13px] text-ink-900 outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">Comunidad SNMP</label>
            <input
              type="text" value={snmp} onChange={e => setSnmp(e.target.value)}
              className="w-40 rounded-[3px] border border-line-300 bg-white px-3 py-2 font-mono text-[13px] text-ink-900 outline-none focus:border-brand"
            />
          </div>
          <p className="ml-auto font-sans text-[11.5px] text-ink-300">
            Comunidad v1/v2c por defecto del barrido; las credenciales adicionales por rango se cargan en Seguridad.
          </p>
        </div>
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
          type="button" disabled={!dirty} onClick={() => { setRanges(baseline); setSnmp(snmpBaseline); setName(nameBaseline); }}
          className="rounded-[3px] border border-line-300 bg-white px-5 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover disabled:opacity-50"
        >
          Descartar
        </button>
        <button
          type="submit" disabled={saving || !dirty}
          className="flex items-center gap-2.5 rounded-[3px] bg-brand px-5 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50"
        >
          {saving && <Loader2 size={14} className="animate-spin" />} Guardar cambios
        </button>
      </div>
    </form>
  );
}
