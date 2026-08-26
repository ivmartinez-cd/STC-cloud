import { Bug, Sparkles } from 'lucide-react';

export type FeedbackType = 'bug' | 'enhancement';

interface Props {
  value: FeedbackType;
  onChange: (type: FeedbackType) => void;
}

export default function FeedbackTypeSelector({ value, onChange }: Props) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-2.5">
        Tipo de reporte
      </p>
      <div className="grid grid-cols-2 gap-3">
        {([ ['bug', 'Problema', Bug, 'from-rose-500 to-orange-500', 'ring-rose-400/50'],
             ['enhancement', 'Mejora', Sparkles, 'from-brand-charcoal to-brand-gray', 'ring-brand-gray/50'],
        ] as const).map(([val, label, Icon, grad, ring]) => (
          <button
            key={val}
            onClick={() => onChange(val)}
            className={`
              relative flex flex-col items-center gap-2.5 py-4 px-3 rounded-2xl
              border transition-all duration-300 group overflow-hidden
              ${value === val
                ? `border-white/30 bg-gradient-to-br ${grad} shadow-lg ring-2 ${ring}`
                : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'}
            `}
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${grad} opacity-0 transition-opacity duration-300 ${value === val ? 'opacity-20' : 'group-hover:opacity-10'}`} />
            <Icon
              size={22}
              className={`transition-all duration-300 ${value === val ? 'text-white scale-110' : 'text-white/40 group-hover:text-white/70'}`}
              strokeWidth={2}
            />
            <span className={`text-[11px] font-black uppercase tracking-widest transition-colors duration-300 ${value === val ? 'text-white' : 'text-white/40 group-hover:text-white/70'}`}>
              {label}
            </span>
            {val === 'bug' && <span className="text-[18px] leading-none">🐞</span>}
            {val === 'enhancement' && <span className="text-[18px] leading-none">✨</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
