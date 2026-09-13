import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Code2, Eye } from 'lucide-react';
import EwsBodyView from './EwsBodyView';
import {
  bodyKind, charsetOf, contentTypeOf, decodeBase64, decodeText, formatBytes, statusTone,
  type EwsProxyResponse,
} from '../../lib/ewsResponse';

const STATUS_CLASS = {
  ok: 'text-severity-ok', redirect: 'text-ink-400',
  client: 'text-severity-warning', server: 'text-severity-critical',
} as const;

const META = 'font-mono text-[11.5px] text-ink-400';

/** Un solo pase por los bytes por respuesta: el cuerpo puede llegar hasta 2 MB y el decode es O(n). */
function useDecodedBody(result: EwsProxyResponse) {
  return useMemo(() => {
    const contentType = contentTypeOf(result.headers);
    const bytes = decodeBase64(result.body_base64);
    const kind = bodyKind(contentType, bytes);
    const binary = kind === 'image' || kind === 'binary';
    return {
      contentType, kind, size: bytes.length,
      text: binary ? '' : decodeText(bytes, charsetOf(result.headers)),
      // El `data:` sólo se arma para lo que hay que mostrar/bajar como bytes: duplicar 2 MB de string por gusto no.
      dataUrl: binary ? `data:${contentType || 'application/octet-stream'};base64,${result.body_base64}` : '',
    };
  }, [result]);
}

const SourceToggle = ({ showSource, onToggle }: { showSource: boolean; onToggle: () => void }) => (
  <button type="button" onClick={onToggle}
    className="flex items-center gap-1.5 rounded-[3px] border border-line-300 bg-white px-2.5 py-1 font-montserrat text-[9px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors hover:border-line-hover">
    {showSource ? <><Eye size={12} /> Ver renderizado</> : <><Code2 size={12} /> Ver código</>}
  </button>
);

interface MetaProps {
  path: string;
  status: number;
  contentType: string;
  size: number;
  truncated: boolean;
  toggle: ReactNode;
}

const MetaBar = ({ path, status, contentType, size, truncated, toggle }: MetaProps) => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-150 bg-surface-table-head px-5 py-2">
    <span className={`font-mono text-[12px] font-semibold ${STATUS_CLASS[statusTone(status)]}`}>{status}</span>
    <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] text-ink-700">GET {path}</span>
    <span className={META}>{contentType || 'sin content-type'}</span>
    <span className={META}>{formatBytes(size)}</span>
    {truncated && (
      <span className="flex items-center gap-1 font-sans text-[11.5px] text-severity-warning">
        <AlertTriangle size={12} /> Cortado en 2 MB
      </span>
    )}
    {toggle}
  </div>
);

/**
 * Resultado de una consulta puntual a la EWS. La página llega como bytes en
 * Base64 y se muestra según lo que haya declarado el firmware: renderizada en
 * un iframe aislado (HTML), como texto (JSON/XML de las rutas de datos),
 * como imagen, o para descargar si es binario.
 */
export default function EwsResultView({ result, path }: { result: EwsProxyResponse; path: string }) {
  const body = useDecodedBody(result);
  const [showSource, setShowSource] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MetaBar
        path={path} status={result.status} contentType={body.contentType} size={body.size} truncated={result.truncated}
        toggle={body.kind === 'html' ? <SourceToggle showSource={showSource} onToggle={() => setShowSource((v) => !v)} /> : null}
      />
      <EwsBodyView kind={body.kind} showSource={showSource} text={body.text} dataUrl={body.dataUrl} path={path} />
    </div>
  );
}
