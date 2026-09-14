import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, Image as ImageIcon } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import { useFitRows } from '../../../shared/hooks/useFitRows';
import { useClientPagination } from '../../../shared/hooks/useClientPagination';
import HifiPagination from '../../../shared/components/HifiPagination';
import type { DBFeedback } from '../types/settings';
import { APP_LOCALE } from '../../../shared/lib/formatters';

function useFeedbacks() {
  const [feedbacks, setFeedbacks] = useState<DBFeedback[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFeedbacks = useCallback(async () => {
    setLoading(true);
    try {
      setFeedbacks(await api.get<DBFeedback[]>('/feedback'));
    } catch (err: unknown) {
      console.error('Error al obtener feedback', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchFeedbacks(); }, [fetchFeedbacks]);
  return { feedbacks, loading, fetchFeedbacks };
}

async function updateFeedbackStatus(id: string, status: string, refetch: () => void) {
  try {
    await api.put(`/feedback/${id}/status`, { status });
    refetch();
  } catch (err: unknown) {
    alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error || (err as Error).message || 'Error al actualizar estado de feedback');
  }
}

const STATUS_CLS: Record<string, string> = {
  open: 'bg-amber-50 text-amber-700 border-amber-200 focus:border-amber-400',
  in_progress: 'bg-brand-gray/10 text-brand-gray border-brand-gray/30 focus:border-brand-gray',
};

function StatusSelect({ fb, onChange }: { fb: DBFeedback; onChange: (status: string) => void }) {
  const cls = STATUS_CLS[fb.status] ?? 'bg-emerald-50 text-emerald-700 border-emerald-200 focus:border-emerald-400';
  return (
    <select
      value={fb.status} onClick={(e) => e.stopPropagation()} onChange={(e) => onChange(e.target.value)}
      className={`text-xs font-bold px-3 py-1.5 rounded-xl border outline-none cursor-pointer transition-colors ${cls}`}
    >
      <option value="open">Abierto</option>
      <option value="in_progress">En Progreso</option>
      <option value="closed">Cerrado</option>
    </select>
  );
}

function FeedbackSummary({ fb }: { fb: DBFeedback }) {
  return (
    <div className="flex items-center gap-4">
      <div className={`p-2 rounded-xl text-white ${fb.type === 'bug' ? 'bg-rose-500 shadow-rose-500/20' : 'bg-brand-gray shadow-brand-gray/20'} shadow-lg`}>
        <MessageSquare size={16} />
      </div>
      <div>
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-slate-800">{fb.title}</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Por {fb.username}</span>
        </div>
        <div className="text-xs font-medium text-slate-500 mt-0.5">
          {new Date(fb.created_at).toLocaleString(APP_LOCALE, { dateStyle: 'medium', timeStyle: 'short' })}
        </div>
      </div>
    </div>
  );
}

function FeedbackDetail({ fb }: { fb: DBFeedback }) {
  return (
    <div className="px-5 pb-5 pt-2 border-t border-slate-50 bg-slate-50/30 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">{fb.description}</div>
      {fb.image_url && (
        <div className="mt-4 border border-slate-200 rounded-2xl p-2 bg-white inline-block">
          <div className="flex items-center gap-2 mb-2 px-1">
            <ImageIcon size={14} className="text-slate-400" />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Captura adjunta</span>
          </div>
          <img src={fb.image_url} alt="Captura de pantalla" className="max-h-64 rounded-xl shadow-sm border border-slate-100" />
        </div>
      )}
    </div>
  );
}

interface RowProps { fb: DBFeedback; expanded: boolean; onToggle: () => void; onStatus: (status: string) => void }

/** El `pb-3` va DENTRO del elemento medido (`data-fit-row`) porque `useFitRows`
 * mide `offsetHeight`, que no incluye márgenes. La fila expandida no se
 * marca: mediría el detalle y achicaría la página al colapsar. */
function FeedbackRow({ fb, expanded, onToggle, onStatus }: RowProps) {
  return (
    <div data-fit-row={expanded ? undefined : ''} className="pb-3">
      <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden transition-all hover:shadow-md">
        <div className="p-5 flex items-center justify-between cursor-pointer" onClick={onToggle}>
          <FeedbackSummary fb={fb} />
          <div className="flex items-center gap-6">
            <StatusSelect fb={fb} onChange={onStatus} />
            <div className="text-slate-400 hover:text-slate-600">{expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>
          </div>
        </div>
        {expanded && <FeedbackDetail fb={fb} />}
      </div>
    </div>
  );
}

function CardHeader() {
  return (
    <div className="flex items-center gap-4 mb-5">
      <div className="p-3 bg-brand/10 text-brand rounded-2xl"><MessageSquare size={24} /></div>
      <div>
        <h3 className="text-lg font-extrabold text-[#1a2333]">Sugerencias y Reportes</h3>
        <p className="text-xs text-slate-500 font-medium">Bugs y mejoras reportados por los usuarios.</p>
      </div>
    </div>
  );
}

function EmptyOrLoading({ loading }: { loading: boolean }) {
  if (loading) return <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" /></div>;
  return <div className="p-6 text-center text-slate-500 text-sm font-medium border border-dashed border-slate-200 rounded-3xl">No hay reportes de feedback todavía.</div>;
}

/** Sugerencias y reportes (admin). 27/08/2026 ("sin scroll"): la lista
 * entera de `/feedback` se pagina en memoria con las filas colapsadas que
 * caben; al expandir una, se muestra SÓLO esa (con scroll interno si el
 * detalle es largo) hasta colapsarla — más simple que medir alturas mixtas. */
export default function FeedbackCard() {
  const { feedbacks, loading, fetchFeedbacks } = useFeedbacks();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fit = useFitRows({ estimate: 92 });
  const pager = useClientPagination(feedbacks, fit.rows);
  const expanded = feedbacks.find((fb) => fb.id === expandedId) ?? null;
  const shown = expanded ? [expanded] : pager.visible;

  return (
    <div className="cd-panel flex min-h-0 flex-1 flex-col p-8">
      <CardHeader />
      <div ref={fit.ref} className={`min-h-0 flex-1 ${expanded ? 'overflow-y-auto' : 'overflow-hidden'}`}>
        {loading || feedbacks.length === 0 ? <EmptyOrLoading loading={loading} /> : shown.map((fb) => (
          <FeedbackRow
            key={fb.id} fb={fb} expanded={fb.id === expandedId}
            onToggle={() => setExpandedId(fb.id === expandedId ? null : fb.id)}
            onStatus={(status) => void updateFeedbackStatus(fb.id, status, fetchFeedbacks)}
          />
        ))}
      </div>
      {!expanded && <HifiPagination page={pager.page} totalPages={pager.totalPages} total={pager.total} pageSize={pager.pageSize} itemLabel="reportes" onPageChange={pager.setPage} />}
    </div>
  );
}
