import { useState } from 'react';
import { X, Loader2, Settings } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import type { EditFormData, MonitorData } from '../../types/monitor';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  monitor: MonitorData;
  onSave: (form: EditFormData) => Promise<void>;
}

function getInitialForm(monitor: MonitorData): EditFormData {
  const ranges = typeof monitor.config?.ip_ranges === 'string'
    ? JSON.parse(monitor.config.ip_ranges as unknown as string)
    : (monitor.config?.ip_ranges ?? []);
  const firstRange = (ranges as { start: string; end: string }[])[0] ?? { start: '', end: '' };
  return {
    name: monitor.name,
    ipStart: firstRange.start,
    ipEnd: firstRange.end,
    snmp: monitor.config?.snmp_community ?? 'public',
    interval: monitor.config?.scan_interval_minutes ?? 15,
  };
}

const EditMonitorModal = ({ isOpen, onClose, monitor, onSave }: Props) => {
  const [form, setForm] = useState<EditFormData>(() => getInitialForm(monitor));
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err: unknown) {
      showToast((err as Error).message || 'Error al actualizar configuración', 'error');
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof EditFormData, value: string | number) =>
    setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-[#1a2333]/60 backdrop-blur-md animate-overlay-in">
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden animate-modal-in">
        <header className="px-10 py-10 bg-gradient-to-r from-[#1a2333] to-[#2c3e50] text-white flex justify-between items-center relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-2xl font-black tracking-tight uppercase">Configuración del Nodo</h2>
            <p className="text-[10px] font-black text-blue-300 uppercase tracking-[0.2em] mt-1">Ajustes técnicos de escaneo</p>
          </div>
          <button onClick={onClose} className="relative z-10 p-3 hover:bg-white/10 rounded-2xl transition-all active:scale-90">
            <X size={28} />
          </button>
          <div className="absolute -right-10 -top-10 opacity-10">
            <Settings size={160} />
          </div>
        </header>

        <form onSubmit={handleSubmit} className="p-12 space-y-8">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre del Nodo</label>
            <input
              required type="text" value={form.name}
              className="cd-input w-full !h-14 !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white"
              onChange={e => set('name', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">IP Inicial</label>
              <input type="text" value={form.ipStart}
                className="cd-input w-full !h-14 !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white font-mono"
                onChange={e => set('ipStart', e.target.value)}
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">IP Final</label>
              <input type="text" value={form.ipEnd}
                className="cd-input w-full !h-14 !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white font-mono"
                onChange={e => set('ipEnd', e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Comunidad SNMP</label>
              <input type="text" value={form.snmp}
                className="cd-input w-full !h-14 !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white"
                onChange={e => set('snmp', e.target.value)}
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Intervalo (Minutos)</label>
              <select value={form.interval}
                className="cd-input w-full !h-14 !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white"
                onChange={e => set('interval', parseInt(e.target.value))}
              >
                <option value={15}>Cada 15 min</option>
                <option value={30}>Cada 30 min</option>
                <option value={60}>Cada 1 hora</option>
                <option value={1440}>Cada 24 horas</option>
              </select>
            </div>
          </div>
          <div className="flex gap-4 pt-4">
            <button type="button" onClick={onClose}
              className="flex-1 py-5 rounded-[24px] border border-slate-200 text-slate-500 font-black uppercase tracking-widest text-xs hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-5 bg-brand text-white rounded-[24px] font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-900/20 flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditMonitorModal;
