import { useState, useEffect } from 'react'; // v1.0.1-ui-fix
import { Key, Plus, ShieldCheck, RefreshCw, Trash2, Globe, Server, Copy, Download } from 'lucide-react';
import { api } from '../../../../shared/lib/api';
import { useToast } from '../../../../store/ToastContext';
import type { Client, IpRange } from '../../../../shared/types/agents';
import { emptyRange } from '../../../../shared/types/agents';
import { SNMP_DEFAULT_COMMUNITY } from '../../../../shared/lib/constants';

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
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (show) {
        setFormClientId('');
        setFormName('');
        setFormRanges([emptyRange()]);
        setFormSnmp(SNMP_DEFAULT_COMMUNITY);
      }
    };
    void init();
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
        <div className="cd-panel overflow-hidden animate-in slide-in-from-top-4 duration-500 border-none shadow-2xl shadow-brand/5">
          <div className="bg-[#1a2333] px-10 py-6 flex items-center gap-4 text-white">
            <div className="p-3 bg-white/10 rounded-2xl">
              <Key size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight">Configuración de Despliegue</h3>
              <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Defina los parámetros del nuevo nodo de monitoreo</p>
            </div>
          </div>

          <div className="p-10 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Vincular a Cliente *</label>
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
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Etiqueta de Identificación</label>
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
                  className="flex items-center gap-2 text-[10px] font-black text-brand hover:text-brand-hover uppercase tracking-widest transition-colors"
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
                        className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                      >
                        <Trash2 size={20} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Comunidad SNMP Segura</label>
              <input
                type="text"
                value={formSnmp}
                onChange={e => setFormSnmp(e.target.value)}
                className="cd-input w-full !bg-slate-50 border-transparent focus:!bg-white focus:!border-brand font-mono"
              />
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={generateKey}
                disabled={!formClientId || !formName.trim() || creating}
                className="bg-brand hover:bg-brand-hover disabled:opacity-40 text-white rounded-2xl py-5 px-12 text-xs font-black shadow-2xl shadow-brand/20 transition-all active:scale-95 flex items-center gap-3"
              >
                {creating ? <RefreshCw className="animate-spin" size={18} /> : <Key size={18} />}
                {creating ? 'GENERANDO CREDENCIALES...' : 'GENERAR LLAVE MAESTRA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activationKey && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-[40px] p-10 shadow-2xl shadow-emerald-900/10 animate-in zoom-in-95 duration-500 space-y-6">
          {/* Header Success */}
          <div className="flex items-center gap-4 border-b border-emerald-100 pb-4">
            <div className="p-3 bg-emerald-500 rounded-2xl text-white shadow-lg shadow-emerald-500/20 shrink-0">
              <ShieldCheck size={28} />
            </div>
            <div>
              <p className="text-base font-black text-emerald-900 leading-tight">¡Nodo Registrado con Éxito!</p>
              <p className="text-xs text-emerald-700/70 font-semibold mt-0.5">Sigue estos 3 pasos para poner en marcha el agente.</p>
            </div>
          </div>

          {/* Onboarding Flow: 3 Steps */}
          <div className="space-y-6">
            {/* Paso 1 */}
            <div className="relative border border-emerald-100/50 bg-white/60 rounded-2xl p-5 flex gap-4 transition-all hover:bg-white/80">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white font-black text-xs shrink-0 shadow-md shadow-brand/10">
                1
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest">Descargar Instalador</h4>
                  <p className="text-xs text-slate-500 mt-1">Obtén el instalador del agente de monitoreo para Windows (x64) directo desde este portal.</p>
                </div>
                <a
                  href="/api/v1/agents/download-installer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-black tracking-wider shadow-lg shadow-brand/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
                >
                  <Download size={14} /> DESCARGAR AGENTE (.EXE)
                </a>
              </div>
            </div>

            {/* Paso 2 */}
            <div className="relative border border-emerald-100/50 bg-white/60 rounded-2xl p-5 flex gap-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white font-black text-xs shrink-0 shadow-md shadow-brand/10">
                2
              </div>
              <div className="flex-1">
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest">Ejecutar Instalación</h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Corre el instalador descargado en la máquina o servidor local. Se instalará de manera segura y automática como un servicio de fondo permanente en Windows.
                </p>
              </div>
            </div>

            {/* Paso 3 */}
            <div className="relative border border-emerald-100/50 bg-white/60 rounded-2xl p-5 flex gap-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white font-black text-xs shrink-0 shadow-md shadow-brand/10">
                3
              </div>
              <div className="flex-1 space-y-4">
                <div>
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest">Activar Agente</h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Usa la clave única maestra generada. Copia este comando rápido de terminal para registrar la instalación:
                  </p>
                </div>

                {/* Terminal Code Display */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 font-mono text-[11px] relative group select-all">
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black mb-1">Línea de comandos rápida</p>
                  <code className="text-emerald-400 block break-all whitespace-pre-wrap pr-10">
                    stc-agent.exe --activate {activationKey}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`stc-agent.exe --activate ${activationKey}`);
                      showToast('Comando de activación copiado', 'success');
                    }}
                    className="absolute right-3 top-3 p-1.5 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-400 hover:text-white transition-colors"
                    title="Copiar Comando"
                  >
                    <Copy size={12} />
                  </button>
                </div>

                {/* Solo Clave */}
                <div className="space-y-1.5">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Clave de Activación Única</span>
                  <div className="relative">
                    <input
                      readOnly
                      value={activationKey}
                      className="w-full font-mono text-xs bg-white border border-slate-200 rounded-xl py-3 pl-4 pr-12 text-slate-600 focus:outline-none cursor-default"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(activationKey);
                        showToast('Código copiado al portapapeles', 'success');
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
