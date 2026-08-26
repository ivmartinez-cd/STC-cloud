import { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import FeedbackTypeSelector, { type FeedbackType } from './FeedbackTypeSelector';
import FeedbackSuccessState from './FeedbackSuccessState';
import FeedbackImageDropzone from './FeedbackImageDropzone';

interface Props {
  onClose: () => void;
}

type Stage = 'form' | 'submitting' | 'success';

export default function FeedbackModal({ onClose }: Props) {
  const [type, setType]               = useState<FeedbackType>('bug');
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl]       = useState('');
  const [stage, setStage]             = useState<Stage>('form');
  const [error, setError]             = useState<string | null>(null);
  const textareaRef                   = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [description]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async () => {
    setError(null);
    if (title.trim().length < 3) { setError('El título debe tener al menos 3 caracteres.'); return; }
    if (description.trim().length < 10) { setError('La descripción debe tener al menos 10 caracteres.'); return; }

    setStage('submitting');
    try {
      await api.post('/feedback', {
        type,
        title: title.trim(),
        description: description.trim(),
        ...(imageUrl.trim() ? { image_url: imageUrl.trim() } : {}),
      });
      setStage('success');
      setTimeout(onClose, 2200);
    } catch (err) {
      setStage('form');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setError((err as any)?.response?.data?.message || 'Error al enviar. Intenta de nuevo.');
    }
  };

  const isBug = type === 'bug';
  const accentFrom  = isBug ? 'from-rose-500'   : 'from-brand-charcoal';
  const accentTo    = isBug ? 'to-orange-500'   : 'to-brand-gray';
  const accentRing  = isBug ? 'ring-rose-400/40' : 'ring-brand-gray/40';
  const accentGlow  = isBug ? 'shadow-rose-500/20' : 'shadow-brand-gray/20';

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: 'rgba(15,23,42,0.72)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop blur layer */}
      <div className="absolute inset-0 backdrop-blur-xl" />

      {/* Modal */}
      <div
        className="relative w-full sm:max-w-lg animate-feedback-in"
        style={{ animationFillMode: 'both' }}
      >
        {/* Glassmorphism card */}
        <div className={`
          relative overflow-hidden
          bg-white/10 backdrop-blur-2xl
          border border-white/20
          rounded-t-[32px] sm:rounded-[32px]
          shadow-[0_32px_80px_rgba(0,0,0,0.5)]
          ring-1 ${accentRing}
        `}>

          {/* Ambient glow behind card */}
          <div className={`absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-40 rounded-full blur-3xl opacity-30 bg-gradient-to-r ${accentFrom} ${accentTo} pointer-events-none`} />

          {/* ── Header ── */}
          <div className={`relative px-7 pt-7 pb-5 flex items-start justify-between`}>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40 mb-1">
                STC Cloud
              </p>
              <h2 className="text-xl font-extrabold text-white leading-tight">
                {stage === 'success'
                  ? '¡Gracias por tu reporte!'
                  : 'Reportar un Problema o Mejora'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-2xl text-white/40 hover:text-white hover:bg-white/10 transition-all duration-200 -mt-1"
            >
              <X size={18} />
            </button>
          </div>

          {/* ── Success State ── */}
          {stage === 'success' && (
            <FeedbackSuccessState accentFrom={accentFrom} accentTo={accentTo} accentGlow={accentGlow} />
          )}

          {/* ── Form State ── */}
          {stage !== 'success' && (
            <div className="px-7 pb-7 space-y-5">

              {/* Type Selector */}
              <FeedbackTypeSelector value={type} onChange={setType} />

              {/* Title */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 block mb-2">
                  Título
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={isBug ? 'Ej: El dashboard no carga al filtrar por cliente' : 'Ej: Agregar exportación a Excel en reportes'}
                  maxLength={200}
                  className={`
                    w-full bg-white/5 border border-white/10 rounded-2xl
                    px-4 py-3 text-sm text-white placeholder-white/25
                    focus:outline-none focus:border-white/30 focus:bg-white/10
                    transition-all duration-200
                  `}
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 block mb-2">
                  Descripción
                </label>
                <textarea
                  ref={textareaRef}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={isBug
                    ? 'Describe los pasos para reproducir el problema, qué esperabas que pasara y qué pasó realmente...'
                    : 'Explica tu idea: qué problema resuelve, cómo debería funcionar...'}
                  maxLength={5000}
                  rows={3}
                  className={`
                    w-full bg-white/5 border border-white/10 rounded-2xl
                    px-4 py-3 text-sm text-white placeholder-white/25 resize-none overflow-hidden
                    focus:outline-none focus:border-white/30 focus:bg-white/10
                    transition-all duration-200
                  `}
                />
              </div>

              {/* Image URL / Drag Drop */}
              <FeedbackImageDropzone imageUrl={imageUrl} onChange={setImageUrl} />

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs animate-fade-in">
                  <XCircle size={14} className="shrink-0" />
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={stage === 'submitting'}
                className={`
                  w-full relative overflow-hidden flex items-center justify-center gap-2.5
                  py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest text-white
                  transition-all duration-300 group
                  bg-gradient-to-r ${accentFrom} ${accentTo}
                  shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]
                  disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100
                `}
              >
                <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors duration-300" />
                {stage === 'submitting' ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send size={16} strokeWidth={2.5} />
                    {isBug ? 'Reportar Problema' : 'Enviar Sugerencia'}
                  </>
                )}
              </button>

            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes feedback-in {
          from { opacity: 0; transform: translateY(32px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes scale-in {
          from { transform: scale(0.4); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        @keyframes progress-bar {
          from { width: 0%; }
          to   { width: 100%; }
        }
        .animate-feedback-in   { animation: feedback-in  0.35s cubic-bezier(0.22,1,0.36,1); }
        .animate-scale-in      { animation: scale-in     0.4s cubic-bezier(0.22,1,0.36,1) 0.1s both; }
        .animate-progress-bar  { animation: progress-bar 2.2s linear forwards; }
      `}</style>
    </div>
  );
}
