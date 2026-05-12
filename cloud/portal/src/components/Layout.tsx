import { useState, Suspense } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileText, LogOut, Search, Settings, Menu, X, ChevronRight, Shield
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { name: 'Dashboard',     path: '/',          icon: LayoutDashboard },
  { name: 'Clientes',      path: '/clients',   icon: Users           },
  { name: 'Agentes',       path: '/agents',    icon: Shield          },
  { name: 'Reportes',      path: '/reports',   icon: FileText        },
  { name: 'Configuración', path: '/settings',  icon: Settings        },
];

const Layout = () => {
  const location = useLocation();
  const { userEmail: email, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#1a2333] font-sans flex">
      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] md:hidden"
          onClick={toggleMobileMenu}
        />
      )}

      {/* Sidebar - Rail + Expansion Pattern */}
      <aside 
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`
          fixed inset-y-0 left-0 bg-white border-r border-slate-200 text-slate-700 flex flex-col z-[70] transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1)
          ${isHovered ? 'w-72 shadow-[20px_0_50px_rgba(0,0,0,0.05)]' : 'md:w-20 w-0 -translate-x-full md:translate-x-0'}
          ${isMobileMenuOpen ? 'w-72 translate-x-0 shadow-2xl' : ''}
          overflow-hidden
        `}
      >
        {/* Subtle Ambient Glow (Orange) */}
        <div className="absolute top-0 left-0 w-full h-64 bg-orange-500/5 blur-[100px] pointer-events-none" />

        {/* Brand Header */}
        <div className={`
          py-10 relative flex flex-col items-center shrink-0
          transition-all duration-500
          ${isHovered ? 'px-8' : 'px-0'}
        `}>
          <Link to="/" className="flex flex-col items-center group" onClick={() => setIsMobileMenuOpen(false)}>
            <div className="relative h-14 flex items-center justify-center min-w-[40px]">
              {/* Full Logo - Shown when expanded */}
              <img 
                src="/logo.png" 
                alt="STC Cloud" 
                className={`h-11 w-auto object-contain transition-all duration-500 ${isHovered ? 'opacity-100 scale-100' : 'opacity-0 scale-75 absolute pointer-events-none'}`} 
              />
              {/* Icon Logo - Shown when collapsed */}
              <img 
                src="/logo2.png" 
                alt="STC" 
                className={`h-10 w-auto object-contain transition-all duration-500 ${!isHovered ? 'opacity-100 scale-110' : 'opacity-0 scale-125 absolute pointer-events-none'}`} 
              />
              <div className="absolute inset-0 bg-blue-500/5 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            </div>
            
            <div className={`flex items-center gap-1.5 relative z-10 transition-all duration-500 -mt-2 ${isHovered ? 'opacity-100' : 'opacity-0 scale-90 h-0 overflow-hidden'}`}>
              <span className="font-montserrat font-black text-base tracking-tight text-[#004a99]">STC</span>
              <span className="font-montserrat font-black text-base tracking-tight text-[#e67e22]">CLOUD</span>
            </div>
          </Link>
          
          {isMobileMenuOpen && (
            <button onClick={toggleMobileMenu} className="md:hidden absolute top-10 right-6 p-2 hover:bg-white/5 rounded-full transition-colors">
              <X size={20} className="text-slate-400" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-2 overflow-y-auto relative custom-scrollbar overflow-x-hidden">
          <div className={`
            text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mb-6 px-5 transition-opacity duration-300
            ${isHovered ? 'opacity-100' : 'opacity-0'}
          `}>
            Navegación
          </div>
          
          {navItems.map(({ name, path, icon: Icon }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`
                  flex items-center group relative h-12 rounded-2xl transition-all duration-300
                  ${active ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-white/[0.03]'}
                `}
              >
                {active && isHovered && (
                  <div className="absolute inset-0 bg-blue-600/10 rounded-2xl border border-blue-500/10 shadow-[0_4px_12px_rgba(0,0,0,0.1)]" />
                )}
                
                <div className="flex items-center gap-4 relative z-10 w-full justify-center md:justify-start">
                  <div className={`
                    flex items-center justify-center shrink-0 transition-all duration-300
                    ${isHovered ? 'w-5 ml-2' : 'w-20'}
                  `}>
                    <Icon
                      size={isHovered ? 19 : 24}
                      strokeWidth={active ? 2.5 : 2}
                      className={active ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.4)]' : 'text-slate-500 group-hover:text-slate-300 transition-colors duration-300'}
                    />
                  </div>
                  
                  <span className={`
                    text-[13px] font-bold whitespace-nowrap transition-all duration-500
                    ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none w-0'}
                    ${active ? 'text-white' : 'text-slate-400'}
                  `}>
                    {name}
                  </span>
                  
                  {active && isHovered && <ChevronRight size={14} className="ml-auto mr-4 text-blue-400/50" />}
                </div>

                {/* Active Indicator - Canal Directo Style */}
                {active && (
                  <div className={`
                    absolute left-0 bg-[#e67e22] rounded-r-full transition-all duration-500 shadow-[0_0_15px_rgba(230,126,34,0.4)]
                    ${isHovered ? 'w-1.5 top-3 bottom-3' : 'w-2 top-4 bottom-4'}
                  `} />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Profile */}
        <div className="px-3 py-6 relative transition-all duration-500">
          <div className={`
            relative overflow-hidden group transition-all duration-500
            ${isHovered 
              ? 'bg-gradient-to-br from-white/[0.05] to-transparent border border-white/5 backdrop-blur-sm p-5 rounded-[2rem]' 
              : 'h-12 w-full flex items-center justify-center rounded-2xl hover:bg-white/[0.03]'}
          `}>
            <div className={`flex items-center gap-4 relative z-10 w-full ${isHovered ? 'mb-4 md:justify-start' : 'justify-center'}`}>
              <div className={`
                flex items-center justify-center shrink-0 transition-all duration-500
                ${isHovered ? 'w-11 h-11' : 'w-full'}
              `}>
                <div className="relative group/avatar">
                  <div className={`
                    bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center text-white font-black
                    transition-all duration-500 ring-offset-2 ring-offset-slate-950
                    ${isHovered 
                      ? 'w-11 h-11 shadow-[0_10px_20px_rgba(245,158,11,0.25)] rounded-2xl ring-0' 
                      : 'w-8 h-8 text-[10px] shadow-none rounded-xl ring-1 ring-white/10'}
                  `}>
                    {(email || 'A')[0].toUpperCase()}
                  </div>
                  <div className={`
                    absolute bg-emerald-500 border border-slate-950 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]
                    ${isHovered ? 'w-3 h-3 -bottom-1 -right-1' : 'w-2 h-2 -bottom-0.5 -right-0.5'}
                  `} />
                </div>
              </div>
              
              <div className={`flex flex-col min-w-0 transition-all duration-500 ${isHovered ? 'opacity-100' : 'opacity-0 w-0 h-0 overflow-hidden'}`}>
                <span className="text-sm font-bold text-white truncate">{email?.split('@')[0] || 'admin'}</span>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Soporte IT</span>
              </div>
            </div>
            
            <button
              onClick={logout}
              className={`
                flex items-center justify-center gap-2 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-[11px] font-black uppercase tracking-widest text-slate-500 transition-all duration-300 border border-slate-200
                ${isHovered ? 'w-full py-2.5 px-4' : 'absolute inset-0 opacity-0 group-hover:opacity-100 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-2xl'}
              `}
              title="Cerrar Sesión"
            >
              <LogOut size={isHovered ? 14 : 18} />
              {isHovered && "Salir"}
            </button>

            {/* Hover Indicator Pattern - Matches Nav Style */}
            {!isHovered && (
              <div className="absolute left-0 top-3 bottom-3 w-1 bg-orange-500 rounded-r-full opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={`
        flex flex-col flex-1 min-h-screen transition-all duration-500 ease-in-out
        md:pl-20 ${isHovered ? 'md:pl-72' : ''}
      `}>
        {/* Top Header */}
        <header className="h-16 bg-white/80 backdrop-blur-xl border-b border-slate-200 sticky top-0 z-50 px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={toggleMobileMenu}
              className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
            >
              <Menu size={20} />
            </button>
            <div className="hidden md:block">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Centro de Operaciones</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative hidden sm:flex items-center group">
              <div className="absolute left-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none">
                <Search size={16} />
              </div>
              <input
                type="text"
                placeholder="Buscar..."
                className="cd-input w-64 !pl-11 !pr-10 !bg-slate-100/50 border-transparent focus:!bg-white focus:!border-blue-500/30 h-10 text-sm transition-all rounded-xl"
              />
              <div className="absolute right-3 px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-bold text-slate-400 pointer-events-none">
                Ctrl K
              </div>
            </div>
            
            <button className="p-2.5 text-slate-500 hover:bg-slate-100 rounded-xl transition-all">
              <Settings size={20} />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="p-4 md:p-10 flex-1 animate-fade-in bg-[#f8fafc]">
          <div className="max-w-[1400px] mx-auto">
            <Suspense fallback={
              <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] animate-pulse">
                    Cargando Módulo...
                  </span>
                </div>
              </div>
            }>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;

