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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-50 rounded-full blur-3xl opacity-60" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-50 rounded-full blur-3xl opacity-60" />

      <div className="w-full max-w-[420px] relative z-10">
        {/* Logo and Header */}
        <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-center mb-6">
            <div className="bg-white p-4 rounded-[24px] shadow-xl shadow-blue-900/5 ring-1 ring-slate-100">
              <img src="/logo.png" alt="STC Cloud" className="h-12 w-auto object-contain" />
            </div>
          </div>
          <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight">
            STC <span className="text-[#2980b9]">Cloud</span>
          </h1>
          <p className="text-slate-500 mt-2 text-sm font-medium uppercase tracking-widest opacity-60">Portal de Gestión de Contadores</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-[32px] p-10 shadow-2xl shadow-slate-200/60 border border-slate-100 animate-in fade-in slide-in-from-bottom-6 duration-700">
          <div className="mb-8">
            <h2 className="text-xl font-extrabold text-[#1a2333] tracking-tight">Bienvenido</h2>
            <p className="text-slate-400 text-sm font-medium mt-1">Ingrese sus credenciales para continuar</p>
          </div>

          {error && (
            <div className="flex items-center gap-3 bg-rose-50 border border-rose-100 rounded-2xl p-4 mb-6 animate-in shake duration-300">
              <div className="bg-rose-500 text-white p-1 rounded-full shrink-0">
                <AlertCircle size={14} />
              </div>
              <p className="text-xs text-rose-600 font-bold uppercase tracking-tight">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Identificador de Usuario</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#2980b9] transition-colors">
                  <User size={18} />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="cd-input w-full !pl-12 !h-14 !bg-slate-50 border-transparent focus:!bg-white focus:!border-[#2980b9] text-sm"
                  placeholder="admin"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Clave de Acceso</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#2980b9] transition-colors">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="cd-input w-full !pl-12 !h-14 !bg-slate-50 border-transparent focus:!bg-white focus:!border-[#2980b9] text-sm"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 bg-[#e67e22] hover:bg-[#d35400] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl text-sm font-extrabold shadow-lg shadow-orange-900/20 transition-all active:scale-95 flex items-center justify-center gap-2 mt-4"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <ShieldCheck size={20} />}
              {loading ? 'Verificando...' : 'Acceder al Portal'}
            </button>
          </form>
        </div>

        {/* Footer info */}
        <div className="text-center mt-10 space-y-4">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] opacity-40">
            Canal Directo S.A. — © {new Date().getFullYear()}
          </p>
          <div className="flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-slate-200" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#2980b9]" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#e67e22]" />
            <div className="h-px w-8 bg-slate-200" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;

