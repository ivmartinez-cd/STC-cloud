import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { ROLE_LABELS } from './navItems';

interface Props { collapsed: boolean; email: string | null; role: string; onLogout: () => void; onToggleCollapse: () => void; }

const Avatar = ({ collapsed, initial }: { collapsed: boolean; initial: string }) => (
  <div className={`flex flex-none items-center justify-center rounded-[3px] bg-brand font-montserrat font-bold text-panel-dark ${
    collapsed ? 'h-[30px] w-[30px] text-[11px]' : 'h-8 w-8 text-xs'}`}>
    {initial}
  </div>
);

const CollapseToggle = ({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) => (
  <button
    type="button" onClick={onToggle} title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
    aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
    className={`flex flex-none items-center justify-center rounded-[3px] border border-panel-dark-line text-panel-dark-label transition-colors hover:border-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-[-2px] ${
      collapsed ? 'h-[26px] w-[26px]' : 'h-[22px] w-[22px]'}`}
  >
    {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
  </button>
);

/** Pie del sidebar (handoff hifi "Sidebar", 26/08/2026) — avatar + usuario + rol
 * (el rol importa en un producto con RBAC), control de colapso y salir. Sin
 * punto verde de "en línea": no informa nada sobre el propio usuario. */
const SidebarUser = ({ collapsed, email, role, onLogout, onToggleCollapse }: Props) => (
  <div className={`shrink-0 border-t border-panel-dark-line ${collapsed ? 'px-0 py-3.5' : 'px-[18px] py-3.5'}`}>
    <div className={`flex items-center ${collapsed ? 'flex-col gap-2.5' : 'mb-3 gap-[11px]'}`}>
      <Avatar collapsed={collapsed} initial={(email || 'A')[0].toUpperCase()} />
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <div className="truncate font-sans text-[12.5px] font-semibold leading-[1.3] text-white">{email?.split('@')[0] || 'admin'}</div>
          <div className="mt-0.5 font-montserrat text-[7.5px] font-bold leading-[1.4] tracking-[.13em] text-panel-dark-label">{(ROLE_LABELS[role] ?? role).toUpperCase()}</div>
        </div>
      )}
      <CollapseToggle collapsed={collapsed} onToggle={onToggleCollapse} />
    </div>
    {!collapsed && (
      <button
        type="button" onClick={onLogout}
        className="flex w-full items-center justify-center gap-2 rounded-[3px] border border-panel-dark-line px-3 py-[9px] font-montserrat text-[10px] font-semibold uppercase tracking-[.1em] text-panel-dark-text transition-colors hover:border-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-[-2px]"
      >
        <LogOut size={13} />
        Cerrar sesión
      </button>
    )}
  </div>
);

export default SidebarUser;
