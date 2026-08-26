import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import type { NavItem, NavSection } from './navTree';
import type { NavBadges } from './useNavBadges';

function isPathActive(path: string, pathname: string): boolean {
  return path === '/' ? pathname === '/' : pathname.startsWith(path);
}

function formatBadge(n: number): string {
  return n > 999 ? `${(n / 1000).toFixed(1).replace('.0', '')}k` : String(n);
}

// Badges "urgentes" (requieren acción) vs "informativos" — handoff hifi "Sidebar".
const URGENT_BADGE_KEYS = new Set(['alerts', 'incidents', 'pending', 'agentsOffline']);

function Badge({ value, urgent, collapsed }: { value: number; urgent: boolean; collapsed: boolean }) {
  // "Un contador en 0 no se muestra, no se pinta gris" — README, punto 3.
  if (value <= 0) return null;
  if (collapsed) {
    return <span aria-hidden="true" className={`absolute right-[13px] top-2 block h-1.5 w-1.5 rounded-full ${urgent ? 'bg-brand-severe' : 'bg-brand'}`} />;
  }
  return (
    <span className={`flex-none rounded-[2px] px-[7px] py-[3px] font-montserrat text-[9.5px] font-bold leading-none tabular-nums ${
      urgent ? 'bg-brand-severe text-white' : 'bg-panel-dark-line text-panel-dark-item'}`}>
      {formatBadge(value)}
    </span>
  );
}

function ItemRow({ item, active, collapsed, badgeValue, onClick }: {
  item: NavItem; active: boolean; collapsed: boolean; badgeValue: number | undefined; onClick: () => void;
}) {
  const Icon = item.icon;
  const urgent = item.badgeKey != null && URGENT_BADGE_KEYS.has(item.badgeKey);
  const value = badgeValue ?? 0;
  const label = value > 0 ? `${item.name}: ${formatBadge(value)}` : item.name;

  const rowClasses = `group relative flex min-h-[40px] items-center gap-3 border-l-[3px] py-[9px] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-[-2px] ${
    collapsed ? 'justify-center px-0' : 'pl-[15px] pr-[18px]'
  } ${active ? 'border-brand bg-brand/[0.13]' : 'border-transparent hover:bg-white/5'}`;

  const content = (
    <>
      <Icon size={collapsed ? 18 : 17} strokeWidth={1.6} className={`flex-none ${active ? 'text-brand' : 'text-panel-dark-label group-hover:text-white'}`} />
      {!collapsed && (
        <span className={`min-w-0 flex-1 truncate font-sans text-[13px] leading-[1.3] ${active ? 'font-semibold text-white' : 'font-normal text-panel-dark-item group-hover:text-white'}`}>
          {item.name}
        </span>
      )}
      <Badge value={value} urgent={urgent} collapsed={collapsed} />
    </>
  );

  if (item.disabled) {
    return (
      <div title={`${item.name} (próximamente)`} aria-label={`${item.name}, próximamente`} className={`${rowClasses} cursor-not-allowed opacity-40`}>
        {content}
      </div>
    );
  }

  return (
    <Link to={item.path} onClick={onClick} title={item.name} aria-label={label} aria-current={active ? 'page' : undefined} className={rowClasses}>
      {content}
    </Link>
  );
}

function SectionHeader({ id, title, open, onToggle }: { id: string; title: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button" id={id} onClick={onToggle} aria-expanded={open}
      className="flex w-full items-center gap-1.5 px-[18px] py-2 font-montserrat text-[10.5px] font-bold uppercase leading-none tracking-[.12em] text-panel-dark-label transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-[-2px]"
    >
      <span className="flex-1 truncate text-left">{title}</span>
      <ChevronDown size={13} strokeWidth={2} className={`flex-none transition-transform duration-150 ${open ? '' : '-rotate-90'}`} />
    </button>
  );
}

export default function SidebarNav({
  sections, badges, collapsed, onNavigate,
}: {
  sections: NavSection[]; badges: NavBadges; collapsed: boolean; onNavigate: () => void;
}) {
  const { pathname } = useLocation();
  // Colapsado por sección — arranca todo plegado (pedido tras ver el
  // sidebar en vivo) y no persiste entre recargas, sólo dura la sesión de
  // navegación (el colapso del riel completo sí persiste, ver `useSidebarCollapse`).
  const [closedSections, setClosedSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(sections.map((s) => [s.title, true])),
  );
  const toggleSection = (title: string) => setClosedSections((prev) => ({ ...prev, [title]: !prev[title] }));

  return (
    <>
      {sections.map((section) => {
        const headingId = `nav-section-${section.title}`;
        const open = !closedSections[section.title];

        return (
          <div key={section.title} className="pt-3.5">
            {!collapsed && <SectionHeader id={headingId} title={section.title} open={open} onToggle={() => toggleSection(section.title)} />}
            {(collapsed || open) && (
              <ul aria-labelledby={collapsed ? undefined : headingId} aria-label={collapsed ? section.title : undefined}>
                {section.items.map((item) => (
                  <li key={item.path}>
                    <ItemRow
                      item={item}
                      active={isPathActive(item.path, pathname)}
                      collapsed={collapsed}
                      badgeValue={item.badgeKey ? badges[item.badgeKey] : undefined}
                      onClick={onNavigate}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </>
  );
}
