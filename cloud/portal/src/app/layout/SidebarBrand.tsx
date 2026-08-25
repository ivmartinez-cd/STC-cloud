import { Link } from 'react-router-dom';
import { X } from 'lucide-react';

interface Props { isHovered: boolean; isMobileMenuOpen: boolean; onNavigate: () => void; onCloseMobile: () => void; }

/** Filtro SVG que pinta el isologo (logo2.png) en el naranja exacto de la marca. */
const OrangeFilter = () => (
  <svg width="0" height="0" className="absolute">
    <filter id="precise-orange" colorInterpolationFilters="sRGB">
      <feColorMatrix type="matrix" values="0 0 0 0 0.968  0 0 0 0 0.576  0 0 0 0 0.113  0 0 0 1 0" />
    </filter>
  </svg>
);

/** Logo completo cuando la barra está expandida; isologo cuando está en modo riel. */
const LogoSwap = ({ isHovered }: { isHovered: boolean }) => (
  <div className="relative h-14 flex items-center justify-center min-w-[40px]">
    <img src="/logo.png" alt="STC Cloud"
      className={`h-11 w-auto object-contain transition-all duration-500 ${isHovered ? 'opacity-100 scale-100' : 'opacity-0 scale-75 absolute pointer-events-none'}`} />
    <OrangeFilter />
    <img src="/logo2.png" alt="STC" style={{ filter: 'url(#precise-orange)' }}
      className={`h-10 w-auto object-contain transition-all duration-500 ${!isHovered ? 'opacity-100 scale-110' : 'opacity-0 scale-125 absolute pointer-events-none'}`} />
    <div className="absolute inset-0 bg-brand/5 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
  </div>
);

const SidebarBrand = ({ isHovered, isMobileMenuOpen, onNavigate, onCloseMobile }: Props) => (
  <div className={`py-10 relative flex flex-col items-center shrink-0 transition-all duration-500 ${isHovered ? 'px-8' : 'px-0'}`}>
    <Link to="/" className="flex flex-col items-center group" onClick={onNavigate}>
      <LogoSwap isHovered={isHovered} />
      <div className={`flex items-center gap-1.5 relative z-10 transition-all duration-500 -mt-2 ${isHovered ? 'opacity-100' : 'opacity-0 scale-90 h-0 overflow-hidden'}`}>
        <span className="font-montserrat font-black text-base tracking-tight text-brand-charcoal">STC</span>
        <span className="font-montserrat font-black text-base tracking-tight text-brand">CLOUD</span>
      </div>
    </Link>
    {isMobileMenuOpen && (
      <button onClick={onCloseMobile} className="md:hidden absolute top-10 right-6 p-2 hover:bg-white/5 rounded-full transition-colors">
        <X size={20} className="text-slate-400" />
      </button>
    )}
  </div>
);

export default SidebarBrand;
