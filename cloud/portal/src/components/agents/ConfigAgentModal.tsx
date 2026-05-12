import { useState, useEffect } from 'react';
import { X, Settings, Plus, Trash2, Loader2, Check } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import type { AgentConfig } from '../../types/agents';
import { emptyRange, defaultConfig } from '../../types/agents';

interface Props {
  modal: { id: string; name: string } | null;
  onClose: () => void;
}

export default function ConfigAgentModal({ modal, onClose }: Props) {
  const { showToast } = useToast();
  const [configForm, setConfigForm] = useState<AgentConfig>(defaultConfig);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    if (!modal) return;
    setLoadingConfig(true);
    api.get<AgentConfig>(`/agents/${modal.id}/config`)
      .then(data => setConfigForm({
        ip_ranges: data?.ip_ranges ?? [],
        snmp_community: data?.snmp_community ?? 'public',
        scan_interval_minutes: data?.scan_interval_minutes ?? 15,
      }))
      .catch(() => setConfigForm(defaultConfig))
      .finally(() => setLoadingConfig(false));
  }, [modal]);

  const handleClose = () => {
    setConfigForm(defaultConfig);
    onClose();
  };

  const updateRange = (idx: number, field: 'start' | 'end', value: string) =>
    setConfigForm(f => ({
      ...f,
      ip_ranges: f.ip_ranges.map((r, i) => i === idx ? { ...r, [field]: value } : r),
    }));

  const saveConfig = async () => {
    if (!modal) return;
    for (const r of configForm.ip_ranges) {
      if (!r.start.trim() || !r.end.trim()) {
        showToast('Todos los rangos deben tener IP de inicio y fin', 'warning');
        return;
      }
    }
    setSavingConfig(true);
    try {
      await api.put(`/agents/${modal.id}/config`, {
        ip_ranges: configForm.ip_ranges,
        snmp_community: configForm.snmp_community,
        scan_interval_minutes: configForm.scan_interval_minutes,
      });
      showToast('Configuración remota actualizada', 'success');
      handleClose();
    } catch (e: unknown) {
      showToast('Error al guardar: ' + (e as Error).message, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  if (!modal) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 bg-[#1a2333]/70 backdrop-blur-md animate-overlay-in">
      <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden animate-modal-in border border-white/20">
        <header className="px-10 py-10 bg-gradient-to-r from-[#1a2333] to-[#2c3e50] text-white flex justify-between items-center relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-2xl font-black tracking-tight uppercase">Control Remoto</h2>
            <p className="text-[10px] font-black text-blue-300 uppercase tracking-[0.2em] mt-1">Ajustes del nodo: {modal.name}</p>
          </div>
          <button onClick={handleClose} className="relative z-10 p-3 hover:bg-white/10 rounded-2xl transition-all active:scale-90">
            <X size={28} />
          </button>
          <div className="absolute -right-10 -top-10 opacity-10">
            <Settings size={160} />
          </div>
        </header>

        <div className="p-12">
          {loadingConfig ? (
            <div className="py-24 text-center">
              <Loader2 size={64} className="animate-spin text-brand mx-auto mb-6" />
              <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Sincronizando con Agente...</p>
            </div>
          ) : (
            <div className="space-y-10">
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Segmentos IP Activos</label>
                  <button
                    onClick={() => setConfigForm(f => ({ ...f, ip_ranges: [...f.ip_ranges, emptyRange()] }))}
                    className="flex items-center gap-2 text-[10px] font-black text-brand hover:text-[#2471a3] uppercase tracking-widest"
                  >
                    <Plus size={14} /> ADJUNTAR RANGO
                  </button>
                </div>

                <div className="space-y-4 max-h-[250px] overflow-y-auto pr-4 custom-scrollbar">
                  {configForm.ip_ranges.length === 0 && (
                    <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-[32px]">
                      <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Sin segmentación configurada</p>
                    </div>
                  )}
                  {configForm.ip_ranges.map((range, idx) => (
                    <div key={idx} className="flex items-center gap-4 animate-in slide-in-from-right-4 bg-slate-50 p-2 rounded-[24px]">
                      <input
                        type="text"
                        placeholder="IP Inicio"
                        value={range.start}
                        onChange={e => updateRange(idx, 'start', e.target.value)}
                        className="cd-input w-full !h-12 !text-xs font-mono !bg-white border-transparent focus:!border-brand"
                      />
                      <span className="text-slate-300 font-black">—</span>
                      <input
                        type="text"
                        placeholder="IP Fin"
                        value={range.end}
                        onChange={e => updateRange(idx, 'end', e.target.value)}
                        className="cd-input w-full !h-12 !text-xs font-mono !bg-white border-transparent focus:!border-brand"
                      />
                      <button
                        onClick={() => setConfigForm(f => ({ ...f, ip_ranges: f.ip_ranges.filter((_, i) => i !== idx) }))}
                        className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-10">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Comunidad SNMP</label>
                  <input
                    type="text"
                    value={configForm.snmp_community}
                    onChange={e => setConfigForm(f => ({ ...f, snmp_community: e.target.value }))}
                    className="cd-input w-full !h-14 !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white font-mono"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Frecuencia (Minutos)</label>
                  <input
                    type="number"
                    min={1}
                    value={configForm.scan_interval_minutes}
                    onChange={e => setConfigForm(f => ({ ...f, scan_interval_minutes: Number(e.target.value) }))}
                    className="cd-input w-full !h-14 !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white"
                  />
                </div>
              </div>

              <div className="flex gap-6 pt-6">
                <button
                  onClick={handleClose}
                  className="flex-1 py-5 rounded-[24px] border border-slate-200 text-slate-500 font-black uppercase tracking-widest text-xs hover:bg-slate-50 transition-all active:scale-95"
                >
                  Cerrar
                </button>
                <button
                  onClick={saveConfig}
                  disabled={savingConfig}
                  className="flex-2 px-12 py-5 bg-[#e67e22] hover:bg-[#d35400] disabled:opacity-40 text-white text-xs font-black rounded-[24px] shadow-2xl shadow-orange-900/20 transition-all active:scale-95 flex items-center justify-center gap-3 uppercase tracking-widest"
                >
                  {savingConfig ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
                  {savingConfig ? 'Sincronizando...' : 'APLICAR CONFIGURACIÓN'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
