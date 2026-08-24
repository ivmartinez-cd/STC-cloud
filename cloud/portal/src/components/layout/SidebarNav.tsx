import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { isNavGroup, type NavEntry, type NavLeaf } from './navTree';

function isPathActive(path: string, pathname: string): boolean {
  return path === '/' ? pathname === '/' : pathname.startsWith(path);
}

function LeafRow({ leaf, active, isHovered, badge, indented, onClick }: {
  leaf: NavLeaf;
  active: boolean;
  isHovered: boolean;
  badge: number;
  indented: boolean;
  onClick: () => void;
}) {
  const Icon = leaf.icon;
  return (
    <Link
      to={leaf.path}
      onClick={onClick}
      className={`
        flex items-center group relative h-11 rounded-2xl transition-all duration-300
        ${active ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-white/[0.03]'}
      `}
    >
      {active && isHovered && (
        <div className="absolute inset-0 bg-brand/10 rounded-2xl border border-brand/10 shadow-[0_4px_12px_rgba(0,0,0,0.1)]" />
      )}

      <div className={`flex items-center gap-4 relative z-10 w-full justify-center md:justify-start ${indented && isHovered ? 'pl-4' : ''}`}>
        <div className={`
          relative flex items-center justify-center shrink-0 transition-all duration-300
          ${isHovered ? 'w-5 ml-2' : 'w-20'}
        `}>
          <Icon
            size={isHovered ? (indented ? 16 : 19) : 24}
            strokeWidth={active ? 2.5 : 2}
            className={active ? 'text-brand drop-shadow-[0_0_8px_rgba(247,148,29,0.4)]' : 'text-slate-500 group-hover:text-slate-300 transition-colors duration-300'}
          />
          {badge > 0 && (
            <span className="absolute -top-1.5 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-amber-500 text-white text-[9px] font-black leading-none">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </div>

        <span className={`
          text-[13px] font-bold whitespace-nowrap transition-all duration-500
          ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none w-0'}
          ${active ? 'text-white' : 'text-slate-400'}
        `}>
          {leaf.name}
        </span>

        {badge > 0 && isHovered && (
          <span className="text-[10px] font-black text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full">{badge}</span>
        )}
        {active && isHovered && <ChevronRight size={14} className="ml-auto mr-4 text-brand/50" />}
      </div>

      {active && (
        <div className={`
          absolute left-0 bg-brand rounded-r-full transition-all duration-500 shadow-[0_0_15px_rgba(247,148,29,0.4)]
          ${isHovered ? 'w-1.5 top-2.5 bottom-2.5' : 'w-2 top-3.5 bottom-3.5'}
        `} />
      )}
    </Link>
  );
}

export default function SidebarNav({
  entries, isHovered, pendingCount, onNavigate,
}: {
  entries: NavEntry[];
  isHovered: boolean;
  pendingCount: number;
  onNavigate: () => void;
}) {
  const { pathname } = useLocation();
  // Un grupo con la ruta activa arranca expandido; el resto colapsado por
  // defecto. `undefined` = "usar el default derivado de la ruta actual", así
  // que cambiar de página resincroniza automáticamente qué grupo se ve
  // expandido, salvo que el usuario ya haya tocado el acordeón a mano.
  const [expandedOverride, setExpandedOverride] = useState<Record<string, boolean>>({});

  useEffect(() => { setExpandedOverride({}); }, [pathname]);

  const badgeFor = (leaf: NavLeaf) => (leaf.badgeKey === 'pending' ? pendingCount : 0);

  return (
    <>
      {entries.map((entry) => {
        if (!isNavGroup(entry)) {
          return (
            <LeafRow
              key={entry.path}
              leaf={entry}
              active={isPathActive(entry.path, pathname)}
              isHovered={isHovered}
              badge={badgeFor(entry)}
              indented={false}
              onClick={onNavigate}
            />
          );
        }

        const groupActive = entry.children.some((c) => isPathActive(c.path, pathname));
        const expanded = expandedOverride[entry.name] ?? groupActive;
        const GroupIcon = entry.icon;

        return (
          <div key={entry.name}>
            <button
              type="button"
              onClick={() => setExpandedOverride((prev) => ({ ...prev, [entry.name]: !expanded }))}
              className={`
                flex items-center w-full h-11 rounded-2xl transition-all duration-300
                ${groupActive ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-white/[0.03]'}
              `}
            >
              <div className="flex items-center gap-4 relative z-10 w-full justify-center md:justify-start">
                <div className={`relative flex items-center justify-center shrink-0 transition-all duration-300 ${isHovered ? 'w-5 ml-2' : 'w-20'}`}>
                  <GroupIcon
                    size={isHovered ? 19 : 24}
                    strokeWidth={groupActive ? 2.5 : 2}
                    className={groupActive ? 'text-brand drop-shadow-[0_0_8px_rgba(247,148,29,0.4)]' : 'text-slate-500'}
                  />
                </div>
                <span className={`
                  flex-1 text-left text-[13px] font-bold whitespace-nowrap transition-all duration-500
                  ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none w-0'}
                  ${groupActive ? 'text-white' : 'text-slate-400'}
                `}>
                  {entry.name}
                </span>
                {isHovered && (
                  <ChevronDown size={14} className={`mr-4 text-slate-500 transition-transform duration-300 ${expanded ? 'rotate-0' : '-rotate-90'}`} />
                )}
              </div>
            </button>

            {isHovered && expanded && (
              <div className="mt-1 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                {entry.children.map((leaf) => (
                  <LeafRow
                    key={leaf.path}
                    leaf={leaf}
                    active={isPathActive(leaf.path, pathname)}
                    isHovered={isHovered}
                    badge={badgeFor(leaf)}
                    indented
                    onClick={onNavigate}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
