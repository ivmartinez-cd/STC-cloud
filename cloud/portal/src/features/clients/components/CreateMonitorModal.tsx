import { useState } from 'react';
import { X, Check, Copy, Loader2, Download } from 'lucide-react';
import { useToast } from '../../../store/ToastContext';
import type { CreateMonitorForm } from '../../../shared/types/monitor';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (form: CreateMonitorForm) => Promise<string>;
}

const EMPTY_FORM: CreateMonitorForm = {
  name: '', ipStart: '', ipEnd: '', snmp_community: 'public',
};

const LABEL = 'mb-1.5 block font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300';
const INPUT = 'w-full rounded-[3px] border border-line-300 bg-white px-3 py-2.5 font-sans text-[13px] text-ink-900 outline-none focus:border-brand';

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
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-overlay-in" style={{ background: 'rgba(20,20,20,.55)' }}>
      <div
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-[5px] bg-white animate-modal-in"
      >
        <header className="flex items-center justify-between border-b border-line-150 px-6 py-4">
          <div>
            <h2 className="font-montserrat text-[18px] font-extrabold tracking-[-.01em] text-ink-900">
              {activationKey ? 'Instalación del Agente' : 'Nuevo Nodo de Monitoreo'}
            </h2>
            <p className="mt-0.5 font-sans text-[11.5px] text-ink-300">
              {activationKey ? 'Clave de activación generada' : 'Configura los parámetros de escaneo'}
            </p>
          </div>
          <button onClick={handleClose} className="rounded-[3px] p-1.5 text-ink-300 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover hover:text-ink-600">
            <X size={20} />
          </button>
        </header>

        {activationKey ? (
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
            {/* Header Success */}
            <div className="flex items-center gap-4 rounded-[5px] border border-brand-chip-border bg-brand-soft p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                <Check size={22} />
              </div>
              <div>
                <p className="font-montserrat text-[13px] font-extrabold text-ink-900">¡Nodo Registrado con Éxito!</p>
                <p className="mt-0.5 font-sans text-[12px] text-ink-400">Sigue estos 3 pasos para poner en marcha el agente.</p>
              </div>
            </div>

            {/* Onboarding Flow: 3 Steps */}
            <div className="space-y-4">
              {/* Paso 1 */}
              <div className="flex gap-4 rounded-[5px] border border-line-100 p-5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand font-montserrat text-[11px] font-bold text-white">
                  1
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <h4 className="font-montserrat text-[11px] font-extrabold uppercase tracking-[.08em] text-ink-900">Descargar Instalador</h4>
                    <p className="mt-1 font-sans text-[12px] leading-[1.5] text-ink-400">Obtén el instalador del agente de monitoreo para Windows (x64) directo desde este portal.</p>
                  </div>
                  <a
                    href="/api/v1/agents/download-installer"
                    className="inline-flex items-center gap-2 rounded-[3px] bg-brand px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe"
                  >
                    <Download size={14} /> DESCARGAR AGENTE (.EXE)
                  </a>
                </div>
              </div>

              {/* Paso 2 */}
              <div className="flex gap-4 rounded-[5px] border border-line-100 p-5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand font-montserrat text-[11px] font-bold text-white">
                  2
                </div>
                <div className="flex-1">
                  <h4 className="font-montserrat text-[11px] font-extrabold uppercase tracking-[.08em] text-ink-900">Ejecutar Instalación</h4>
                  <p className="mt-1 font-sans text-[12px] leading-[1.5] text-ink-400">
                    Corre el instalador descargado en la máquina o servidor local. Se instalará de manera segura y automática como un servicio de fondo permanente en Windows.
                  </p>
                </div>
              </div>

              {/* Paso 3 */}
              <div className="flex gap-4 rounded-[5px] border border-line-100 p-5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand font-montserrat text-[11px] font-bold text-white">
                  3
                </div>
                <div className="flex-1 space-y-4">
                  <div>
                    <h4 className="font-montserrat text-[11px] font-extrabold uppercase tracking-[.08em] text-ink-900">Activar Agente</h4>
                    <p className="mt-1 font-sans text-[12px] leading-[1.5] text-ink-400">
                      Usa la clave única maestra generada. Copia este comando rápido de terminal para registrar la instalación:
                    </p>
                  </div>

                  {/* Terminal Code Display */}
                  <div className="group relative select-all rounded-[5px] bg-brand-charcoal p-4 font-mono text-[11px]">
                    <p className="mb-1 font-montserrat text-[9px] font-bold uppercase tracking-[.13em] text-white/50">Línea de comandos rápida</p>
                    <code className="block whitespace-pre-wrap break-all pr-10 text-white">
                      stc-agent.exe --activate {activationKey}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`stc-agent.exe --activate ${activationKey}`);
                        showToast('Comando de activación copiado', 'success');
                      }}
                      className="absolute right-3 top-3 rounded-[3px] p-1.5 text-white/60 transition-colors duration-150 ease-in-out hover:bg-white/10 hover:text-white"
                      title="Copiar Comando"
                    >
                      <Copy size={12} />
                    </button>
                  </div>

                  {/* Solo Clave */}
                  <div className="space-y-1.5">
                    <span className={LABEL}>Clave de Activación Única</span>
                    <div className="relative">
                      <input
                        readOnly
                        value={activationKey}
                        className="w-full rounded-[3px] border border-line-300 bg-white py-2.5 pl-3 pr-12 font-mono text-[13px] text-ink-900 outline-none"
                      />
                      <button
                        onClick={copyKey}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[3px] p-2 text-ink-300 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover hover:text-ink-600"
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
                className="w-full rounded-[3px] bg-brand px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe"
              >
                ENTENDIDO, VOLVER AL CLIENTE
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
            <div>
              <label className={LABEL}>Nombre Descriptivo (Sucursal/Sede) *</label>
              <input required type="text" className={INPUT}
                value={form.name} onChange={e => set('name', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>IP Inicial de Escaneo</label>
                <input type="text" className={`${INPUT} font-mono`}
                  value={form.ipStart}
                  onChange={e => {
                    const val = e.target.value;
                    const parts = val.split('.');
                    const prefix = parts.length <= 3 ? val : parts.slice(0, 3).join('.') + '.';
                    setForm(prev => ({ ...prev, ipStart: val, ipEnd: prefix }));
                  }}
                />
              </div>
              <div>
                <label className={LABEL}>IP Final de Escaneo</label>
                <input type="text" className={`${INPUT} font-mono`}
                  value={form.ipEnd}
                  onFocus={e => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
                  onChange={e => set('ipEnd', e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className={LABEL}>Comunidad SNMP</label>
              <input type="text" className={INPUT}
                value={form.snmp_community} onChange={e => set('snmp_community', e.target.value)}
              />
            </div>

            <div className="flex gap-3 pt-3">
              <button type="button" onClick={handleClose}
                className="flex-1 rounded-[3px] border border-line-300 bg-white px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover"
              >
                Cancelar
              </button>
              <button type="submit" disabled={submitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-[3px] bg-brand px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Confirmar Registro'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default CreateMonitorModal;
