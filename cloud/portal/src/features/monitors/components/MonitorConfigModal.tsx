import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Loader2, Info } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import type { IpRange, MonitorConfig } from '../types/monitorsPage';

const emptyRange = (): IpRange => ({ start: '', end: '' });

const defaultConfig: MonitorConfig = {
  ip_ranges: [],
  snmp_community: 'public',
};

const LABEL = 'font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300';
const INPUT = 'rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[12.5px] text-ink-900 outline-none focus:border-brand';

export default function MonitorConfigModal({ monitor, onClose }: { monitor: { id: string; name: string }; onClose: () => void }) {
  const { showToast } = useToast();
  const [configForm, setConfigForm] = useState<MonitorConfig>(defaultConfig);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);

  const load = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const data = await api.get<MonitorConfig>(`/agents/${monitor.id}/config`);
      setConfigForm({
        ip_ranges: data?.ip_ranges ?? [],
        snmp_community: data?.snmp_community ?? 'public',
      });
    } catch {
      showToast('No se pudo cargar la configuración remota', 'warning');
      setConfigForm(defaultConfig);
    } finally {
      setLoadingConfig(false);
    }
  }, [monitor.id, showToast]);

  useEffect(() => { void load(); }, [load]);

  const saveConfig = async () => {
    for (const r of configForm.ip_ranges) {
      if (!r.start.trim() || !r.end.trim()) {
        showToast('Todos los rangos deben tener IP de inicio y fin.', 'warning');
        return;
      }
    }
    setSavingConfig(true);
    try {
      await api.put(`/agents/${monitor.id}/config`, {
        ip_ranges: configForm.ip_ranges,
        snmp_community: configForm.snmp_community,
      });
      showToast('Configuración actualizada correctamente', 'success');
      onClose();
    } catch (e: unknown) {
      showToast('Error al guardar: ' + (e as Error).message, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-overlay-in" style={{ background: 'rgba(20,20,20,.55)' }}>
      <div className="w-full max-w-2xl overflow-hidden rounded-[16px] bg-white animate-modal-in" style={{ boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <header className="flex items-center justify-between border-b border-line-150 px-8 py-6">
          <div>
            <h2 className="font-montserrat text-[18px] font-extrabold tracking-[-.01em] text-ink-900">Configuración remota</h2>
            <p className="mt-1 font-montserrat text-[10px] font-bold uppercase tracking-[.13em] text-ink-300">{monitor.name}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-[3px] p-1.5 text-ink-300 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover hover:text-ink-600">
            <X size={20} />
          </button>
        </header>

        {loadingConfig ? (
          <div className="flex flex-col items-center gap-4 p-20 text-center">
            <Loader2 size={32} className="animate-spin text-brand" />
            <p className="font-montserrat text-[10px] font-bold uppercase tracking-[.13em] text-ink-300">Obteniendo parámetros...</p>
          </div>
        ) : (
          <div className="space-y-6 p-8">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className={LABEL}>Rangos de red activos</label>
                <button
                  onClick={() => setConfigForm(f => ({ ...f, ip_ranges: [...f.ip_ranges, emptyRange()] }))}
                  className="flex items-center gap-1.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand transition-colors duration-150 ease-in-out hover:text-brand-severe"
                >
                  <Plus size={14} /> Nuevo rango
                </button>
              </div>

              {configForm.ip_ranges.length === 0 && (
                <div className="rounded-[5px] border border-dashed border-line-300 bg-white py-8 text-center">
                  <p className="font-sans text-[12px] text-ink-300">No hay rangos definidos. El monitor no realizará escaneos.</p>
                </div>
              )}

              <div className="max-h-[30vh] space-y-2.5 overflow-y-auto pr-2">
                {configForm.ip_ranges.map((range, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <input
                      type="text"
                      placeholder="IP Inicio"
                      value={range.start}
                      onChange={e => {
                        const val = e.target.value;
                        setConfigForm(f => ({
                          ...f,
                          ip_ranges: f.ip_ranges.map((r, i) => {
                            if (i !== idx) return r;
                            return { ...r, start: val };
                          })
                        }));
                      }}
                      className={`${INPUT} flex-1 font-mono`}
                    />
                    <span className="text-ink-200">—</span>
                    <input
                      type="text"
                      placeholder="IP Fin"
                      value={range.end}
                      onChange={e => setConfigForm(f => ({ ...f, ip_ranges: f.ip_ranges.map((r, i) => i === idx ? { ...r, end: e.target.value } : r) }))}
                      className={`${INPUT} flex-1 font-mono`}
                    />
                    <button
                      onClick={() => setConfigForm(f => ({ ...f, ip_ranges: f.ip_ranges.filter((_, i) => i !== idx) }))}
                      className="rounded-[3px] p-1.5 text-ink-300 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover hover:text-brand-severe"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={LABEL}>Comunidad SNMP</label>
              <input
                type="text"
                value={configForm.snmp_community}
                onChange={e => setConfigForm(f => ({ ...f, snmp_community: e.target.value }))}
                className={`${INPUT} w-full font-mono`}
              />
            </div>

            <div className="flex items-start gap-3 rounded-[3px] border border-brand-chip-border bg-brand-soft p-3.5">
              <Info size={16} className="mt-0.5 shrink-0 text-brand-accent" />
              <p className="font-sans text-[11.5px] font-semibold leading-[1.5] text-brand-accent">
                Nota: Los cambios se enviarán al monitor y se aplicarán en su próximo ciclo de actualización (máx. 60s).
              </p>
            </div>

            <div className="flex justify-end gap-2.5 pt-1">
              <button
                onClick={onClose}
                className="rounded-[3px] border border-line-300 bg-white px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover"
              >
                Descartar
              </button>
              <button
                onClick={saveConfig}
                disabled={savingConfig}
                className="flex items-center gap-2 rounded-[3px] bg-brand px-5 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50"
              >
                {savingConfig ? <Loader2 size={16} className="animate-spin" /> : 'Aplicar cambios'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
