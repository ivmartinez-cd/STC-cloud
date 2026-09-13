import { Download, FileQuestion } from 'lucide-react';
import { downloadNameFor, sandboxedSrcDoc, type EwsBodyKind } from '../../lib/ewsResponse';

const PANE = 'min-h-0 flex-1 overflow-auto bg-white';

/**
 * `sandbox=""` (vacío, ni `allow-scripts` ni `allow-same-origin`): la página es
 * contenido de la LAN de un cliente, no de confianza. Sin `allow-same-origin` el
 * iframe queda en un origen opaco y no puede tocar las cookies ni el DOM del
 * portal; la CSP que inyecta `sandboxedSrcDoc` corta además cualquier pedido de
 * subrecursos. Por eso se ve sin estilos ni imágenes: el proxy trae UNA página.
 */
const RenderedView = ({ html }: { html: string }) => (
  <iframe title="Página de la web embebida del equipo" sandbox="" srcDoc={sandboxedSrcDoc(html)} className={`${PANE} w-full border-0`} />
);

const SourceView = ({ text }: { text: string }) => (
  <pre className={`${PANE} whitespace-pre-wrap break-all px-5 py-3.5 font-mono text-[12px] leading-[1.55] text-ink-700`}>{text}</pre>
);

const ImageView = ({ dataUrl }: { dataUrl: string }) => (
  <div className={`${PANE} flex items-center justify-center p-5`}>
    <img src={dataUrl} alt="Contenido devuelto por la web embebida del equipo" className="max-h-full max-w-full object-contain" />
  </div>
);

const BinaryView = ({ dataUrl, name }: { dataUrl: string; name: string }) => (
  <div className={`${PANE} flex flex-col items-center justify-center gap-3 p-5 text-center`}>
    <FileQuestion size={28} className="text-ink-300" />
    <p className="font-sans text-[12.5px] text-ink-400">El equipo devolvió contenido binario: no se puede mostrar en pantalla.</p>
    <a href={dataUrl} download={name}
      className="flex items-center gap-2 rounded-[3px] bg-brand px-3.5 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-white hover:bg-brand-severe">
      <Download size={13} /> Descargar {name}
    </a>
  </div>
);

interface Props {
  kind: EwsBodyKind;
  showSource: boolean;
  text: string;
  dataUrl: string;
  path: string;
}

export default function EwsBodyView({ kind, showSource, text, dataUrl, path }: Props) {
  if (kind === 'binary') return <BinaryView dataUrl={dataUrl} name={downloadNameFor(path)} />;
  if (kind === 'image') return <ImageView dataUrl={dataUrl} />;
  if (kind === 'html' && !showSource) return <RenderedView html={text} />;
  return <SourceView text={text} />;
}
