import { useRef, useCallback, useState } from 'react';
import { ImagePlus, XCircle } from 'lucide-react';

interface Props {
  imageUrl: string;
  onChange: (url: string) => void;
}

export default function FeedbackImageDropzone({ imageUrl, onChange }: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (url.startsWith('http')) onChange(url);
  }, [onChange]);

  return (
    <div>
      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 block mb-2">
        Captura de pantalla <span className="normal-case tracking-normal font-medium opacity-60">(opcional)</span>
      </label>
      <div
        ref={dropRef}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`
          relative rounded-2xl border-2 border-dashed p-4 transition-all duration-200 cursor-default
          ${isDragOver
            ? 'border-white/50 bg-white/10 scale-[1.01]'
            : 'border-white/10 hover:border-white/20 bg-white/5'}
        `}
      >
        {imageUrl ? (
          <div className="flex items-center gap-3">
            <img
              src={imageUrl}
              alt="preview"
              className="w-12 h-12 rounded-xl object-cover border border-white/20"
              onError={() => onChange('')}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/70 truncate">{imageUrl}</p>
              <p className="text-[10px] text-white/40 mt-0.5">Imagen adjunta</p>
            </div>
            <button
              onClick={() => onChange('')}
              className="p-1.5 rounded-xl hover:bg-white/10 text-white/30 hover:text-white/70 transition-all"
            >
              <XCircle size={16} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-2">
            <ImagePlus size={20} className="text-white/25" />
            <p className="text-[11px] text-white/30 text-center">
              Arrastra una imagen aquí o pega una URL
            </p>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full bg-transparent border-0 text-xs text-white/50 placeholder-white/20 text-center focus:outline-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}
