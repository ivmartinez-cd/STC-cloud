import { useState, useEffect, useCallback } from 'react';
import { Copy, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

interface SetupData { secret: string; otpauth_uri: string; }

const inputCls = 'w-40 bg-slate-50 text-slate-700 text-lg font-bold tracking-[0.4em] text-center px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand';

/**
 * 2FA TOTP self-service (bloque de seguridad post gap analysis vs HP SDS —
 * el SDS lo ofrece en Preferencias). Sin QR visual a propósito (evita una
 * dependencia nueva del portal): todas las apps TOTP aceptan la clave
 * manual, y el URI otpauth queda copiable para quien prefiera pegarlo.
 */
export default function TwoFactorCard() {
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(() => {
    api.get<{ enabled: boolean }>('/portal/2fa/status')
      .then((d) => setEnabled(d.enabled))
      .catch(() => setEnabled(null));
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const startSetup = async () => {
    setBusy(true);
    try {
      setSetup(await api.post<SetupData>('/portal/2fa/setup'));
      setCode('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (action: 'enable' | 'disable') => {
    setBusy(true);
    try {
      await api.post(`/portal/2fa/${action}`, { code });
      showToast(action === 'enable' ? '2FA activado' : '2FA desactivado', 'success');
      setSetup(null);
      setCode('');
      loadStatus();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Código inválido', 'error');
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => showToast('Copiado', 'success')).catch(() => {});
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 p-8">
      <h3 className="text-sm font-black text-[#1a2333] tracking-tight flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-xl ${enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-brand/10 text-brand'}`}>
          {enabled ? <ShieldCheck size={18} /> : <ShieldOff size={18} />}
        </div>
        Autenticación de Dos Factores
        {enabled != null && (
          <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
            enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
          }`}>{enabled ? 'Activo' : 'Inactivo'}</span>
        )}
      </h3>
      <p className="text-xs text-slate-500 font-medium mb-5">
        Con 2FA activo, el login pide además un código de 6 dígitos de tu app de autenticación (Google Authenticator, Authy, 1Password…).
      </p>

      {enabled === false && !setup && (
        <button onClick={startSetup} disabled={busy}
          className="px-5 py-2.5 bg-brand hover:bg-brand-hover text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition-all disabled:opacity-50">
          {busy ? 'Generando…' : 'Configurar 2FA'}
        </button>
      )}

      {setup && (
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">1 · Cargá esta clave en tu app (entrada manual)</p>
            <div className="flex items-center gap-2">
              <code className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-sm font-bold tracking-widest text-slate-700">{setup.secret}</code>
              <button onClick={() => copy(setup.secret)} className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200"><Copy size={14} /></button>
            </div>
            <button onClick={() => copy(setup.otpauth_uri)} className="text-[10px] text-brand font-bold mt-1 hover:underline">
              Copiar URI otpauth:// (para apps que lo aceptan pegado)
            </button>
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">2 · Ingresá el código que genera la app</p>
            <div className="flex items-center gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} maxLength={6} placeholder="000000" className={inputCls} />
              <button onClick={() => confirm('enable')} disabled={busy || code.length !== 6}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition-all disabled:opacity-50">
                {busy ? <Loader2 size={13} className="animate-spin" /> : 'Activar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {enabled === true && (
        <div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Desactivar (requiere un código vigente)</p>
          <div className="flex items-center gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} maxLength={6} placeholder="000000" className={inputCls} />
            <button onClick={() => confirm('disable')} disabled={busy || code.length !== 6}
              className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition-all disabled:opacity-50">
              {busy ? <Loader2 size={13} className="animate-spin" /> : 'Desactivar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
