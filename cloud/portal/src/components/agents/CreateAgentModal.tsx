import { useState, useEffect } from 'react';
import { Key, Plus, ShieldCheck, RefreshCw, Trash2, Clock, Globe, Server, Copy } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { Client, IpRange, emptyRange } from '../../types/agents';
import { SNMP_DEFAULT_COMMUNITY, SCAN_DEFAULT_INTERVAL } from '../../lib/constants';

interface Props {
  show: boolean;
  clients: Client[];
  activationKey: string | null;
  onClose: () => void;
  onKeyGenerated: (key: string) => void;
  onCreated: () => void;
}

export default function CreateAgentModal({ show, clients, activationKey, onClose, onKeyGenerated, onCreated }: Props) {
  const { showToast } = useToast();
  const [formClientId, setFormClientId] = useState('');
  const [formName, setFormName] = useState('');
  const [formRanges, setFormRanges] = useState<IpRange[]>([emptyRange()]);
  const [formSnmp, setFormSnmp] = useState(SNMP_DEFAULT_COMMUNITY);
  const [formInterval, setFormInterval] = useState(SCAN_DEFAULT_INTERVAL);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (show) {
      setFormClientId('');
      setFormName('');
      setFormRanges([emptyRange()]);
      setFormSnmp(SNMP_DEFAULT_COMMUNITY);
      setFormInterval(SCAN_DEFAULT_INTERVAL);
    }
  }, [show]);

  const updateRange = (idx: number, field: 'start' | 'end', value: string) =>
    setFormRanges(rs => rs.map((r, i) => i === idx ? { ...r, [field]: value } : r));

  const generateKey = async () => {
    if (!formClientId || !formName.trim()) return;
    for (const r of formRanges) {
      if (!r.start.trim() || !r.end.trim()) {
        showToast('Completa todas las IPs del rango', 'warning');
        return;
      }
    }
    setCreating(true);
    try {
      const data = await api.post<{ key: string }>('/agents', {
        clientId: formClientId,
        name: formName.trim(),
        ip_ranges: formRanges.filter(r => r.start.trim() && r.end.trim()),
        snmp_community: formSnmp.trim() || SNMP_DEFAULT_COMMUNITY,
        scan_interval_minutes: formInterval,
      });
      onKeyGenerated(data.key);
      onClose();
      onCreated();
      showToast('Llave de activación generada con éxito', 'success');
    } catch (e: unknown) {
      showToast('Error: ' + (e as Error).message, 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      {show && (
        <div className="cd-panel overflow-hidden animate-in slide-in-from-top-4 duration-500 border-none shadow-2xl shadow-blue-900/5">
          <div className="bg-[#1a2333] px-10 py-6 flex items-center gap-4 text-white">
            <div className="p-3 bg-white/10 rounded-2xl">
              <Key size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight">Configuración de Despliegue</h3>
              <p className="text-[10px] font-bold text-blue-300/60 uppercase tracking-widest">Defina los parámetros del nuevo nodo de monitoreo</p>
            </div>
          </div>

          <div className="p-10 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Vincular a Cliente *</label>
                <div className="relative">
                  <Server size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <select
                    value={formClientId}
                    onChange={e => setFormClientId(e.target.value)}
                    className="cd-input w-full !pl-12 !bg-slate-50 border-transparent focus:!bg-white focus:!border-brand"
                  >
                    <option value="">Seleccionar cliente destino...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Etiqueta de Identificación</label>
                <div className="relative">
                  <Globe size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    type="text"
                    placeholder="Ej: Servidor de Monitoreo Central"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    className="cd-input w-full !pl-12 !bg-slate-50 border-transparent focus:!bg-white focus:!border-brand"
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-50/50 rounded-[32px] p-8 border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Segmentos de Red Permitidos</label>
                <button
                  onClick={() => setFormRanges(rs => [...rs, emptyRange()])}
                  className="flex items-center gap-2 text-[10px] font-black text-brand hover:text-[#2471a3] uppercase tracking-widest transition-colors"
                >
                  <Plus size={14} /> AGREGAR RANGO
                </button>
              </div>
              <div className="space-y-4">
                {formRanges.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-4 animate-in slide-in-from-right-4">
                    <input
                      type="text"
                      placeholder="IP Inicio"
                      value={r.start}
                      onChange={e => updateRange(idx, 'start', e.target.value)}
                      className="cd-input flex-1 !h-14 !text-xs font-mono !bg-white border-slate-200"
                    />
                    <div className="text-slate-300 font-black">—</div>
                    <input
                      type="text"
                      placeholder="IP Fin"
                      value={r.end}
                      onChange={e => updateRange(idx, 'end', e.target.value)}
                      className="cd-input flex-1 !h-14 !text-xs font-mono !bg-white border-slate-200"
                    />
                    {formRanges.length > 1 && (
                      <button
                        onClick={() => setFormRanges(rs => rs.filter((_, i) => i !== idx))}
                        className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                      >
                        <Trash2 size={20} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Comunidad SNMP Segura</label>
                <input
                  type="text"
                  value={formSnmp}
                  onChange={e => setFormSnmp(e.target.value)}
                  className="cd-input w-full !bg-slate-50 border-transparent focus:!bg-white focus:!border-brand font-mono"
                />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ciclo de Actualización (Min)</label>
                <div className="relative">
                  <Clock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    type="number"
                    min={1}
                    value={formInterval}
                    onChange={e => setFormInterval(Number(e.target.value))}
                    className="cd-input w-full !pl-12 !bg-slate-50 border-transparent focus:!bg-white focus:!border-brand"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={generateKey}
                disabled={!formClientId || !formName.trim() || creating}
                className="bg-brand hover:bg-[#2471a3] disabled:opacity-40 text-white rounded-2xl py-5 px-12 text-xs font-black shadow-2xl shadow-blue-900/20 transition-all active:scale-95 flex items-center gap-3"
              >
                {creating ? <RefreshCw className="animate-spin" size={18} /> : <Key size={18} />}
                {creating ? 'GENERANDO CREDENCIALES...' : 'GENERAR LLAVE MAESTRA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activationKey && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-[40px] p-10 shadow-2xl shadow-emerald-900/10 animate-in zoom-in-95 duration-500">
          <div className="flex flex-col md:flex-row items-start gap-8">
            <div className="p-6 bg-emerald-500 text-white rounded-[32px] shadow-xl shadow-emerald-900/20 shrink-0">
              <ShieldCheck size={40} />
            </div>
            <div className="flex-1 w-full">
              <h3 className="text-2xl font-black text-emerald-900 tracking-tight">Acceso Concedido</h3>
              <p className="text-sm text-emerald-700 font-bold mt-2 mb-8 uppercase tracking-wide">
                La llave expira en 24 horas. Use el comando a continuación en la terminal del cliente.
              </p>
              <div className="group relative">
                <div className="p-8 bg-emerald-900 rounded-[28px] font-mono text-center shadow-inner border border-emerald-800">
                  <p className="text-[10px] text-emerald-400 uppercase tracking-widest mb-2 font-black">Código de Activación Único</p>
                  <div className="text-2xl md:text-3xl text-white font-black tracking-widest break-all select-all">
                    {activationKey}
                  </div>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(activationKey);
                    showToast('Código copiado al portapapeles', 'success');
                  }}
                  className="absolute right-4 top-4 p-3 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition-all active:scale-90"
                  title="Copiar Código"
                >
                  <Copy size={20} />
                </button>
              </div>
              <p className="mt-4 text-[10px] text-emerald-600/50 font-mono text-center">
                Comando técnico: STC-Agent.exe --activate {activationKey} --url {window.location.origin}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
