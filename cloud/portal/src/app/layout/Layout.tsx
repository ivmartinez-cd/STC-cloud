import { useState, useRef, useEffect, Suspense } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Menu, Settings } from 'lucide-react';
import { useAuth } from '../../store/AuthContext';
import FeedbackModal from '../../shared/components/FeedbackModal';
import SidebarNav from './SidebarNav';
import SidebarBrand from './SidebarBrand';
import SidebarUser from './SidebarUser';
import GlobalSearch from './GlobalSearch';
import FeedbackFab from './FeedbackFab';
import { filterNavByRole } from './navTree';
import { NAV_SECTIONS } from './navItems';
import { useGlobalSearch } from './useGlobalSearch';
import { useNavBadges } from './useNavBadges';
import { useSidebarCollapse } from './useSidebarCollapse';

interface SidebarProps {
  collapsed: boolean; onToggleCollapse: () => void; isMobileMenuOpen: boolean; onCloseMobile: () => void;
}

/** Tira de 5 colores de marca — remate inferior a todo el ancho, igual que el Login. */
const BrandStripe = () => (
  <div className="grid shrink-0 grid-cols-5">
    <div className="h-1 bg-brand-severe" />
    <div className="h-1 bg-brand" />
    <div className="h-1 bg-brand-light" />
    <div className="h-1 bg-ink-500" />
    <div className="h-1 bg-brand-gray" />
  </div>
);

/** Barra lateral (handoff hifi "Sidebar", 26/08/2026): panel de marca #2E3033,
 * 248px expandida / 64px colapsada por control explícito (persiste por
 * usuario, no hover — ver `useSidebarCollapse`). En mobile es un drawer sobre
 * overlay, siempre expandido mientras está abierto. */
const Sidebar = ({ collapsed, onToggleCollapse, isMobileMenuOpen, onCloseMobile }: SidebarProps) => {
  const { userEmail: email, role, logout } = useAuth();
  const badges = useNavBadges(role);
  const sections = filterNavByRole(NAV_SECTIONS, role);
  const visualCollapsed = isMobileMenuOpen ? false : collapsed;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-[70] flex w-[248px] flex-col overflow-hidden bg-panel-dark transition-all duration-300 ease-in-out
        ${collapsed ? 'md:w-16' : 'md:w-[248px]'}
        ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}`}
    >
      <SidebarBrand collapsed={visualCollapsed} isMobileMenuOpen={isMobileMenuOpen} onNavigate={onCloseMobile} onCloseMobile={onCloseMobile} />
      <nav aria-label="Navegación principal" className="custom-scrollbar flex-1 overflow-y-auto overflow-x-hidden pb-4">
        <SidebarNav sections={sections} badges={badges} collapsed={visualCollapsed} onNavigate={onCloseMobile} />
      </nav>
      <SidebarUser collapsed={visualCollapsed} email={email} role={role} onLogout={logout} onToggleCollapse={onToggleCollapse} />
      <BrandStripe />
    </aside>
  );
};

/** Usa el historial del navegador cuando la entrada actual fue empujada
 * dentro de la app (`history.state.idx > 0`, lo que React Router persiste en
 * cada push); si se entró por URL directa o refresh no hay historial propio,
 * así que cae a la ruta padre derivada del path en vez de sacar al usuario
 * de la app. */
function useHeaderBackNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const segments = location.pathname.split('/').filter(Boolean);
  const parentPath = '/' + segments.slice(0, -1).join('/');
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(parentPath);
  };
  return { show: segments.length > 1, goBack };
}

/** Flecha "volver" global de header — se muestra en cualquier ruta de detalle
 * (más de un segmento, ej. `/clients/:id`). */
const HeaderBackButton = () => {
  const { show, goBack } = useHeaderBackNavigation();
  if (!show) return null;
  return (
    <button
      onClick={goBack}
      aria-label="Volver"
      className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-xl transition-all"
    >
      <ArrowLeft size={20} />
    </button>
  );
};

const TopHeader = ({ onToggleMobile }: { onToggleMobile: () => void }) => {
  const search = useGlobalSearch();
  return (
    <header className="h-16 bg-white/80 backdrop-blur-xl border-b border-slate-200 sticky top-0 z-50 px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <button onClick={onToggleMobile} className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
          <Menu size={20} />
        </button>
        <HeaderBackButton />
        <div className="hidden md:block">
          <span className="font-montserrat text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Centro de Operaciones</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <GlobalSearch s={search} />
        <button className="p-2.5 text-slate-500 hover:bg-slate-100 rounded-xl transition-all"><Settings size={20} /></button>
      </div>
    </header>
  );
};

const ModuleFallback = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-4 border-slate-200 border-t-brand rounded-full animate-spin" />
      <span className="font-montserrat text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] animate-pulse">Cargando Módulo...</span>
    </div>
  </div>
);

const TotpBanner = () => (
  <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm font-bold text-amber-700">
    Tu cuenta exige autenticación de dos factores — configurala en{' '}
    <Link to="/settings" className="underline">Configuración</Link> para poder seguir operando.
  </div>
);

const Layout = () => {
  const { totpEnrollmentRequired } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const { collapsed, toggle: toggleCollapse } = useSidebarCollapse();
  const closeMobile = () => setIsMobileMenuOpen(false);

  // `<main>` es el contenedor que scrollea (no `window` — el layout es
  // `h-screen overflow-hidden`), así que React Router no lo resetea solo al
  // navegar: entrar a un nodo desde el fondo de una lista larga (ej. el
  // listado de monitores de Cliente Detalle) dejaba la pantalla siguiente
  // scrolleada al mismo punto en vez de arriba.
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  useEffect(() => { mainRef.current?.scrollTo(0, 0); }, [location.pathname]);
  // El scroll-anchoring nativo del navegador reajusta scrollTop mientras el
  // contenido de la página destino sigue montándose de forma asíncrona
  // (tabs/paneles con su propio loading), deshaciendo el reset de arriba —
  // sin esto la pantalla terminaba scrolleada a un valor residual en vez de 0.

  return (
    <div className="h-screen overflow-hidden bg-[#f8fafc] text-[#1a2333] font-sans flex">
      {isMobileMenuOpen && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] md:hidden" onClick={closeMobile} />}
      <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapse} isMobileMenuOpen={isMobileMenuOpen} onCloseMobile={closeMobile} />
      <div className={`flex flex-col flex-1 min-w-0 h-screen min-h-0 transition-all duration-300 ease-in-out ${collapsed ? 'md:pl-16' : 'md:pl-[248px]'}`}>
        <TopHeader onToggleMobile={() => setIsMobileMenuOpen((v) => !v)} />
        <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto animate-fade-in bg-[#f8fafc] [overflow-anchor:none]">
          <div className="max-w-[1400px] mx-auto p-4 md:p-10 xl:h-full xl:flex xl:flex-col">
            <Suspense fallback={<ModuleFallback />}>
              {totpEnrollmentRequired && <TotpBanner />}
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
      <FeedbackFab onClick={() => setShowFeedback(true)} />
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </div>
  );
};

export default Layout;
