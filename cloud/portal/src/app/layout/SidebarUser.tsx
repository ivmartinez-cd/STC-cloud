import { LogOut } from 'lucide-react';
import { ROLE_LABELS } from './navItems';

interface Props { isHovered: boolean; email: string | null; role: string; onLogout: () => void; }

const Avatar = ({ isHovered, initial }: { isHovered: boolean; initial: string }) => (
  <div className={`flex items-center justify-center shrink-0 transition-all duration-500 ${isHovered ? 'w-11 h-11' : 'w-full'}`}>
    <div className="relative group/avatar">
      <div className={`bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center text-white font-black transition-all duration-500 ring-offset-2 ring-offset-white ${
        isHovered ? 'w-11 h-11 shadow-[0_10px_20px_rgba(245,158,11,0.25)] rounded-2xl ring-0' : 'w-8 h-8 text-[10px] shadow-none rounded-xl ring-1 ring-slate-200'}`}>
        {initial}
      </div>
      <div className={`absolute bg-emerald-500 border border-white rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] ${
        isHovered ? 'w-3 h-3 -bottom-1 -right-1' : 'w-2 h-2 -bottom-0.5 -right-0.5'}`} />
    </div>
  </div>
);

const LogoutButton = ({ isHovered, onLogout }: Pick<Props, 'isHovered' | 'onLogout'>) => (
  <button onClick={onLogout} title="Cerrar Sesión"
    className={`flex items-center justify-center gap-2 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 font-montserrat text-[11px] font-black uppercase tracking-widest text-slate-500 transition-all duration-300 border border-slate-200 ${
      isHovered ? 'w-full py-2.5 px-4' : 'absolute inset-0 opacity-0 group-hover:opacity-100 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-2xl'}`}>
    <LogOut size={isHovered ? 14 : 18} />
    {isHovered && 'Salir'}
  </button>
);

/** Tarjeta de usuario al pie de la barra: avatar + nombre/rol expandidos, botón de salir. */
const SidebarUser = ({ isHovered, email, role, onLogout }: Props) => (
  <div className="px-3 py-6 relative transition-all duration-500">
    <div className={`relative overflow-hidden group transition-all duration-500 ${
      isHovered ? 'bg-slate-50 border border-slate-200/60 p-5 rounded-[2rem]' : 'h-12 w-full flex items-center justify-center rounded-2xl hover:bg-slate-100/50'}`}>
      <div className={`flex items-center gap-4 relative z-10 w-full ${isHovered ? 'mb-4 md:justify-start' : 'justify-center'}`}>
        <Avatar isHovered={isHovered} initial={(email || 'A')[0].toUpperCase()} />
        <div className={`flex flex-col min-w-0 transition-all duration-500 ${isHovered ? 'opacity-100' : 'opacity-0 w-0 h-0 overflow-hidden'}`}>
          <span className="font-sans text-sm font-bold text-slate-800 truncate">{email?.split('@')[0] || 'admin'}</span>
          <span className="font-montserrat text-[10px] text-slate-500 font-bold uppercase tracking-wider">{ROLE_LABELS[role] ?? role}</span>
        </div>
      </div>
      <LogoutButton isHovered={isHovered} onLogout={onLogout} />
      {!isHovered && (
        <div className="absolute left-0 top-3 bottom-3 w-1 bg-orange-500 rounded-r-full opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
      )}
    </div>
  </div>
);

export default SidebarUser;
