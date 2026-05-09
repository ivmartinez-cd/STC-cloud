import { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileText, LogOut, Search, Settings, Menu, X, ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { name: 'Dashboard',     path: '/',          icon: LayoutDashboard },
  { name: 'Clientes',      path: '/clients',   icon: Users           },
  { name: 'Reportes',      path: '/reports',   icon: FileText        },
  { name: 'Configuración', path: '/settings',  icon: Settings        },
];

const Layout = () => {
  const location = useLocation();
  const { email, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#1a2333] font-sans">
      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] md:hidden"
          onClick={toggleMobileMenu}
        />
      )}

      <aside 
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`
        fixed inset-y-0 left-0 w-72 bg-slate-950 text-white flex flex-col z-[70] transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1)
        ${isHovered || isMobileMenuOpen ? 'translate-x-0' : 'md:-translate-x-[280px] -translate-x-full'}
        border-r border-white/5 shadow-[20px_0_50px_rgba(0,0,0,0.3)]
      `}>
        {/* Glow indicator when collapsed */}
        {!isHovered && !isMobileMenuOpen && (
          <div className="absolute top-0 right-0 w-1 h-full bg-blue-500/30 blur-sm md:block hidden" />
        )}
        {/* Subtle Ambient Glow */}
        <div className="absolute top-0 left-0 w-full h-64 bg-blue-500/10 blur-[100px] pointer-events-none" />

        {/* Brand Header - Refined Style */}
        <div className="px-8 py-10 relative flex flex-col items-center border-b border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
          <Link to="/" className="flex flex-col items-center gap-4 group" onClick={() => setIsMobileMenuOpen(false)}>
            <div className="relative">
              <img 
                src="/logo1.png" 
                alt="Canal Directo" 
                className="h-10 w-auto object-contain transition-transform duration-500 group-hover:scale-105" 
              />
              <div className="absolute inset-0 bg-blue-500/10 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            </div>
            
            <div className="flex items-center gap-1.5 relative z-10">
              <span className="font-montserrat font-black text-lg tracking-tight text-white">
                STC
              </span>
              <span className="font-montserrat font-black text-lg tracking-tight text-blue-500">
                Cloud
              </span>
            </div>
          </Link>
          
          <button onClick={toggleMobileMenu} className="md:hidden absolute top-10 right-6 p-2 hover:bg-white/5 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto relative custom-scrollbar">
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] px-5 mb-6">Navegación</div>
          {navItems.map(({ name, path, icon: Icon }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center justify-between px-4 py-3 rounded-2xl text-[13px] font-bold transition-all duration-300 group relative ${
                  active
                    ? 'text-white'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.03]'
                }`}
              >
                {active && (
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-blue-600/5 rounded-2xl border border-blue-500/20 shadow-[0_0_20px_rgba(37,99,235,0.1)]" />
                )}
                {active && (
                  <div className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                )}
                
                <div className="flex items-center gap-4 relative z-10">
                  <Icon
                    size={19}
                    strokeWidth={active ? 2.5 : 2}
                    className={active ? 'text-blue-400' : 'text-slate-500 group-hover:text-blue-400 transition-colors duration-300'}
                  />
                  <span className={active ? 'translate-x-1 transition-transform duration-300' : 'group-hover:translate-x-1 transition-transform duration-300'}>
                    {name}
                  </span>
                </div>
                {active && <ChevronRight size={14} className="text-blue-400/50 relative z-10" />}
              </Link>
            );
          })}
        </nav>

        {/* User Profile - Premium Card */}
        <div className="p-6 relative">
          <div className="bg-gradient-to-br from-white/[0.05] to-transparent rounded-[2rem] border border-white/5 p-5 backdrop-blur-sm relative overflow-hidden group">
            {/* Decorative background circle */}
            <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors duration-500" />
            
            <div className="flex items-center gap-4 mb-4">
              <div className="relative">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center text-white font-black shadow-[0_10px_20px_rgba(245,158,11,0.2)]">
                  {(email || 'A')[0].toUpperCase()}
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-4 border-slate-950 rounded-full" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold text-white truncate">{email?.split('@')[0] || 'admin'}</span>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Soporte IT</span>
              </div>
            </div>
            
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/[0.03] hover:bg-rose-500/10 hover:text-rose-400 text-[11px] font-black uppercase tracking-widest text-slate-400 transition-all duration-300 border border-white/5 hover:border-rose-500/20"
            >
              <LogOut size={14} />
              Cerrar Sesión
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-col min-h-screen transition-all duration-500">
        {/* Top Header */}
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={toggleMobileMenu}
              className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
            >
              <Menu size={20} />
            </button>
          </div>

          <div className="relative hidden sm:block lg:w-96">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Buscar impresoras, clientes o IPs..."
              className="cd-input w-full !pl-11 !bg-slate-50 border-transparent focus:!bg-white focus:!border-[#2980b9] h-10"
            />
          </div>
        </header>

        {/* Content */}
        <main className="p-4 md:p-8 flex-1 animate-fade-in">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;

