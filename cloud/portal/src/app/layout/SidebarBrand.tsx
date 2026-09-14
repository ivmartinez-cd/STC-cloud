import { Link } from 'react-router-dom';
import { X } from 'lucide-react';

interface Props { collapsed: boolean; isMobileMenuOpen: boolean; onNavigate: () => void; onCloseMobile: () => void; }

/** Cabecera del panel de marca. Desde el 27/08/2026 usa el wordmark vectorial
 * oficial para fondo oscuro (`brand/wm-blanco.svg`: isotipo + "CANAL DIRECTO"),
 * el mismo del panel oscuro del Login, con "STC CLOUD" debajo como nombre del
 * producto. Antes: isotipo PNG de 26px teñido con un filtro SVG + el lockup
 * tipeado a mano en 12/7.5px, que se veía chico y desparejo con el Login.
 * Colapsado: sólo el isotipo (`logo2.png`, blanco), centrado. */
const SidebarBrand = ({ collapsed, isMobileMenuOpen, onNavigate, onCloseMobile }: Props) => (
  <div className={`relative flex shrink-0 items-center border-b border-panel-dark-line ${collapsed ? 'justify-center py-5' : 'px-[18px] py-[18px]'}`}>
    <Link to="/" onClick={onNavigate} className="flex min-w-0 flex-col gap-[7px]" title="STC Cloud · Canal Directo">
      {collapsed ? (
        <img src="/logo2.png" alt="Canal Directo" className="h-[26px] w-auto flex-none object-contain" />
      ) : (
        <>
          <img src="/brand/wm-blanco.svg" alt="Canal Directo" className="block h-[30px] w-auto max-w-full flex-none" />
          <div className="pl-[3px] font-montserrat text-[8px] font-bold leading-none tracking-[.2em] text-brand">STC CLOUD</div>
        </>
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