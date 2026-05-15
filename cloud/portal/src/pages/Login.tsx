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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Soft Ambient Background Decoration - Dashboard Style */}
      <div className="absolute top-[-20%] right-[-10%] w-[70%] h-[70%] bg-[#f7931d]/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] bg-[#004a99]/5 blur-[100px] rounded-full pointer-events-none" />
      
      {/* Subtle Pattern overlay */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.02] pointer-events-none" />

      <div className="w-full max-w-[420px] relative z-10 flex flex-col items-center">
        {/* Corporate Header - Exact Sidebar Match */}
        <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-8 duration-1000 w-full">
          <div className="flex flex-col items-center justify-center">
            <div className="relative mb-2">
              <img src="/logo.png" alt="CANAL DIRECTO" className="h-11 w-auto object-contain relative z-10" />
            </div>
            
            <div className="flex items-center justify-center gap-1.5 relative z-10 -mt-2">
              <span className="font-montserrat font-black text-base tracking-tight text-[#004a99] uppercase">STC</span>
              <span className="font-montserrat font-black text-base tracking-tight text-[#f7931d] uppercase">CLOUD</span>
            </div>
            <p className="text-slate-400 text-[8px] font-black uppercase tracking-[0.4em] mt-3 opacity-70">Portal de Gestión de Contadores</p>
          </div>
        </div>

        {/* Premium Login Card - Compact Version */}
        <div className="bg-white rounded-[32px] p-10 shadow-[0_20px_50px_rgba(0,0,0,0.03)] border border-slate-200/50 animate-in fade-in slide-in-from-bottom-12 duration-1000 relative overflow-hidden w-full">
          <div className="mb-8 relative z-10 text-center sm:text-left">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Bienvenido</h2>
            <p className="text-slate-500 text-xs font-medium mt-1">Ingrese sus credenciales para continuar</p>
          </div>

          {error && (
            <div className="flex items-center gap-3 bg-rose-50 border border-rose-100 rounded-xl p-3.5 mb-6 animate-in shake duration-300">
              <div className="bg-rose-500 text-white p-1 rounded-full shrink-0 shadow-[0_4px_12px_rgba(244,63,94,0.2)]">
                <AlertCircle size={12} />
              </div>
              <p className="text-[10px] text-rose-600 font-bold uppercase tracking-wide leading-none">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            <div className="space-y-2.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Usuario</label>
              <div className="relative group/input">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-[#f7931d] transition-colors duration-300">
                  <User size={18} />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full h-14 pl-14 pr-6 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 text-sm transition-all duration-300 focus:bg-white focus:border-[#f7931d]/50 focus:ring-[10px] focus:ring-[#f7931d]/5 outline-none placeholder:text-slate-300 font-medium"
                  placeholder=""
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Contraseña</label>
              <div className="relative group/input">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-[#f7931d] transition-colors duration-300">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full h-14 pl-14 pr-6 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 text-sm transition-all duration-300 focus:bg-white focus:border-[#f7931d]/50 focus:ring-[10px] focus:ring-[#f7931d]/5 outline-none placeholder:text-slate-300 font-medium"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 bg-[#f7931d] hover:bg-[#ff9d2b] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-[0_10px_25px_rgba(247,147,29,0.15)] hover:shadow-[0_12px_30px_rgba(247,147,29,0.25)] transition-all duration-500 active:scale-[0.97] flex items-center justify-center gap-3 mt-8"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              {loading ? 'Verificando...' : 'Acceder al Portal'}
            </button>
          </form>
        </div>

        {/* Footer info */}
        <div className="text-center mt-12 animate-in fade-in duration-[2000ms]">
          <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.3em]">
            Canal Directo S.A. — © {new Date().getFullYear()}
          </p>
          <div className="flex items-center justify-center gap-4 mt-5">
            <div className="h-px w-10 bg-slate-200" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#004a99]/20" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#f7931d]/40" />
            <div className="h-px w-10 bg-slate-200" />
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.3s ease-in-out;
        }
      `}} />
    </div>
  );
};

export default Login;

