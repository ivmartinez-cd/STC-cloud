import type { ElementType } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const COLOR_VARIANTS = {
  amber: { border: 'border-amber-100 hover:border-amber-200', bg: 'bg-amber-50/40 hover:bg-amber-50', iconBg: 'bg-amber-100 text-amber-600', chevron: 'text-amber-400' },
  rose: { border: 'border-rose-100 hover:border-rose-200', bg: 'bg-rose-50/40 hover:bg-rose-50', iconBg: 'bg-rose-100 text-rose-600', chevron: 'text-rose-400' },
} as const;

/** Tile accionable compacto (deep-link + contador) para alertas operativas del
 * Dashboard — mismo criterio que los banners que reemplaza: sólo se muestra
 * si hay algo pendiente (lo decide el caller), nunca un panel más para mirar
 * todos los días. */
export default function ActionTileChip({
  to, icon: Icon, count, label, color,
}: {
  to: string;
  icon: ElementType;
  count: number;
  label: string;
  color: keyof typeof COLOR_VARIANTS;
}) {
  const variant = COLOR_VARIANTS[color];
  return (
    <Link
      to={to}
      className={`group flex items-center gap-2.5 px-3 py-2 rounded-2xl border transition-all ${variant.border} ${variant.bg}`}
    >
      <div className={`p-1.5 rounded-xl shrink-0 ${variant.iconBg}`}>
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <span className="text-[10px] font-black text-[#1a2333] tracking-tight">{count}</span>
        <span className="text-[10px] font-bold text-slate-600 ml-1.5">{label}</span>
      </div>
      <ChevronRight size={13} className={`shrink-0 group-hover:translate-x-0.5 transition-transform ${variant.chevron}`} />
    </Link>
  );
}
