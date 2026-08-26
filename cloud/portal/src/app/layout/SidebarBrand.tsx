import { Link } from 'react-router-dom';
import { X } from 'lucide-react';

interface Props { collapsed: boolean; isMobileMenuOpen: boolean; onNavigate: () => void; onCloseMobile: () => void; }

/** Filtro SVG que pinta el isologo (logo2.png) en el naranja exacto de la marca. */
const OrangeFilter = () => (
  <svg width="0" height="0" className="absolute">
    <filter id="precise-orange" colorInterpolationFilters="sRGB">
      <feColorMatrix type="matrix" values="0 0 0 0 0.968  0 0 0 0 0.576  0 0 0 0 0.113  0 0 0 1 0" />
    </filter>
  </svg>
);

/** Cabecera del panel de marca (handoff hifi "Sidebar", 26/08/2026) — isotipo +
 * lockup en fila, igual que el panel oscuro del Login. Colapsado: sólo el isotipo, centrado. */
const SidebarBrand = ({ collapsed, isMobileMenuOpen, onNavigate, onCloseMobile }: Props) => (
  <div className={`relative flex shrink-0 items-center border-b border-panel-dark-line ${collapsed ? 'justify-center py-5' : 'gap-3 px-[18px] py-5'}`}>
    <Link to="/" onClick={onNavigate} className="flex min-w-0 items-center gap-3">
      <OrangeFilter />
      <img src="/logo2.png" alt="STC Cloud" style={{ filter: 'url(#precise-orange)' }} className="h-[26px] w-auto flex-none object-contain" />
      {!collapsed && (
        <div className="min-w-0">
          <div className="font-montserrat text-xs font-extrabold leading-[1.2] tracking-[.04em] text-white">STC CLOUD</div>
          <div className="mt-[3px] font-montserrat text-[7.5px] font-bold leading-[1.4] tracking-[.15em] text-brand">CANAL DIRECTO</div>
        </div>
      )}
    </Link>
    {isMobileMenuOpen && (
      <button onClick={onCloseMobile} title="Cerrar menú" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-panel-dark-label hover:bg-white/5 hover:text-white md:hidden">
        <X size={18} />
      </button>
    )}
  </div>
);

export default SidebarBrand;
