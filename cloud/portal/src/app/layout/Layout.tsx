import { useState, Suspense } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Menu, Settings } from 'lucide-react';
import { useAuth } from '../../store/AuthContext';
import FeedbackModal from '../../shared/components/FeedbackModal';
import SidebarNav from './SidebarNav';
import SidebarBrand from './SidebarBrand';
import SidebarUser from './SidebarUser';
import GlobalSearch from './GlobalSearch';
import FeedbackFab from './FeedbackFab';
import { filterNavTreeByRole } from './navTree';
import { NAV_TREE } from './navItems';
import { useGlobalSearch } from './useGlobalSearch';
import { usePendingBadge } from './usePendingBadge';

interface SidebarProps { isHovered: boolean; isMobileMenuOpen: boolean; onHover: (v: boolean) => void; onCloseMobile: () => void; }

/** Barra lateral "riel + expansión": 5rem colapsada, 18rem al hover; en móvil se abre como drawer. */
const Sidebar = ({ isHovered, isMobileMenuOpen, onHover, onCloseMobile }: SidebarProps) => {
  const { userEmail: email, role, logout } = useAuth();
  const pendingCount = usePendingBadge(role);
  return (
    <aside onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}
      className={`fixed inset-y-0 left-0 bg-white border-r border-slate-200 text-slate-700 flex flex-col z-[70] transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden
        ${isHovered ? 'w-72 shadow-[20px_0_50px_rgba(0,0,0,0.05)]' : 'md:w-20 w-0 -translate-x-full md:translate-x-0'}
        ${isMobileMenuOpen ? 'w-72 translate-x-0 shadow-2xl' : ''}`}>
      <div className="absolute top-0 left-0 w-full h-64 bg-orange-500/5 blur-[100px] pointer-events-none" />
      <SidebarBrand isHovered={isHovered} isMobileMenuOpen={isMobileMenuOpen} onNavigate={onCloseMobile} onCloseMobile={onCloseMobile} />
      <nav className="flex-1 px-3 py-6 space-y-2 overflow-y-auto relative custom-scrollbar overflow-x-hidden">
        <div className={`font-montserrat text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mb-6 px-5 transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
          Navegación
        </div>
        <SidebarNav entries={filterNavTreeByRole(NAV_TREE, role)} isHovered={isHovered} pendingCount={pendingCount} onNavigate={onCloseMobile} />
      </nav>
      <SidebarUser isHovered={isHovered} email={email} role={role} onLogout={logout} />
    </aside>
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
  const [isHovered, setIsHovered] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const closeMobile = () => setIsMobileMenuOpen(false);

  return (
    <div className="h-screen overflow-hidden bg-[#f8fafc] text-[#1a2333] font-sans flex">
      {isMobileMenuOpen && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] md:hidden" onClick={closeMobile} />}
      <Sidebar isHovered={isHovered} isMobileMenuOpen={isMobileMenuOpen} onHover={setIsHovered} onCloseMobile={closeMobile} />
      <div className={`flex flex-col flex-1 h-screen min-h-0 transition-all duration-500 ease-in-out md:pl-20 ${isHovered ? 'md:pl-72' : ''}`}>
        <TopHeader onToggleMobile={() => setIsMobileMenuOpen((v) => !v)} />
        <main className="flex-1 min-h-0 overflow-y-auto animate-fade-in bg-[#f8fafc]">
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
