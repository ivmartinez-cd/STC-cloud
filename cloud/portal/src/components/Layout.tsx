import { useState, Suspense, useEffect, useRef } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { api } from '../lib/api';
import {
  LayoutDashboard, Users, LogOut, Search, Settings, Menu, X, Shield, MessageSquarePlus, Bell, FileText, History, UserCheck, Droplets, AlertOctagon, CalendarClock, PackageSearch, MailCheck, Radio
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import FeedbackModal from './FeedbackModal';
import SidebarNav from './layout/SidebarNav';
import { filterNavTreeByRole, type NavEntry } from './layout/navTree';

type SearchClient = { id: string; name: string };
type SearchDevice = { id: string; serial_number: string; brand: string; model: string };
type SearchResults = { clients: SearchClient[]; devices: SearchDevice[] };

// `roles` ausente = visible para cualquier rol autenticado. "Agentes" expone
// inventario/config de monitores de TODOS los clientes vistos por ese rol — no
// tiene sentido para un client_viewer (que además el backend le deniega esas
// rutas con 403).
//
// Agrupado en sub-niveles (Fase de UX 2026-08-24, mismo criterio que HP SDS)
// — para agregar un ítem nuevo: si encaja en un grupo existente, sumalo a su
// `children`; si es un destino de primer nivel nuevo (poco frecuente), agregá
// un `NavLeaf` suelto al array.
const navTree: NavEntry[] = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  {
    name: 'Gestión de Clientes', icon: Users,
    children: [
      { name: 'Clientes', path: '/clients', icon: Users },
      { name: 'Pendientes', path: '/pending', icon: UserCheck, roles: ['admin', 'operator'], badgeKey: 'pending' },
    ],
  },
  {
    name: 'Gestión de Agentes', icon: Shield, roles: ['admin', 'operator'],
    children: [
      { name: 'Agentes', path: '/agents', icon: Shield, roles: ['admin', 'operator'] },
      { name: 'Acciones', path: '/remote-actions', icon: Radio, roles: ['admin', 'operator'] },
    ],
  },
  {
    name: 'Gestión de Consumibles', icon: Droplets,
    children: [
      { name: 'Consumibles', path: '/supplies', icon: Droplets },
      { name: 'Pedidos', path: '/supply-requests', icon: PackageSearch },
    ],
  },
  {
    name: 'Gestión de Incidencias', icon: AlertOctagon,
    children: [
      { name: 'Incidentes', path: '/incidents', icon: AlertOctagon },
      { name: 'Alertas', path: '/alerts', icon: Bell },
    ],
  },
  {
    name: 'Informes', icon: FileText,
    children: [
      { name: 'Reportes', path: '/reports', icon: FileText },
      { name: 'Informes Programados', path: '/scheduled-reports', icon: CalendarClock, roles: ['admin', 'operator'] },
    ],
  },
  {
    name: 'Administración', icon: History, roles: ['admin', 'operator'],
    children: [
      { name: 'Movimientos', path: '/activity', icon: History, roles: ['admin', 'operator'] },
      { name: 'Correo', path: '/email-log', icon: MailCheck, roles: ['admin', 'operator'] },
    ],
  },
  { name: 'Configuración', path: '/settings', icon: Settings },
];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  operator: 'Operador',
  client_viewer: 'Cliente',
};

const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};

