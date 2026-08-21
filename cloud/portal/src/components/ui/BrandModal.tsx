import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface BrandModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Ancho en px (420 para confirmaciones, 520–640 para detalle). */
  widthPx?: number;
  error?: string | null;
}

/**
 * Chrome de modal de Canal Directo (portado de helpdesk-manager `BrandModal`):
 * overlay oscuro, card con radio 16 px, título Montserrat 800, botón ✕, focus trap, Escape y aria-modal.
 * Los hijos sólo aportan cuerpo y footer.
 */
export function BrandModal({ isOpen, onClose, title, children, widthPx = 480, error }: BrandModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActive = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (isOpen) {
      previousActive.current = document.activeElement as HTMLElement | null;
      const timer = setTimeout(() => {
        const root = modalRef.current;
        if (!root) return;
        const focusable = root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        (focusable[0] ?? root).focus();
      }, 60);
      return () => clearTimeout(timer);
    }
    previousActive.current?.focus();
    return undefined;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && modalRef.current) {
        const f = Array.from(modalRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(el => !el.hasAttribute('disabled'));
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-overlay-in" style={{ background: 'rgba(20,20,20,.55)' }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ width: widthPx, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}
        className="flex max-h-[90vh] w-full max-w-[92vw] flex-col overflow-hidden rounded-[16px] bg-white focus:outline-none animate-modal-in"
      >
        <div className="flex items-center justify-between px-[30px] pt-7 pb-2">
          <h2 id={titleId} className="text-[20px] font-extrabold tracking-[.01em] text-[#1a2333]" style={{ fontFamily: 'Montserrat, Inter, sans-serif' }}>
            {title}
          </h2>
          <button onClick={onClose} aria-label="Cerrar" className="cursor-pointer rounded-[8px] p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-[30px] pb-[30px] pt-3">
          {error && (
            <div className="mb-5 flex items-center gap-3 rounded-[10px] border border-rose-200 bg-rose-50 p-3 text-rose-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p className="text-xs font-semibold leading-tight">{error}</p>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

export default BrandModal;
