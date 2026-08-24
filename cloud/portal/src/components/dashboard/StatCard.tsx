import type { ElementType } from 'react';
import { ArrowUpRight } from 'lucide-react';

// Tailwind necesita ver las clases completas de forma literal para generarlas —
// `bg-${color}-50` como template string no lo detecta el scanner. Por eso el mapa.
const STAT_COLOR_VARIANTS = {
  charcoal: { glow: 'bg-brand-charcoal/5 group-hover:bg-brand-charcoal/10', iconBg: 'bg-brand-charcoal/10 text-brand-charcoal' },
  emerald: { glow: 'bg-emerald-500/5 group-hover:bg-emerald-500/10', iconBg: 'bg-emerald-50 text-emerald-600' },
  gray: { glow: 'bg-brand-gray/5 group-hover:bg-brand-gray/10', iconBg: 'bg-brand-gray/10 text-brand-gray' },
  orange: { glow: 'bg-brand/5 group-hover:bg-brand/10', iconBg: 'bg-brand/10 text-brand' },
} as const;

export default function StatCard({
  title, value, subtitle, icon: Icon, color, trend
}: {
  title: string; value: string | number; subtitle?: string;
  icon: ElementType; color: keyof typeof STAT_COLOR_VARIANTS; trend?: string;
}) {
  const variant = STAT_COLOR_VARIANTS[color];
  return (
    <div className="cd-panel p-6 relative overflow-hidden group hover:shadow-2xl hover:shadow-brand/5 transition-all duration-500">
      <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full blur-2xl transition-colors duration-500 ${variant.glow}`} />
      <div className="flex justify-between items-start relative z-10">
        <div className={`p-3 rounded-2xl ${variant.iconBg}`}>
          <Icon size={24} />
        </div>
        {trend && (
          <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full uppercase tracking-tighter">
            <ArrowUpRight size={10} /> {trend}
          </span>
        )}
      </div>
      <div className="mt-6 relative z-10">
        <div className="text-3xl font-black text-[#1a2333] tracking-tighter leading-none">{value}</div>
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">{title}</div>
        {subtitle && <div className="text-[10px] font-bold text-slate-500 mt-1">{subtitle}</div>}
      </div>
    </div>
  );
}
