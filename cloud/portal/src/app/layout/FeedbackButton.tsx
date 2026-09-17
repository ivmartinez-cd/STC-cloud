import { MessageSquarePlus } from 'lucide-react';

/** Acceso a feedback, en la cabecera al lado del buscador (issue #25429).
 *
 * Antes era un FAB `fixed bottom-8 right-8`: en pantallas donde la columna de
 * contenido (max-w 1400) llega al borde derecho, esa esquina es justo donde
 * cada pantalla apoya sus acciones primarias — "Guardar cambios" de
 * Configuración y Segmentos quedaban tapados y no se podían clickear. En la
 * cabecera no compite con nada y no le come ancho ni alto a las pantallas,
 * que están dimensionadas al viewport (ver `useFitRows`). */
const FeedbackButton = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button" onClick={onClick} title="Reportar problema o sugerir mejora"
    className="group flex h-10 items-center gap-2 rounded-xl border border-transparent bg-slate-100/50 px-3.5 text-slate-500
      transition-all hover:border-brand/30 hover:bg-white hover:text-brand"
  >
    <MessageSquarePlus size={16} strokeWidth={2.5} className="transition-transform duration-300 group-hover:rotate-12" />
    <span className="hidden font-montserrat text-[10px] font-black uppercase tracking-widest lg:inline">Feedback</span>
  </button>
);

export default FeedbackButton;
