import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ShieldOff, RefreshCw, Key, Settings, Cpu, Clock, Activity, Search, Loader2, Server } from 'lucide-react';
import { Agent, isAgentOffline } from '../../types/agents';
import { formatRelativeTime } from '../../lib/formatters';

interface Props {
  agents: Agent[];
  loading: boolean;
  searchTerm: string;
  onSearchChange: (v: string) => void;
  now: number;
  regenLoading: string | null;
  revoking: string | null;
  onConfig: (agent: Agent) => void;
  onRegen: (agent: Agent) => void;
  onRevoke: (agent: Agent) => void;
}

export default function AgentTable({
  agents, loading, searchTerm, onSearchChange, now,
  regenLoading, revoking, onConfig, onRegen, onRevoke,
}: Props) {
  const filteredAgents = useMemo(() => agents.filter(a =>
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.hardware_id?.toLowerCase() ?? '').includes(searchTerm.toLowerCase()) ||
    (a.client_name?.toLowerCase() ?? '').includes(searchTerm.toLowerCase())
  ), [agents, searchTerm]);

  return (
    <div className="cd-panel overflow-hidden border-none shadow-xl shadow-blue-900/5">
      <header className="px-10 py-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-brand rounded-2xl">
            <Cpu size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black text-[#1a2333] tracking-tight">Nodos Registrados</h3>
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Supervisión en tiempo real de agentes activos</p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-1 max-w-md">
          <div className="relative flex-1 group">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-brand transition-colors" />
            <input
              type="text"
              placeholder="Buscar nodo..."
              className="cd-input w-full !pl-12 !py-3 text-sm"
              value={searchTerm}
              onChange={e => onSearchChange(e.target.value)}
            />
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 animate-pulse">
          <Loader2 size={48} className="animate-spin text-brand mb-4" />
          <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">Escaneando infraestructura...</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="cd-table">
            <thead>
              <tr>
                <th>Identificación del Nodo</th>
                <th>Cliente</th>
                <th>Hardware ID</th>
                <th>Última Sincronización</th>
                <th className="text-center">Estado de Seguridad</th>
                <th className="text-right">Gestión</th>
              </tr>
            </thead>
            <tbody>
              {filteredAgents.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-32 text-center bg-white">
                    <div className="flex flex-col items-center">
                      <div className="p-6 bg-slate-50 rounded-full mb-6">
                        {agents.length === 0
                          ? <Server size={48} className="text-slate-200" />
                          : <Search size={48} className="text-slate-200" />
                        }
                      </div>
                      <p className="text-slate-400 font-black uppercase tracking-widest text-xs">
                        {agents.length === 0
                          ? 'Sin agentes registrados — despliega el primero con el botón superior'
                          : 'Sin nodos que coincidan con la búsqueda'
                        }
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {filteredAgents.map(agent => (
                <tr key={agent.id} className="group/row transition-colors cursor-default">
                  <td>
                    <div className="flex flex-col">
                      <span className="font-black text-[#1a2333] group-hover/row:text-brand transition-colors uppercase tracking-tight">
                        {agent.name}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Nodo ID: {agent.id.substring(0, 8)}</span>
                    </div>
                  </td>
                  <td>
                    <Link to={`/clients/${agent.client_id}`} className="flex flex-col group/client">
                      <span className="text-xs font-black text-brand group-hover/client:text-[#1a2333] transition-colors uppercase tracking-tight">
                        {agent.client_name || 'Desconocido'}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Ver Expediente</span>
                    </Link>
                  </td>
                  <td>
                    <span className="font-mono text-[11px] font-black text-slate-500 uppercase tracking-tighter bg-slate-50 px-2 py-1 rounded-lg">
                      {agent.hardware_id || '---'}
                    </span>
                  </td>
                  <td className="text-slate-500">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-slate-50 rounded-xl group-hover/row:bg-blue-50 transition-colors">
                        <Clock size={14} className="text-slate-400 group-hover/row:text-brand" />
                      </div>
                      <span className="text-xs font-bold uppercase text-slate-600">{formatRelativeTime(agent.last_seen, now)}</span>
                    </div>
                  </td>
                  <td className="text-center">
                    {(agent.status === 'active' || agent.status === 'offline') && !isAgentOffline(agent) && (
                      <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-4 py-2 rounded-full border border-emerald-100">
                        <ShieldCheck size={14} /> OPERATIVO
                      </span>
                    )}
                    {isAgentOffline(agent) && (
                      <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-4 py-2 rounded-full border border-amber-100 animate-pulse">
                        <Activity size={14} /> SIN SEÑAL
                      </span>
                    )}
                    {agent.status === 'revoked' && (
                      <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-rose-600 bg-rose-50 px-4 py-2 rounded-full border border-rose-100">
                        <ShieldOff size={14} /> REVOCADO
                      </span>
                    )}
                    {agent.status === 'pending' && (
                      <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 px-4 py-2 rounded-full">
                        <Clock size={14} /> PENDIENTE
                      </span>
                    )}
                  </td>
                  <td className="text-right px-10">
                    <div className="flex items-center justify-end gap-3 opacity-0 group-hover/row:opacity-100 transition-all">
                      {agent.status !== 'revoked' && (
                        <button
                          onClick={() => onConfig(agent)}
                          aria-label={`Configurar agente ${agent.name}`}
                          className="p-3 bg-blue-50 text-brand hover:bg-brand hover:text-white rounded-2xl transition-all active:scale-90 shadow-sm"
                          title="Ajustes Remotos"
                        >
                          <Settings size={20} />
                        </button>
                      )}
                      <button
                        onClick={() => onRegen(agent)}
                        disabled={regenLoading === agent.id}
                        aria-label={`Regenerar llave de activación de ${agent.name}`}
                        className="p-3 bg-amber-50 text-amber-500 hover:bg-amber-500 hover:text-white rounded-2xl transition-all active:scale-90 shadow-sm disabled:opacity-40"
                        title="Regenerar Llave de Activación"
                      >
                        {regenLoading === agent.id
                          ? <RefreshCw size={20} className="animate-spin" />
                          : <Key size={20} />}
                      </button>
                      {agent.status === 'active' && (
                        <button
                          onClick={() => onRevoke(agent)}
                          disabled={revoking === agent.id}
                          aria-label={`Revocar licencia de ${agent.name}`}
                          className="p-3 bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white rounded-2xl transition-all active:scale-90 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Revocar Licencia"
                        >
                          <ShieldOff size={20} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
