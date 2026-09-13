import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, Settings, Loader2, Check, KeyRound, Clock, Radio } from 'lucide-react';
import { api } from '../../../../shared/lib/api';
import { useToast } from '../../../../store/ToastContext';
import type { AgentConfig } from '../../../../shared/types/agents';
import { defaultConfig } from '../../../../shared/types/agents';
import type { MaskedSnmpCredential } from '../../../../shared/types/monitor';
import IpRangesEditor from '../IpRangesEditor';
import { useRemoteEwsToggle } from '../../hooks/useRemoteEwsToggle';
import { firstRangeProblem } from '../../lib/rangeSpecText';

interface Props {
  modal: { id: string; name: string; remote_ews_enabled?: boolean } | null;
  onClose: () => void;
}

export default function ConfigAgentModal({ modal, onClose }: Props) {
  const { showToast } = useToast();
  const [configForm, setConfigForm] = useState<AgentConfig>(defaultConfig);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  // Mismo interruptor (y mismo criterio de guardado inmediato) que el panel de
  // la pestaña Configuración del monitor: la lógica vive en el hook para que no
  // se separen los dos lugares desde donde se habilita.
  const { enabled: remoteEwsEnabled, saving: savingRemoteEws, toggle: toggleRemoteEws } = useRemoteEwsToggle(modal?.id, modal?.remote_ews_enabled ?? false);

  useEffect(() => {
    const init = async () => {
      if (!modal) return;
      setLoadingConfig(true);
      try {
        const data = await api.get<AgentConfig>(`/agents/${modal.id}/config`);
        setConfigForm({
          ip_ranges: data?.ip_ranges ?? [],
          snmp_community: data?.snmp_community ?? 'public',
          snmp_credentials: data?.snmp_credentials ?? [],
          business_hours: data?.business_hours,
        });
      } catch {
        setConfigForm(defaultConfig);
      } finally {
        setLoadingConfig(false);
      }
    };
    void init();
  }, [modal]);

  const handleClose = () => {
    setConfigForm(defaultConfig);
    onClose();
  };

  const saveConfig = async () => {
    if (!modal) return;
    // Validación de forma en el cliente — el cloud re-valida formato/topes en
    // serio al guardar (`validateIpRangeSpecs`).
    const problem = firstRangeProblem(configForm.ip_ranges);
    if (problem) { showToast(problem, 'warning'); return; }
    setSavingConfig(true);
    try {
      const result = await api.put<{ warnings?: string[] }>(`/agents/${modal.id}/config`, {
        ip_ranges: configForm.ip_ranges,
        snmp_community: configForm.snmp_community,
      });
      showToast('Configuración remota actualizada', 'success');
      result?.warnings?.forEach(w => showToast(w, 'warning'));
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
        <header className="px-10 py-10 bg-gradient-to-r from-[#1a2333] to-[#58595b] text-white flex justify-between items-center relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-2xl font-black tracking-tight uppercase">Control Remoto</h2>
            <p className="text-[10px] font-black text-brand-muted uppercase tracking-[0.2em] mt-1">Ajustes del nodo: {modal.name}</p>
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
              <p className="text-slate-500 font-black uppercase tracking-widest text-[10px]">Sincronizando con Agente...</p>
            </div>
          ) : (
            <div className="space-y-10">
              <div className="space-y-6">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Segmentos IP Activos</label>
                <div className="max-h-[360px] overflow-y-auto pr-2 custom-scrollbar">
                  <IpRangesEditor
                    ranges={configForm.ip_ranges}
                    onChange={ranges => setConfigForm(f => ({ ...f, ip_ranges: ranges }))}
                    credentials={(configForm.snmp_credentials ?? []) as MaskedSnmpCredential[]}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Comunidad SNMP</label>
                <input
                  type="text"
                  value={configForm.snmp_community}
                  onChange={e => setConfigForm(f => ({ ...f, snmp_community: e.target.value }))}
                  className="cd-input w-full !h-14 !bg-slate-50 border-transparent focus:!border-brand focus:!bg-white font-mono"
                />
              </div>

              {/* Sólo informativo acá — la edición completa (v1/v2c/v3, reorder,
                  reemplazo sin repetir secretos) vive en el tab Configuración
                  del detalle del monitor, que tiene su propio flujo de guardado
                  con optimistic locking. */}
              <div className="p-5 bg-brand-gray/10 rounded-2xl border border-brand-gray/20 flex items-center gap-4">
                <KeyRound className="text-brand-gray shrink-0" size={20} />
                <p className="text-xs text-brand-charcoal/80 font-bold leading-relaxed">
                  {configForm.snmp_credentials?.length
                    ? `${configForm.snmp_credentials.length} credencial(es) SNMP adicional(es) configurada(s).`
                    : 'Sin credenciales SNMP adicionales configuradas.'}
                  {' '}Editalas desde el detalle del monitor, pestaña{' '}
                  <Link to={`/monitors/${modal.id}?tab=config`} className="underline hover:text-brand-hover">Configuración</Link>.
                </p>
              </div>

              {/* Sólo informativo — el horario laboral (días, hora, TZ) se
                  edita en el mismo lugar que arriba, el detalle del monitor. */}
              <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-4">
                <Clock className="text-emerald-600 shrink-0" size={20} />
                <p className="text-xs text-emerald-900/80 font-bold leading-relaxed">
                  {configForm.business_hours
                    ? `Horario laboral: ${configForm.business_hours.start_hour}-${configForm.business_hours.end_hour}hs, ${configForm.business_hours.days.length} día(s) (${configForm.business_hours.timezone}).`
                    : 'Horario laboral por default (Argentina, L-V, 8-18hs).'}
                  {' '}Editalo desde el detalle del monitor, pestaña{' '}
                  <Link to={`/monitors/${modal.id}?tab=config`} className="underline hover:text-emerald-700">Configuración</Link>.
                </p>
              </div>

              {/* Remote EWS — a diferencia de SNMP credentials/business_hours,
                  es un flag booleano simple (sin optimistic locking), así que
                  se guarda al toque en vez de acumularse con "Aplicar Configuración". */}
              <div className="p-5 bg-brand/5 rounded-2xl border border-brand/20 flex items-center gap-4">
                <Radio className="text-brand shrink-0" size={20} />
                <div className="flex-1">
                  <p className="text-xs text-brand-charcoal/80 font-bold leading-relaxed">
                    Acceso remoto a la EWS del dispositivo vía túnel sobre el WSS existente. Deshabilitado por defecto.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleRemoteEws}
                  disabled={savingRemoteEws}
                  className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider transition-all disabled:opacity-50 ${
                    remoteEwsEnabled ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'
                  }`}
                >
                  {savingRemoteEws ? <Loader2 size={12} className="animate-spin" /> : remoteEwsEnabled ? 'Habilitado' : 'Deshabilitado'}
                </button>
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
                  className="flex-2 px-12 py-5 bg-brand hover:bg-brand-hover disabled:opacity-40 text-white text-xs font-black rounded-[24px] shadow-2xl shadow-brand/20 transition-all active:scale-95 flex items-center justify-center gap-3 uppercase tracking-widest"
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
