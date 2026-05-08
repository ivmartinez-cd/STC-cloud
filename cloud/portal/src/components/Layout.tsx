import { Link, useLocation, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileText, LogOut, Bell, Search, Settings,
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

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <div className="min-h-screen bg-[#e9eff3] text-[#1a2333] font-sans">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-60 bg-[#2980b9] hidden md:flex flex-col z-50">
        {/* Logo */}
        <div className="px-5 py-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="STC Cloud" className="h-10 w-auto object-contain drop-shadow-md" />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map(({ name, path, icon: Icon }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-white/20 text-white'
                    : 'text-blue-100/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon
                  size={17}
                  className={active ? 'text-[#f39c12]' : 'text-blue-200/70'}
                />
                {name}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="px-3 py-4 border-t border-white/10">
          <div className="px-3 py-3">
            <div className="text-[10px] text-blue-200/60 uppercase tracking-wider mb-0.5">Usuario</div>
            <div className="text-sm font-semibold text-white truncate">{email || 'admin'}</div>
            <button
              onClick={logout}
              className="mt-2.5 flex items-center gap-1.5 text-xs text-blue-200/70 hover:text-white transition-colors"
            >
              <LogOut size={12} />
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="md:pl-60 flex flex-col min-h-screen">
        {/* Top header */}
        <header className="h-14 border-b border-[#d1d8e0] bg-white sticky top-0 z-40 px-6 flex items-center shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]">
          <div className="w-full flex items-center justify-between gap-4">
            <div className="relative hidden sm:block" style={{ width: 320 }}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                type="text"
                placeholder="Buscar por IP, Serial o Cliente..."
                className="cd-input w-full !pl-10 py-1.5 text-sm"
              />
            </div>
            <div className="flex items-center gap-3 ml-auto">
              <button className="p-1.5 text-slate-400 hover:text-[#2980b9] hover:bg-blue-50 rounded-lg transition-all">
                <Bell size={18} />
              </button>
              <div className="w-8 h-8 rounded-lg bg-[#2980b9] flex items-center justify-center text-white text-xs font-bold">
                {(email || 'A')[0].toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <main className="p-6 flex-1">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
