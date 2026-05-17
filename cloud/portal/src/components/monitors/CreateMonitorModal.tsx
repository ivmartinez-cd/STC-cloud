import { useState } from 'react';
import { X, Radio, Check, Copy, Info, Loader2, MapPin, Shield, Clock, Layout } from 'lucide-react';
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
          <div className="p-10 space-y-8">
            <div className="bg-emerald-50 border border-emerald-100 rounded-[24px] p-8 flex flex-col items-center text-center gap-4">
              <div className="p-4 bg-white rounded-full shadow-sm text-emerald-500">
                <Check size={32} />
              </div>
              <div>
                <p className="text-lg font-black text-emerald-900">¡Nodo Registrado!</p>
                <p className="text-sm text-emerald-700/60 font-medium">Copia esta clave de seguridad para activar el agente STC en el servidor local.</p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Clave de Activación Única</label>
              <div className="relative group">
                <input
                  readOnly value={activationKey}
                  className="cd-input w-full font-mono text-sm !bg-slate-50 !py-6 !pl-6 !pr-16 border-transparent focus:!border-brand cursor-default"
                />
                <button
                  onClick={copyKey}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white rounded-xl shadow-md text-brand hover:bg-brand hover:text-white transition-all active:scale-90"
                >
                  {keyCopied ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 flex items-start gap-4">
              <Info size={20} className="text-brand shrink-0 mt-1" />
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Esta clave es confidencial y solo puede usarse una vez. Una vez activado el agente, el nodo comenzará a reportar métricas automáticamente.
              </p>
            </div>

            <button
              onClick={handleClose}
              className="w-full py-5 rounded-[24px] bg-brand text-white font-black hover:bg-[#2471a3] transition-all shadow-xl shadow-blue-900/10 active:scale-95"
            >
              Entendido, Volver al Cliente
            </button>
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
