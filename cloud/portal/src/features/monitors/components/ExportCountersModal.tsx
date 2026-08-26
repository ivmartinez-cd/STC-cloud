import { X } from 'lucide-react';

interface Props {
  onExport: (discriminate: boolean) => void;
  onClose: () => void;
}

export default function ExportCountersModal({ onExport, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(20,20,20,.55)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-[5px] bg-white p-6" style={{ boxShadow: '0 20px 60px rgba(0,0,0,.25)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-5">
          <h3 className="font-montserrat text-[15px] font-extrabold text-ink-900">Exportar contadores</h3>
          <p className="mt-1 font-sans text-[12.5px] text-ink-300">¿Discriminar mono / color?</p>
        </div>
        <div className="mb-4 flex flex-col gap-2.5">
          <button onClick={() => onExport(true)} className="w-full rounded-[3px] bg-brand py-3 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe">Sí, discriminar</button>
          <button onClick={() => onExport(false)} className="w-full rounded-[3px] border border-line-300 bg-white py-3 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover">No</button>
        </div>
        <button onClick={onClose} className="flex w-full items-center justify-center gap-2 rounded-[3px] py-2 font-montserrat text-[10.5px] font-semibold uppercase tracking-[.08em] text-ink-300 transition-colors duration-150 ease-in-out hover:text-ink-600">
          <X size={13} /> Cancelar
        </button>
      </div>
    </div>
  );
}
