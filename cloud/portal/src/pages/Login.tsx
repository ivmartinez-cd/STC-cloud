import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, User, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background decoration - Design Spells: Ambient Glow */}
      <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-900/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.02] pointer-events-none" />

      <div className="w-full max-w-[440px] relative z-10">
        {/* Logo and Header */}
        <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex justify-center mb-4">
            <div className="relative group">
              <div className="absolute inset-0 bg-blue-500/10 blur-3xl rounded-full opacity-40 group-hover:opacity-100 transition-opacity duration-1000" />
              <img src="/logo1.png" alt="Canal Directo" className="h-20 w-auto object-contain relative z-10 drop-shadow-[0_10px_10px_rgba(0,0,0,0.3)]" />
            </div>
          </div>
          
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-3xl font-montserrat font-black tracking-tighter text-white opacity-90">
              STC
            </span>
            <span className="text-3xl font-montserrat font-black tracking-tighter text-blue-500">
              Cloud
            </span>
          </div>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] opacity-80">Portal de Gestión de Contadores</p>
        </div>

        {/* Login Card - Glassmorphism Pattern */}
        <div className="bg-white/[0.03] backdrop-blur-2xl rounded-[2.5rem] p-10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 animate-in fade-in slide-in-from-bottom-8 duration-1000 relative overflow-hidden">
          {/* Subtle internal glow */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="mb-10 relative z-10">
            <h2 className="text-2xl font-black text-white tracking-tight">Bienvenido</h2>
            <p className="text-slate-400 text-sm font-medium mt-1">Ingrese sus credenciales para continuar</p>
          </div>

          {error && (
            <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 mb-8 animate-in shake duration-300">
              <div className="bg-rose-500 text-white p-1 rounded-full shrink-0 shadow-[0_0_15px_rgba(244,63,94,0.3)]">
                <AlertCircle size={14} />
              </div>
              <p className="text-[11px] text-rose-400 font-bold uppercase tracking-wide">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-7 relative z-10">
            <div className="space-y-2.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Usuario</label>
              <div className="relative group">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors duration-300">
                  <User size={19} />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full h-14 pl-14 pr-6 bg-white/[0.02] border border-white/5 rounded-2xl text-white text-sm transition-all duration-300 focus:bg-white/[0.05] focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 outline-none placeholder:text-slate-600"
                  placeholder="admin"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Contraseña</label>
              <div className="relative group">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors duration-300">
                  <Lock size={19} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full h-14 pl-14 pr-6 bg-white/[0.02] border border-white/5 rounded-2xl text-white text-sm transition-all duration-300 focus:bg-white/[0.05] focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 outline-none placeholder:text-slate-600"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-15 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-[0_10px_25px_rgba(249,115,22,0.3)] hover:shadow-[0_15px_35px_rgba(249,115,22,0.4)] transition-all active:scale-[0.98] flex items-center justify-center gap-3 mt-6 border border-white/10"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              {loading ? 'Verificando...' : 'Acceder al Portal'}
            </button>
          </form>
        </div>

        {/* Footer info */}
        <div className="text-center mt-12 space-y-5">
          <p className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.3em]">
            Canal Directo S.A. — © {new Date().getFullYear()}
          </p>
          <div className="flex items-center justify-center gap-3">
            <div className="h-px w-10 bg-white/5" />
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]" />
            <div className="h-px w-10 bg-white/5" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;

