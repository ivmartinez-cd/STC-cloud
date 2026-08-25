import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, Image as ImageIcon } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import type { DBFeedback } from '../types/settings';

export default function FeedbackCard() {
  const [feedbacks, setFeedbacks] = useState<DBFeedback[]>([]);
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(false);
  const [expandedFeedbackId, setExpandedFeedbackId] = useState<string | null>(null);

  const fetchFeedbacks = useCallback(async () => {
    setLoadingFeedbacks(true);
    try {
      const data = await api.get<DBFeedback[]>('/feedback');
      setFeedbacks(data);
    } catch (err: unknown) {
      console.error('Error al obtener feedback', err);
    } finally {
      setLoadingFeedbacks(false);
    }
  }, []);

  useEffect(() => { void fetchFeedbacks(); }, [fetchFeedbacks]);

  const updateFeedbackStatus = async (id: string, status: string) => {
    try {
      await api.put(`/feedback/${id}/status`, { status });
      fetchFeedbacks();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error || (err as Error).message || 'Error al actualizar estado de feedback');
    }
  };

  return (
    <div className="cd-panel p-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-brand/10 text-brand rounded-2xl">
          <MessageSquare size={24} />
        </div>
        <div>
          <h3 className="text-lg font-extrabold text-[#1a2333]">Sugerencias y Reportes</h3>
          <p className="text-xs text-slate-500 font-medium">Bugs y mejoras reportados por los usuarios.</p>
        </div>
      </div>

      {loadingFeedbacks ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
        </div>
      ) : feedbacks.length === 0 ? (
        <div className="p-6 text-center text-slate-500 text-sm font-medium border border-dashed border-slate-200 rounded-3xl">
          No hay reportes de feedback todavía.
        </div>
      ) : (
        <div className="space-y-4">
          {feedbacks.map(fb => {
            const isExpanded = expandedFeedbackId === fb.id;
            return (
              <div key={fb.id} className="bg-white border border-slate-100 rounded-3xl overflow-hidden transition-all hover:shadow-md">
                <div className="p-5 flex items-center justify-between cursor-pointer" onClick={() => setExpandedFeedbackId(isExpanded ? null : fb.id)}>
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
                        {new Date(fb.created_at).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <select
                      value={fb.status}
                      onClick={e => e.stopPropagation()}
                      onChange={(e) => updateFeedbackStatus(fb.id, e.target.value)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl border outline-none cursor-pointer transition-colors ${
                        fb.status === 'open' ? 'bg-amber-50 text-amber-700 border-amber-200 focus:border-amber-400' :
                        fb.status === 'in_progress' ? 'bg-brand-gray/10 text-brand-gray border-brand-gray/30 focus:border-brand-gray' :
                        'bg-emerald-50 text-emerald-700 border-emerald-200 focus:border-emerald-400'
                      }`}
                    >
                      <option value="open">Abierto</option>
                      <option value="in_progress">En Progreso</option>
                      <option value="closed">Cerrado</option>
                    </select>

                    <div className="text-slate-400 hover:text-slate-600">
                      {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5 pt-2 border-t border-slate-50 bg-slate-50/30 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">
                      {fb.description}
                    </div>
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
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
