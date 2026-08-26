import { CheckCircle } from 'lucide-react';

interface Props {
  accentFrom: string;
  accentTo: string;
  accentGlow: string;
}

export default function FeedbackSuccessState({ accentFrom, accentTo, accentGlow }: Props) {
  return (
    <div className="px-7 pb-10 flex flex-col items-center gap-4 animate-fade-in">
      <div className="relative">
        <div className={`absolute inset-0 rounded-full blur-2xl opacity-60 bg-gradient-to-br ${accentFrom} ${accentTo}`} />
        <div className={`relative w-20 h-20 rounded-full bg-gradient-to-br ${accentFrom} ${accentTo} flex items-center justify-center shadow-xl ${accentGlow}`}>
          <CheckCircle size={40} className="text-white animate-scale-in" strokeWidth={2.5} />
        </div>
      </div>
      <p className="text-white/70 text-sm text-center max-w-[280px] leading-relaxed">
        Tu reporte fue registrado. El equipo de soporte lo revisará pronto.
      </p>
      <div className="w-full bg-white/5 rounded-2xl h-1 overflow-hidden mt-2">
        <div className={`h-full bg-gradient-to-r ${accentFrom} ${accentTo} animate-progress-bar`} />
      </div>
    </div>
  );
}
