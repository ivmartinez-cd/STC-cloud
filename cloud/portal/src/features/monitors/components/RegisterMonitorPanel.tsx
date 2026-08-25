import { useState } from 'react';
import { Radio, Plus, Trash2, Key, Loader2 } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import type { IpRange, ClientOption } from '../types/monitorsPage';

const emptyRange = (): IpRange => ({ start: '', end: '' });

export default function RegisterMonitorPanel({
  clients,
  onCreated,
}: {
  clients: ClientOption[];
  onCreated: (activationKey: string) => void;
}) {
  const { showToast } = useToast();
  const [formClientId, setFormClientId] = useState('');
  const [formName, setFormName] = useState('');
  const [formRanges, setFormRanges] = useState<IpRange[]>([emptyRange()]);
  const [formSnmp, setFormSnmp] = useState('public');
  const [creating, setCreating] = useState(false);

  const updateFormRange = (idx: number, field: 'start' | 'end', value: string) =>
    setFormRanges(rs => rs.map((r, i) => {
      if (i !== idx) return r;
      const updated = { ...r, [field]: value };
      // Auto-fill end IP prefix if start is being updated
      if (field === 'start') {
        const lastDot = value.lastIndexOf('.');
        if (lastDot !== -1) {
          const prefix = value.substring(0, lastDot + 1);
          if (!r.end || r.end === prefix.substring(0, prefix.length - 1)) {
            updated.end = prefix;
          }
        }
      }
      return updated;
    }));

  const generateKey = async () => {
    if (!formClientId || !formName.trim()) return;
    for (const r of formRanges) {
      if (!r.start.trim() || !r.end.trim()) {
        showToast('Completa todas las IPs de inicio y fin.', 'warning');
        return;
      }
    }
    setCreating(true);
    try {
      const data = await api.post<{ key: string }>('/agents', {
        clientId: formClientId,
        name: formName.trim(),
        ip_ranges: formRanges.filter(r => r.start.trim() && r.end.trim()),
        snmp_community: formSnmp.trim() || 'public',
      });
      showToast('Monitor registrado exitosamente', 'success');
      onCreated(data.key);
    } catch (e: unknown) {
      showToast('Error: ' + (e as Error).message, 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="cd-panel border-none shadow-xl bg-gradient-to-br from-white to-slate-50 overflow-hidden ring-1 ring-slate-100 animate-in slide-in-from-top-4 duration-300">
      <div className="bg-brand p-4 flex items-center gap-3 text-white">
        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
          <Radio size={18} />
        </div>
        <h3 className="font-extrabold text-sm uppercase tracking-wider">Registro de Nuevo Agente</h3>
      </div>

      <div className="p-8 space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Cliente Asociado *</label>
            <select
              value={formClientId}
              onChange={e => setFormClientId(e.target.value)}
              className="cd-input w-full !h-12 !bg-white border-slate-200 focus:border-brand"
            >
              <option value="">Seleccionar empresa...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Etiqueta del Monitor *</label>
            <input
              type="text"
              placeholder=""
              value={formName}
              onChange={e => setFormName(e.target.value)}
              className="cd-input w-full !h-12 !bg-white border-slate-200 focus:border-brand"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Segmentos de Red (IP Ranges)</label>
            <button
              onClick={() => setFormRanges(rs => [...rs, emptyRange()])}
              className="flex items-center gap-1.5 text-[10px] font-extrabold text-brand uppercase hover:opacity-70 transition-opacity"
            >
              <Plus size={14} /> Agregar otro rango
            </button>
          </div>
          <div className="space-y-3">
            {formRanges.map((r, idx) => (
              <div key={idx} className="flex items-center gap-4 animate-in slide-in-from-left-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="IP Inicio"
                    value={r.start}
                    onChange={e => updateFormRange(idx, 'start', e.target.value)}
                    className="cd-input w-full !h-11 !bg-white border-slate-200 focus:border-brand font-mono text-xs"
                  />
                </div>
                <div className="h-px w-4 bg-slate-200 shrink-0" />
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="IP Fin"
                    value={r.end}
                    onChange={e => updateFormRange(idx, 'end', e.target.value)}
                    className="cd-input w-full !h-11 !bg-white border-slate-200 focus:border-brand font-mono text-xs"
                  />
                </div>
                {formRanges.length > 1 && (
                  <button
                    onClick={() => setFormRanges(rs => rs.filter((_, i) => i !== idx))}
                    className="shrink-0 p-2 text-slate-300 hover:text-rose-500 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Comunidad SNMP</label>
          <input
            type="text"
            value={formSnmp}
            onChange={e => setFormSnmp(e.target.value)}
            className="cd-input w-full !h-12 !bg-white border-slate-200 focus:border-brand font-mono text-xs"
          />
        </div>

        <div className="pt-4 flex justify-end">
          <button
            onClick={generateKey}
            disabled={!formClientId || !formName.trim() || creating}
            className="bg-brand hover:bg-brand-hover disabled:opacity-40 text-white rounded-xl py-3 px-8 text-sm font-extrabold transition-all shadow-lg shadow-brand/20 flex items-center gap-2"
          >
            {creating ? <Loader2 size={18} className="animate-spin" /> : <Key size={18} />}
            {creating ? 'Generando...' : 'Generar Llave de Activación'}
          </button>
        </div>
      </div>
    </div>
  );
}