const Layout = () => {
  const { totpEnrollmentRequired, userEmail: email, role, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const [showFeedback, setShowFeedback] = useState(false);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults>({ clients: [], devices: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Badge de "Pendientes" (Fase 7 del gap analysis vs HP SDS) — reusa
  // GET /dashboard (ya scopeado por rol/cliente en el backend), sondeado cada
  // 60s. Sólo admin/operator ven el ítem de nav, así que no tiene sentido
  // pedirlo para un client_viewer.
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    if (role !== 'admin' && role !== 'operator') return;
    let cancelled = false;
    const fetchPending = async () => {
      try {
        const data = await api.get<{ discovered?: { pendingTotal?: number } }>('/dashboard');
        if (!cancelled) setPendingCount(data?.discovered?.pendingTotal ?? 0);
      } catch {
        // Comodidad — si falla, el badge simplemente no aparece.
      }
    };
    void fetchPending();
    const interval = setInterval(fetchPending, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [role]);

  useEffect(() => {
    const init = async () => {
      if (debouncedSearch.length >= 2) {
        setIsSearching(true);
        try {
          const data = await api.get<SearchResults>(`/search?q=${debouncedSearch}`);
          setSearchResults(data);
          setShowResults(true);
        } catch (error) {
          console.error('Search error:', error);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults({ clients: [], devices: [] });
        setShowResults(false);
      }
    };
    void init();
  }, [debouncedSearch]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
      }
    };
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  return (
    <div className="h-screen overflow-hidden bg-[#f8fafc] text-[#1a2333] font-sans flex">
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
              {/* High-Precision Orange Filter Definition */}
              <svg width="0" height="0" className="absolute">
                <filter id="precise-orange" colorInterpolationFilters="sRGB">
                  <feColorMatrix 
                    type="matrix" 
                    values="0 0 0 0 0.968 
                            0 0 0 0 0.576 
                            0 0 0 0 0.113 
                            0 0 0 1 0" 
                  />
                </filter>
              </svg>

              {/* Icon Logo - Precision Painted */}
              <img 
                src="/logo2.png" 
                alt="STC" 
                className={`h-10 w-auto object-contain transition-all duration-500 ${!isHovered ? 'opacity-100 scale-110' : 'opacity-0 scale-125 absolute pointer-events-none'}`} 
                style={{ filter: 'url(#precise-orange)' }}
              />
              <div className="absolute inset-0 bg-brand/5 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            </div>
            
            <div className={`flex items-center gap-1.5 relative z-10 transition-all duration-500 -mt-2 ${isHovered ? 'opacity-100' : 'opacity-0 scale-90 h-0 overflow-hidden'}`}>
              <span className="font-montserrat font-black text-base tracking-tight text-brand-charcoal">STC</span>
              <span className="font-montserrat font-black text-base tracking-tight text-brand">CLOUD</span>
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
          
          <SidebarNav
            entries={filterNavTreeByRole(navTree, role)}
            isHovered={isHovered}
            pendingCount={pendingCount}
            onNavigate={() => setIsMobileMenuOpen(false)}
          />
        </nav>

        {/* User Profile */}
        <div className="px-3 py-6 relative transition-all duration-500">
          <div className={`
            relative overflow-hidden group transition-all duration-500
            ${isHovered 
              ? 'bg-slate-50 border border-slate-200/60 p-5 rounded-[2rem]' 
              : 'h-12 w-full flex items-center justify-center rounded-2xl hover:bg-slate-100/50'}
          `}>
            <div className={`flex items-center gap-4 relative z-10 w-full ${isHovered ? 'mb-4 md:justify-start' : 'justify-center'}`}>
              <div className={`
                flex items-center justify-center shrink-0 transition-all duration-500
                ${isHovered ? 'w-11 h-11' : 'w-full'}
              `}>
                <div className="relative group/avatar">
                  <div className={`
                    bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center text-white font-black
                    transition-all duration-500 ring-offset-2 ring-offset-white
                    ${isHovered 
                      ? 'w-11 h-11 shadow-[0_10px_20px_rgba(245,158,11,0.25)] rounded-2xl ring-0' 
                      : 'w-8 h-8 text-[10px] shadow-none rounded-xl ring-1 ring-slate-200'}
                  `}>
                    {(email || 'A')[0].toUpperCase()}
                  </div>
                  <div className={`
                    absolute bg-emerald-500 border border-white rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]
                    ${isHovered ? 'w-3 h-3 -bottom-1 -right-1' : 'w-2 h-2 -bottom-0.5 -right-0.5'}
                  `} />
                </div>
              </div>
              
              <div className={`flex flex-col min-w-0 transition-all duration-500 ${isHovered ? 'opacity-100' : 'opacity-0 w-0 h-0 overflow-hidden'}`}>
                <span className="text-sm font-bold text-slate-800 truncate">{email?.split('@')[0] || 'admin'}</span>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{ROLE_LABELS[role] ?? role}</span>
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
        flex flex-col flex-1 h-screen min-h-0 transition-all duration-500 ease-in-out
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
            <div className="relative hidden sm:flex items-center group" ref={searchRef}>
              <div className="absolute left-3.5 text-slate-400 group-focus-within:text-brand transition-colors pointer-events-none">
                <Search size={16} />
              </div>
              <input
                id="global-search"
                type="text"
                placeholder="Buscar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setShowResults(true)}
                className="cd-input w-64 !pl-11 !pr-10 !bg-slate-100/50 border-transparent focus:!bg-white focus:!border-brand/30 h-10 text-sm transition-all rounded-xl"
              />
              <div className="absolute right-3 px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-bold text-slate-400 pointer-events-none">
                Ctrl K
              </div>

              {/* Search Results Dropdown */}
              {showResults && (searchResults.clients.length > 0 || searchResults.devices.length > 0 || isSearching) && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.1)] overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-300">
                  {isSearching && (
                    <div className="p-4 flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-slate-200 border-t-brand rounded-full animate-spin" />
                    </div>
                  )}
                  
                  {!isSearching && searchResults.clients.length > 0 && (
                    <div className="p-2">
                      <div className="px-3 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Clientes</div>
                      {searchResults.clients.map(client => (
                        <Link
                          key={client.id}
                          to={`/clients/${client.id}`}
                          onClick={() => { setShowResults(false); setSearchQuery(''); }}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-xl transition-colors group"
                        >
                          <div className="w-8 h-8 rounded-lg bg-brand-gray/10 flex items-center justify-center text-brand-gray group-hover:bg-brand-gray group-hover:text-white transition-colors">
                            <Users size={14} />
                          </div>
                          <span className="text-sm font-semibold text-slate-700">{client.name}</span>
                        </Link>
                      ))}
                    </div>
                  )}

                  {!isSearching && searchResults.devices.length > 0 && (
                    <div className="p-2 border-t border-slate-100">
                      <div className="px-3 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Dispositivos</div>
                      {searchResults.devices.map(device => (
                        <Link
                          key={device.id}
                          to={`/devices/${device.id}`}
                          onClick={() => { setShowResults(false); setSearchQuery(''); }}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-xl transition-colors group"
                        >
                          <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                            <Shield size={14} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-slate-700">{device.serial_number}</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{device.brand} {device.model}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                  
                  {!isSearching && searchQuery.length >= 2 && searchResults.clients.length === 0 && searchResults.devices.length === 0 && (
                    <div className="p-6 text-center text-slate-400 text-sm italic">
                      No se encontraron resultados para "{searchQuery}"
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <button className="p-2.5 text-slate-500 hover:bg-slate-100 rounded-xl transition-all">
              <Settings size={20} />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 min-h-0 overflow-y-auto animate-fade-in bg-[#f8fafc]">
          <div className="max-w-[1400px] mx-auto p-4 md:p-10 xl:h-full xl:flex xl:flex-col">
            <Suspense fallback={
              <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-slate-200 border-t-brand rounded-full animate-spin" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] animate-pulse">
                    Cargando Módulo...
                  </span>
                </div>
              </div>
            }>
              {totpEnrollmentRequired && (
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm font-bold text-amber-700">
                Tu cuenta exige autenticación de dos factores — configurala en{' '}
                <Link to="/settings" className="underline">Configuración</Link> para poder seguir operando.
              </div>
            )}
            <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      {/* Feedback FAB */}
      <button
        onClick={() => setShowFeedback(true)}
        title="Reportar problema o sugerir mejora"
        className="
          fixed bottom-8 right-8 z-[90] group
          flex items-center gap-0 overflow-hidden
          h-12 w-12 hover:w-48
          bg-gradient-to-r from-brand-charcoal to-brand
          text-white rounded-full shadow-[0_8px_30px_rgba(35,35,35,0.35)]
          hover:shadow-[0_12px_40px_rgba(247,148,29,0.45)]
          transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
        "
      >
        <span className="flex items-center justify-center w-12 h-12 shrink-0">
          <MessageSquarePlus size={18} strokeWidth={2.5} className="transition-transform duration-300 group-hover:rotate-12" />
        </span>
        <span className="
          text-[10px] font-black uppercase tracking-widest whitespace-nowrap
          max-w-0 group-hover:max-w-[120px] opacity-0 group-hover:opacity-100
          overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
          pr-0 group-hover:pr-4
        ">
          Dar Feedback
        </span>
      </button>

      {/* Feedback Modal */}
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </div>
  );
};

export default Layout;

