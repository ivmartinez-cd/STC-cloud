import { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileText, LogOut, Bell, Search, Settings, Menu, X, ChevronRight, Server
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { name: 'Dashboard',     path: '/',          icon: LayoutDashboard },
  { name: 'Clientes',      path: '/clients',   icon: Users           },
  { name: 'Reportes',      path: '/reports',   icon: FileText        },
  { name: 'Agentes',       path: '/agents',    icon: Server          },
  { name: 'Configuración', path: '/settings',  icon: Settings        },
];

const Layout = () => {
  const location = useLocation();
  const { email, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 w-64 bg-slate-900 text-white flex flex-col z-[70] transition-transform duration-300 ease-in-out
        md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        bg-gradient-to-b from-[#2c3e50] to-[#1a2533] shadow-2xl
      `}>
        {/* Logo */}
        <div className="px-6 py-8 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" onClick={() => setIsMobileMenuOpen(false)}>
            <div className="bg-white p-1.5 rounded-lg shadow-inner">
              <img src="/logo.png" alt="STC Cloud" className="h-8 w-auto object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold tracking-tight text-lg leading-none">STC Cloud</span>
              <span className="text-[10px] text-blue-300 font-bold uppercase tracking-[0.1em] mt-1 opacity-80">Canal Directo</span>
            </div>
          </Link>
          <button onClick={toggleMobileMenu} className="md:hidden p-1 hover:bg-white/10 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider px-3 mb-4 opacity-50">Menú Principal</div>
          {navItems.map(({ name, path, icon: Icon }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-all group ${
                  active
                    ? 'bg-[#2980b9] text-white shadow-lg shadow-blue-900/20'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    size={18}
                    className={active ? 'text-white' : 'text-slate-500 group-hover:text-blue-400 transition-colors'}
                  />
                  {name}
                </div>
                {active && <ChevronRight size={14} className="text-white/50" />}
              </Link>
            );
          })}
        </nav>

        {/* User Profile / Footer */}
        <div className="p-4 border-t border-white/5">
          <div className="bg-white/5 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#e67e22] flex items-center justify-center text-white font-bold shadow-lg shadow-orange-900/20">
                {(email || 'A')[0].toUpperCase()}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-white truncate">{email || 'Administrador'}</span>
                <span className="text-[10px] text-slate-400 truncate">Soporte Técnico</span>
              </div>
            </div>
            <button
              onClick={logout}
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 text-xs font-bold text-slate-400 transition-all border border-transparent hover:border-rose-500/30"
            >
              <LogOut size={14} />
              Cerrar Sesión
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="md:pl-64 flex flex-col min-h-screen">
        {/* Top Header */}
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={toggleMobileMenu}
              className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
            >
              <Menu size={20} />
            </button>
            <div className="relative hidden sm:block lg:w-96">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Buscar impresoras, clientes o IPs..."
                className="cd-input w-full !pl-11 !bg-slate-50 border-transparent focus:!bg-white focus:!border-[#2980b9] h-10"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="p-2.5 text-slate-500 hover:text-[#2980b9] hover:bg-blue-50 rounded-xl transition-all relative">
              <Bell size={20} />
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
            </button>
            <div className="h-8 w-[1px] bg-slate-200 mx-2 hidden sm:block"></div>
            <div className="flex flex-col items-end hidden sm:flex">
              <span className="text-xs font-bold text-slate-800 leading-none">Canal Directo</span>
              <span className="text-[10px] text-emerald-500 font-bold mt-1 uppercase">Servicio Cloud</span>
            </div>
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

