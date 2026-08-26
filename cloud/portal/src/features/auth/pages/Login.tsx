import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../store/AuthContext';
import { User, Lock } from 'lucide-react';
import { consumePostLoginRedirect } from '../../../shared/lib/postLoginRedirect';
import { useLoginStats } from '../hooks/useLoginStats';
import { fmt, fmtCompact } from '../../../shared/lib/formatters';

const STAT_LABELS = [
  { key: 'clients', label: 'CLIENTES ACTIVOS' },
  { key: 'devices', label: 'DISPOSITIVOS GESTIONADOS' },
  { key: 'agents', label: 'AGENTES REGISTRADOS' },
  { key: 'volume', label: 'PÁGINAS ESTE MES' },
] as const;

const STRIPE_COLORS = ['bg-brand-severe', 'bg-brand', 'bg-brand-light', 'bg-ink-500', 'bg-brand-gray'];

const INPUT_BASE = 'institutional-input w-full bg-transparent font-sans text-[13px] text-ink-900 outline-none placeholder:text-ink-300';

function statValue(key: string, stats: ReturnType<typeof useLoginStats>['stats']): string | null {
  if (!stats) return null;
  switch (key) {
    case 'clients': return fmt(stats.clients);
    case 'devices': return fmt(stats.devices);
    case 'agents': return fmt(stats.agents);
    case 'volume': return fmtCompact(stats.monthlyVolume);
    default: return null;
  }
}

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { stats, loading: statsLoading } = useLoginStats();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ username?: boolean; password?: boolean }>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [totpCode, setTotpCode] = useState('');
  const [totpStep, setTotpStep] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!totpStep) {
      const fe: typeof fieldErrors = {};
      if (!username.trim()) fe.username = true;
      if (!password) fe.password = true;
      if (fe.username || fe.password) {
        setFieldErrors(fe);
        return;
      }
    }
    setFieldErrors({});
    setLoading(true);
    try {
      await login(username, password, totpCode || undefined, remember);
      navigate(consumePostLoginRedirect(), { replace: true });
    } catch (err: unknown) {
      const failure = err as Error & { totpRequired?: boolean };
      if (failure.totpRequired && !totpStep) {
        // Primer 401 con 2FA activo: mostrar el paso del código sin tratarlo como error.
        setTotpStep(true);
      } else {
        setError(failure.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-[repeat(auto-fit,minmax(420px,1fr))] font-sans text-ink-900">
      <div className="flex min-h-[640px] flex-col bg-panel-dark">
        <div className="flex flex-1 flex-col justify-center gap-[52px] px-[clamp(24px,5vw,52px)] py-12">
          <div className="flex items-center gap-5">
            <img src="/brand/wm-blanco.svg" alt="Canal Directo" className="block h-[30px] w-auto flex-none" />
            <span className="block h-[34px] w-px flex-none bg-panel-dark-line" aria-hidden="true" />
            <div>
              <div className="font-montserrat text-[13px] font-extrabold leading-[1.2] tracking-[.05em] text-white">STC CLOUD</div>
              <div className="mt-1 font-montserrat text-[8px] font-bold leading-[1.4] tracking-[.16em] text-brand">GESTIÓN DE CONTADORES</div>
            </div>
          </div>

          <div>
            <h1 className="m-0 max-w-[15em] text-balance font-montserrat text-[clamp(30px,3.6vw,44px)] font-extrabold leading-[1.08] tracking-[-.024em] text-white">
              Toda la flota de impresión, en un solo panel
            </h1>
            <p className="mt-5 max-w-[44ch] text-pretty font-sans text-[15.5px] font-light leading-[1.6] text-panel-dark-text">
              Contadores, consumibles, alertas y disponibilidad de cada equipo gestionado, con lectura automática desde los agentes de red instalados en cada sitio.
            </p>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(148px,1fr))] gap-0 overflow-hidden">
            {STAT_LABELS.map(({ key, label }) => {
              const value = statValue(key, stats);
              return (
                <div key={key} className="border-t border-panel-dark-line px-[22px] pb-1 pt-5 shadow-[-1px_0_0_var(--color-panel-dark-line)]">
                  {statsLoading ? (
                    <span className="block h-[23px] w-14 animate-pulse rounded bg-panel-dark-line" />
                  ) : (
                    <div className="font-montserrat text-[23px] font-bold leading-[1.2] tabular-nums text-white">{value ?? '—'}</div>
                  )}
                  <div className="mt-[7px] min-h-[24px] font-montserrat text-[8px] font-bold leading-[1.5] tracking-[.13em] text-panel-dark-label">{label}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-5" aria-hidden="true">
          {STRIPE_COLORS.map((c, i) => <div key={i} className={`h-1 ${c}`} />)}
        </div>
      </div>

      <div className="flex min-h-[640px] flex-col items-center justify-center bg-surface-page px-[clamp(24px,5vw,52px)] py-10">
        <div className="w-full max-w-[404px]">
          <div className="rounded-[5px] border border-line-100 bg-white">
            <div className="border-b border-line-150 px-7 pb-[22px] pt-[26px]">
              <h2 className="m-0 font-montserrat text-2xl font-extrabold leading-[1.15] tracking-[-.015em] text-ink-900">Iniciar sesión</h2>
              <p className="mt-2 font-sans text-[12.5px] leading-[1.5] text-ink-400">Ingresá con tu cuenta corporativa de Canal Directo.</p>
            </div>

            <div className="px-7 pb-[26px] pt-[22px]">
              {error && (
                <div role="alert" className="mb-5 flex items-start gap-[11px] rounded-[3px] border border-brand-chip-border bg-brand-soft px-[13px] py-3">
                  <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-brand-severe font-montserrat text-[11px] font-bold leading-5 text-white">!</span>
                  <div>
                    <div className="font-montserrat text-[8.5px] font-bold tracking-[.13em] text-brand-accent">NO SE PUDO INICIAR SESIÓN</div>
                    <div className="mt-1 font-sans text-xs leading-[1.45] text-brand-warn-text">{error}</div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                {!totpStep ? (
                  <>
                    <label htmlFor="login-username" className="mb-2 block font-montserrat text-[8.5px] font-bold tracking-[.13em] text-ink-300">USUARIO</label>
                    <div className={`flex items-center gap-2.5 rounded-[3px] border bg-surface-input px-[13px] py-[11px] focus-within:border-brand-chip-border focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(247,148,29,.12)] ${fieldErrors.username ? 'border-brand-chip-border' : 'border-line-100'}`}>
                      <User size={14} className="flex-none text-ink-500" aria-hidden="true" />
                      <input
                        id="login-username"
                        className={INPUT_BASE}
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                        autoFocus
                        readOnly={loading}
                      />
                    </div>
                    {fieldErrors.username && <p className="mt-1.5 font-sans text-[11.5px] text-brand-accent">Ingresá tu usuario.</p>}

                    <div className="mb-2 mt-[18px] flex items-baseline justify-between gap-3">
                      <label htmlFor="login-password" className="font-montserrat text-[8.5px] font-bold tracking-[.13em] text-ink-300">CONTRASEÑA</label>
                      <span className="font-montserrat text-[10px] font-semibold tracking-[.08em] text-ink-200">RECUPERAR ACCESO</span>
                    </div>
                    <div className={`flex items-center gap-2.5 rounded-[3px] border bg-surface-input px-[13px] py-[11px] focus-within:border-brand-chip-border focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(247,148,29,.12)] ${fieldErrors.password ? 'border-brand-chip-border' : 'border-line-100'}`}>
                      <Lock size={14} className="flex-none text-ink-500" aria-hidden="true" />
                      <input
                        id="login-password"
                        className={`${INPUT_BASE} font-mono tracking-[.06em] text-ink-600`}
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        readOnly={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="flex-none font-montserrat text-[10px] font-semibold tracking-[.08em] text-brand-accent outline-none focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
                      >
                        {showPassword ? 'OCULTAR' : 'MOSTRAR'}
                      </button>
                    </div>
                    {fieldErrors.password && <p className="mt-1.5 font-sans text-[11.5px] text-brand-accent">Ingresá tu contraseña.</p>}

                    <label className="mb-[22px] mt-[18px] flex cursor-pointer items-center gap-[9px]">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="h-[15px] w-[15px] flex-none rounded-[2px] border-[1.5px] border-line-checkbox accent-brand outline-none focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
                      />
                      <span className="font-sans text-[12.5px] leading-[1.4] text-ink-100">Mantener la sesión abierta en este equipo</span>
                    </label>
                  </>
                ) : (
                  <div className="mb-[22px]">
                    <label htmlFor="login-totp" className="mb-2 block font-montserrat text-[8.5px] font-bold tracking-[.13em] text-ink-300">CÓDIGO DE VERIFICACIÓN (2FA)</label>
                    <input
                      id="login-totp"
                      type="text"
                      autoFocus
                      maxLength={11}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                      readOnly={loading}
                      className="w-full rounded-[3px] border border-line-100 bg-surface-input px-[13px] py-[11px] text-center font-mono text-lg tracking-[.3em] text-ink-900 outline-none focus:border-brand-chip-border focus:bg-white focus:shadow-[0_0_0_3px_rgba(247,148,29,.12)]"
                    />
                    <p className="mt-2 font-sans text-[11px] leading-[1.4] text-ink-300">
                      Código de 6 dígitos de tu app — o un código de recuperación (XXXXX-XXXXX) si perdiste el teléfono.
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-[3px] bg-brand px-[18px] py-[13px] font-montserrat text-[10.5px] font-semibold tracking-[.11em] text-white outline-none transition-colors focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-line-100 disabled:text-ink-200"
                >
                  {loading ? 'VERIFICANDO…' : totpStep ? 'VERIFICAR CÓDIGO' : 'ACCEDER AL PORTAL'}
                </button>
              </form>
            </div>
          </div>

          <div className="mt-3.5 flex items-center gap-[11px] rounded-[5px] border border-line-100 bg-white px-[15px] py-[13px]">
            <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full border border-line-avatar bg-surface-avatar font-montserrat text-[10px] font-bold leading-5 text-ink-400">✓</span>
            <span className="font-sans text-[11.5px] leading-[1.5] text-ink-400">Conexión cifrada TLS 1.3. Los accesos quedan auditados junto a la dirección IP de origen.</span>
          </div>

          <div className="mt-[22px] flex flex-wrap items-center justify-between gap-2.5">
            <span className="font-sans text-[11.5px] leading-none text-ink-300">Canal Directo S.A. · © {new Date().getFullYear()}</span>
            <div className="flex gap-4">
              <span className="font-sans text-[11.5px] leading-none text-ink-400">Soporte técnico</span>
              <span className="font-sans text-[11.5px] leading-none text-ink-400">Estado del servicio</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
