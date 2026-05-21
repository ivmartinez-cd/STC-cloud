import { useState } from 'react';
import { X, Radio, Check, Copy, Loader2, MapPin, Shield, Clock, Layout, Download } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import type { CreateMonitorForm } from '../../types/monitor';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (form: CreateMonitorForm) => Promise<string>;
}

const EMPTY_FORM: CreateMonitorForm = {
  name: '', ipStart: '', ipEnd: '', snmp_community: 'public', scan_interval_minutes: 15,
};

const CreateMonitorModal = ({ isOpen, onClose, onCreate }: Props) => {
  const [form, setForm] = useState<CreateMonitorForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [activationKey, setActivationKey] = useState('');
  const [keyCopied, setKeyCopied] = useState(false);
  const { showToast } = useToast();

  if (!isOpen) return null;

  const handleClose = () => {
    onClose();
    setActivationKey('');
    setKeyCopied(false);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const key = await onCreate(form);
      setActivationKey(key);
      showToast('Monitor creado exitosamente', 'success');
    } catch (err: unknown) {
      showToast('Error al crear monitor: ' + (err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const copyKey = () => {
    navigator.clipboard.writeText(activationKey);
    setKeyCopied(true);
    showToast('Clave copiada al portapapeles', 'success');
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const set = <K extends keyof CreateMonitorForm>(key: K, value: CreateMonitorForm[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-[#1a2333]/60 backdrop-blur-md animate-overlay-in">
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-xl overflow-hidden animate-modal-in">
        <header className="px-8 py-8 border-b border-slate-50 flex items-center justify-between bg-gradient-to-r from-brand to-[#3498db] text-white">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
              <Radio size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">
                {activationKey ? 'Instalación del Agente' : 'Nuevo Nodo de Monitoreo'}
              </h2>
              <p className="text-xs text-blue-100 font-medium">
                {activationKey ? 'Clave de activación generada' : 'Configura los parámetros de escaneo'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-white/10 rounded-full transition-colors active:scale-90">
            <X size={24} />
          </button>
        </header>

        {activationKey ? (
          <div className="p-10 space-y-6 max-h-[80vh] overflow-y-auto">
            {/* Header Success */}
            <div className="bg-emerald-50 border border-emerald-100 rounded-[24px] p-6 flex items-center gap-4">
              <div className="p-3 bg-emerald-500 rounded-2xl text-white shadow-lg shadow-emerald-500/20 shrink-0">
                <Check size={28} />
              </div>
              <div>
                <p className="text-base font-black text-emerald-900 leading-tight">¡Nodo Registrado con Éxito!</p>
                <p className="text-xs text-emerald-700/70 font-semibold mt-0.5">Sigue estos 3 pasos para poner en marcha el agente.</p>
              </div>
            </div>

            {/* Onboarding Flow: 3 Steps */}
            <div className="space-y-6">
              {/* Paso 1 */}
              <div className="relative border border-slate-100 bg-slate-50/40 rounded-2xl p-5 flex gap-4 transition-all hover:bg-slate-50/70">
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
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand hover:bg-[#2471a3] text-white rounded-xl text-xs font-black tracking-wider shadow-lg shadow-blue-500/10 transition-all hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <Download size={14} /> DESCARGAR AGENTE (.EXE)
                  </a>
                </div>
              </div>

              {/* Paso 2 */}
              <div className="relative border border-slate-100 bg-slate-50/40 rounded-2xl p-5 flex gap-4">
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
              <div className="relative border border-slate-100 bg-slate-50/40 rounded-2xl p-5 flex gap-4">
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
                        onClick={copyKey}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
                      >
                        {keyCopied ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex gap-4 pt-2">
              <button
                onClick={handleClose}
                className="w-full py-4 rounded-2xl bg-brand text-white text-xs font-black uppercase tracking-wider hover:bg-[#2471a3] transition-all shadow-xl shadow-blue-900/10 active:scale-95"
              >
                ENTENDIDO, VOLVER AL CLIENTE
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-10 space-y-8">
            <div className="space-y-3">
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Nombre Descriptivo (Sucursal/Sede) *</label>
              <div className="relative">
                <Layout size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                <input required type="text" className="cd-input w-full !pl-12"
                  value={form.name} onChange={e => set('name', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">IP Inicial de Escaneo</label>
                <div className="relative">
                  <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input type="text" className="cd-input w-full !pl-12 font-mono text-sm"
                    value={form.ipStart}
                    onChange={e => {
                      const val = e.target.value;
                      const parts = val.split('.');
                      const prefix = parts.length <= 3 ? val : parts.slice(0, 3).join('.') + '.';
                      setForm(prev => ({ ...prev, ipStart: val, ipEnd: prefix }));
                    }}
                  />
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">IP Final de Escaneo</label>
                <div className="relative">
                  <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input type="text" className="cd-input w-full !pl-12 font-mono text-sm"
                    value={form.ipEnd}
                    onFocus={e => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
                    onChange={e => set('ipEnd', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Comunidad SNMP</label>
                <div className="relative">
                  <Shield size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input type="text" className="cd-input w-full !pl-12"
                    value={form.snmp_community} onChange={e => set('snmp_community', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Intervalo de Escaneo</label>
                <div className="relative">
                  <Clock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <select className="cd-input w-full !pl-12"
                    value={form.scan_interval_minutes}
                    onChange={e => set('scan_interval_minutes', Number(e.target.value))}
                  >
                    <option value={15}>Cada 15 min</option>
                    <option value={30}>Cada 30 min</option>
                    <option value={60}>Cada 1 hora</option>
                    <option value={1440}>Cada 24 horas</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-6 flex gap-4">
              <button type="button" onClick={handleClose}
                className="flex-1 py-5 rounded-[24px] border border-slate-200 text-slate-500 font-extrabold hover:bg-slate-50 transition-all active:scale-95"
              >
                Cancelar
              </button>
              <button type="submit" disabled={submitting}
                className="flex-1 py-5 rounded-[24px] bg-brand text-white font-black hover:bg-[#2471a3] transition-all shadow-xl shadow-blue-900/10 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {submitting ? <Loader2 size={24} className="animate-spin" /> : 'Confirmar Registro'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default CreateMonitorModal;
