import { useState, useEffect, useCallback } from 'react';
import { Copy, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

interface SetupData { secret: string; otpauth_uri: string; }
interface StatusData { enabled: boolean; recovery_remaining?: number; }

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
  const [recoveryRemaining, setRecoveryRemaining] = useState(0);
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(() => {
    api.get<StatusData>('/portal/2fa/status')
      .then((d) => { setEnabled(d.enabled); setRecoveryRemaining(d.recovery_remaining ?? 0); })
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
      const res = await api.post<{ recovery_codes?: string[] }>(`/portal/2fa/${action}`, { code });
      showToast(action === 'enable' ? '2FA activado' : '2FA desactivado', 'success');
      // Los códigos de recuperación se muestran UNA sola vez, recién activado.
      setRecoveryCodes(action === 'enable' ? res.recovery_codes ?? null : null);
      setSetup(null);
      setCode('');
      loadStatus();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Código inválido', 'error');
    } finally {
      setBusy(false);
    }
  };

  const regenerateRecovery = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ recovery_codes: string[] }>('/portal/2fa/recovery-codes', { code });
      setRecoveryCodes(res.recovery_codes);
      setCode('');
      showToast('Códigos regenerados — los anteriores quedaron invalidados', 'success');
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

      {recoveryCodes && (
        <div className="mb-5 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
          <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2">
            Códigos de recuperación — guardalos ahora, no se vuelven a mostrar
          </p>
          <div className="grid grid-cols-2 gap-1 font-mono text-sm font-bold text-slate-700">
            {recoveryCodes.map((rc) => <span key={rc}>{rc}</span>)}
          </div>
          <button onClick={() => copy(recoveryCodes.join('\n'))}
            className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-700 font-black uppercase tracking-wider hover:underline">
            <Copy size={11} /> Copiar todos
          </button>
        </div>
      )}

      {enabled === true && (
        <div>
          <p className="text-[10px] text-slate-500 font-bold mb-3">
            Códigos de recuperación sin usar: {recoveryRemaining} — regenerarlos o desactivar requiere un código vigente.
          </p>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Código vigente</p>
          <div className="flex items-center gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} maxLength={6} placeholder="000000" className={inputCls} />
            <button onClick={regenerateRecovery} disabled={busy || code.length !== 6}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all disabled:opacity-50">
              Regenerar códigos
            </button>
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
