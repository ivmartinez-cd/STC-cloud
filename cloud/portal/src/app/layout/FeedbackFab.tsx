import { MessageSquarePlus } from 'lucide-react';

/** Botón flotante "Dar Feedback": se expande al hover, abre FeedbackModal. */
const FeedbackFab = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} title="Reportar problema o sugerir mejora"
    className="fixed bottom-8 right-8 z-[90] group flex items-center gap-0 overflow-hidden h-12 w-12 hover:w-48
      bg-gradient-to-r from-brand-charcoal to-brand text-white rounded-full shadow-[0_8px_30px_rgba(35,35,35,0.35)]
      hover:shadow-[0_12px_40px_rgba(247,148,29,0.45)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]">
    <span className="flex items-center justify-center w-12 h-12 shrink-0">
      <MessageSquarePlus size={18} strokeWidth={2.5} className="transition-transform duration-300 group-hover:rotate-12" />
    </span>
    <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap max-w-0 group-hover:max-w-[120px] opacity-0 group-hover:opacity-100
      overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] pr-0 group-hover:pr-4">
      Dar Feedback
    </span>
  </button>
);

export default FeedbackFab;
