import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Loader2, Info } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import type { IpRange, MonitorConfig } from '../../types/monitorsPage';

const emptyRange = (): IpRange => ({ start: '', end: '' });

const defaultConfig: MonitorConfig = {
  ip_ranges: [],
  snmp_community: 'public',
};

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-overlay-in">
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-2xl overflow-hidden animate-modal-in">
        <header className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-[#58595b] to-[#1a2333] text-white">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">Configuración Remota</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-1">{monitor.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <X size={24} />
          </button>
        </header>

        {loadingConfig ? (
          <div className="p-20 text-center flex flex-col items-center gap-4">
            <Loader2 size={32} className="animate-spin text-brand" />
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Obteniendo parámetros...</p>
          </div>
        ) : (
          <div className="p-8 space-y-8">
            <div className="space-y-4">
              <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Rangos de Red Activos</label>
                <button
                  onClick={() => setConfigForm(f => ({ ...f, ip_ranges: [...f.ip_ranges, emptyRange()] }))}
                  className="flex items-center gap-1.5 text-[10px] font-extrabold text-brand uppercase"
                >
                  <Plus size={14} /> Nuevo Rango
                </button>
              </div>

              {configForm.ip_ranges.length === 0 && (
                <div className="py-8 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                  <p className="text-xs text-slate-400 font-medium">No hay rangos definidos. El monitor no realizará escaneos.</p>
                </div>
              )}

              <div className="space-y-3 max-h-[30vh] overflow-y-auto pr-2 custom-scrollbar">
                {configForm.ip_ranges.map((range, idx) => (
                  <div key={idx} className="flex items-center gap-4">
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
                      className="cd-input flex-1 !h-11 !bg-slate-50 border-transparent focus:!bg-white focus:!border-brand font-mono text-xs"
                    />
                    <div className="h-px w-4 bg-slate-200" />
                    <input
                      type="text"
                      placeholder="IP Fin"
                      value={range.end}
                      onChange={e => setConfigForm(f => ({ ...f, ip_ranges: f.ip_ranges.map((r, i) => i === idx ? { ...r, end: e.target.value } : r) }))}
                      className="cd-input flex-1 !h-11 !bg-slate-50 border-transparent focus:!bg-white focus:!border-brand font-mono text-xs"
                    />
                    <button
                      onClick={() => setConfigForm(f => ({ ...f, ip_ranges: f.ip_ranges.filter((_, i) => i !== idx) }))}
                      className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Comunidad SNMP</label>
              <input
                type="text"
                value={configForm.snmp_community}
                onChange={e => setConfigForm(f => ({ ...f, snmp_community: e.target.value }))}
                className="cd-input w-full !h-12 !bg-slate-50 border-transparent focus:!bg-white focus:!border-brand font-mono text-xs"
              />
            </div>

            <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex items-start gap-3">
              <Info size={16} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[10px] text-amber-800 font-bold uppercase tracking-tight leading-relaxed">
                Nota: Los cambios se enviarán al monitor y se aplicarán en su próximo ciclo de actualización (máx. 60s).
              </p>
            </div>

            <div className="flex justify-end gap-4 pt-2">
              <button
                onClick={onClose}
                className="px-6 py-3 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
              >
                Descartar
              </button>
              <button
                onClick={saveConfig}
                disabled={savingConfig}
                className="px-8 py-3 bg-[#f7931d] hover:bg-[#d35400] disabled:opacity-40 text-white text-sm font-extrabold rounded-xl transition-all shadow-lg shadow-orange-900/20 flex items-center gap-2"
              >
                {savingConfig ? <Loader2 size={18} className="animate-spin" /> : 'Aplicar Cambios'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
