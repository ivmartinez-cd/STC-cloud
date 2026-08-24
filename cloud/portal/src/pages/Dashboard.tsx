import { useState, useEffect } from 'react';
import { useNow } from '../hooks/useNow';
import { Link } from 'react-router-dom';
import {
  HardDrive, Activity, Radio, Users, ChevronRight, BarChart3,
  Plus, FileText, Settings, Cpu, UserCheck, AlertOctagon
} from 'lucide-react';
import { useDashboard } from '../hooks/useDashboard';
import { api } from '../lib/api';
import StatCard from '../components/dashboard/StatCard';
import BrandDistributionCard from '../components/dashboard/BrandDistributionCard';
import TopClientsCard from '../components/dashboard/TopClientsCard';
import OfflineAgentsCard from '../components/dashboard/OfflineAgentsCard';
import AlertsByClassCard from '../components/dashboard/AlertsByClassCard';
import AgentVersionsCard from '../components/dashboard/AgentVersionsCard';
import SupplyAlertsTable from '../components/dashboard/SupplyAlertsTable';

const Dashboard = () => {
  const { data, loading, fetchDashboardData } = useDashboard();
  const now = useNow();

  useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

  // Incidentes abiertos (Fase 11 del gap analysis vs HP SDS) — no viaja en el
  // payload principal del dashboard (endpoint aparte, /incidents/stats),
  // mismo criterio que el resumen de alertas: no encarecer el polling de
  // `useDashboard` con algo que la mayoría de las cargas no necesita mostrar.
  const [openIncidents, setOpenIncidents] = useState(0);
  useEffect(() => {
    api.get<{ openTotal: number }>('/incidents/stats')
      .then((d) => setOpenIncidents(d.openTotal))
      .catch(() => setOpenIncidents(0));
  }, []);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-40 animate-pulse">
        <Activity size={48} className="text-brand animate-spin mb-4" />
        <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Cargando inteligencia de flota...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-[#1a2333] tracking-tighter">Panel de Control</h1>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest">Sincronizado</span>
            </div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wide">Visión estratégica de la infraestructura global</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/clients" className="flex items-center gap-2 px-5 py-3 bg-white text-[#1a2333] font-black text-xs uppercase tracking-widest rounded-2xl border border-slate-200 hover:border-brand transition-all active:scale-95">
            <Plus size={16} /> Nuevo Cliente
          </Link>
          <Link to="/agents" className="flex items-center gap-2 px-5 py-3 bg-[#1a2333] text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-brand-hover transition-all active:scale-95 shadow-xl shadow-brand/10">
            <Cpu size={16} /> Gestionar Agentes
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Parque Global"
          value={data?.stats?.devices?.toLocaleString() ?? '0'}
          subtitle={data?.stats?.devicesUnmanaged ? `Impresoras Monitoreadas · ${data.stats.devicesUnmanaged} no gestionadas` : 'Impresoras Monitoreadas'}
          icon={HardDrive} color="charcoal" trend={data?.stats?.deviceTrend || undefined}
        />
        <StatCard
          title="Monitores"
          value={`${data?.stats?.agents?.online ?? 0}/${data?.stats?.agents?.total ?? 0}`}
          subtitle={
            data?.stats?.agents?.total
              ? `${Math.round(((data.stats.agents.reporting ?? 0) / data.stats.agents.total) * 100)}% reportando (24h)`
              : 'Nodos en línea'
          }
          icon={Radio} color="emerald"
        />
        <StatCard title="Clientes" value={data?.stats?.clients?.toLocaleString() ?? '0'} subtitle="Empresas Registradas" icon={Users} color="gray" />
        <StatCard title="Volumen Mensual" value={data?.stats?.volume?.toLocaleString() ?? '0'} subtitle="Páginas Procesadas" icon={BarChart3} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <BrandDistributionCard brands={data?.brands} />
        <TopClientsCard topClients={data?.topClients} />
        <OfflineAgentsCard offlineAgents={data?.offlineAgents} now={now} />
      </div>

      {/* Resumen de alertas por clase + versiones de agente (Fase 6 del gap analysis vs HP SDS) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <AlertsByClassCard alertsByClass={data?.alertsByClass} />
        <AgentVersionsCard agentVersions={data?.agentVersions} currentAgentVersion={data?.currentAgentVersion} />
      </div>

      {/* Cola de registro de dispositivos (Fase 7 del gap analysis vs HP SDS) —
          sólo se muestra si hay algo pendiente: es una alerta accionable, no un
          panel más para mirar todos los días. */}
      {!!data?.discovered?.pendingTotal && (
        <Link
          to="/pending"
          className="cd-panel p-6 flex items-center gap-4 border border-amber-100 bg-amber-50/40 hover:bg-amber-50 transition-all group"
        >
          <div className="p-3 rounded-2xl bg-amber-100 text-amber-600"><UserCheck size={24} /></div>
          <div className="flex-1">
            <h3 className="text-sm font-black text-[#1a2333] tracking-tight">
              {data.discovered.pendingTotal} equipo(s) esperando aprobación
            </h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
              Descubiertos por un agente, fuera del inventario hasta ser registrados
            </p>
          </div>
          <ChevronRight size={18} className="text-amber-400 group-hover:translate-x-1 transition-transform" />
        </Link>
      )}

      {/* Incidentes abiertos (Fase 11 del gap analysis vs HP SDS) — mismo
          criterio que el tile de pendientes: sólo aparece si hay algo. */}
      {openIncidents > 0 && (
        <Link
          to="/incidents?status=open"
          className="cd-panel p-6 flex items-center gap-4 border border-rose-100 bg-rose-50/40 hover:bg-rose-50 transition-all group"
        >
          <div className="p-3 rounded-2xl bg-rose-100 text-rose-600"><AlertOctagon size={24} /></div>
          <div className="flex-1">
            <h3 className="text-sm font-black text-[#1a2333] tracking-tight">
              {openIncidents} incidente(s) abierto(s)
            </h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
              Unidades de trabajo de servicio activas, propias o automáticas
            </p>
          </div>
          <ChevronRight size={18} className="text-rose-400 group-hover:translate-x-1 transition-transform" />
        </Link>
      )}

      {/* Active Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <SupplyAlertsTable />
      </div>

      {/* Quick Access */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
        <Link to="/reports" className="flex items-center gap-4 p-6 bg-white border border-slate-200 rounded-[2.5rem] hover:border-brand hover:shadow-2xl hover:shadow-brand/5 transition-all group">
          <div className="p-4 bg-brand/10 text-brand rounded-3xl group-hover:scale-110 transition-transform">
            <FileText size={24} />
          </div>
          <div>
            <h4 className="text-sm font-black text-[#1a2333] uppercase tracking-tight">Reportes de Facturación</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Auditoría de consumos</p>
          </div>
        </Link>
        <Link to="/settings" className="flex items-center gap-4 p-6 bg-white border border-slate-200 rounded-[2.5rem] hover:border-slate-900 hover:shadow-2xl hover:shadow-slate-900/5 transition-all group">
          <div className="p-4 bg-slate-50 text-slate-600 rounded-3xl group-hover:scale-110 transition-transform">
            <Settings size={24} />
          </div>
          <div>
            <h4 className="text-sm font-black text-[#1a2333] uppercase tracking-tight">Preferencias Globales</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Ajustes del ecosistema</p>
          </div>
        </Link>
      </div>
    </div>
  );
};

export default Dashboard;
