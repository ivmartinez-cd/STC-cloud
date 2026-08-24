import { useState, useEffect } from 'react';
import { useNow } from '../hooks/useNow';
import { Link } from 'react-router-dom';
import {
  HardDrive, Activity, Radio, Users, BarChart3,
  Plus, Cpu, UserCheck, AlertOctagon, PackageSearch
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
import ActionTileChip from '../components/dashboard/ActionTileChip';

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

  // Fase 4.2 del gap analysis vs HP SDS — pedidos de consumibles pendientes.
  const [pendingRequests, setPendingRequests] = useState(0);
  useEffect(() => {
    api.get<Record<string, number>>('/supply-requests/stats')
      .then((d) => setPendingRequests(d.pending ?? 0))
      .catch(() => setPendingRequests(0));
  }, []);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-40 animate-pulse">
        <Activity size={48} className="text-brand animate-spin mb-4" />
        <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Cargando inteligencia de flota...</p>
      </div>
    );
  }

  const hasActionTiles = !!data?.discovered?.pendingTotal || openIncidents > 0 || pendingRequests > 0;

  return (
    <div className="flex flex-col gap-3 xl:flex-1 xl:min-h-0 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-black text-[#1a2333] tracking-tighter">Panel de Control</h1>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] font-black uppercase tracking-widest">Sincronizado</span>
            </div>
            <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wide hidden sm:block">Visión estratégica de la infraestructura global</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/clients" className="flex items-center gap-1.5 px-3.5 py-2 bg-white text-[#1a2333] font-black text-[11px] uppercase tracking-widest rounded-xl border border-slate-200 hover:border-brand transition-all active:scale-95">
            <Plus size={14} /> Nuevo Cliente
          </Link>
          <Link to="/agents" className="flex items-center gap-1.5 px-3.5 py-2 bg-[#1a2333] text-white font-black text-[11px] uppercase tracking-widest rounded-xl hover:bg-brand-hover transition-all active:scale-95 shadow-lg shadow-brand/10">
            <Cpu size={14} /> Gestionar Agentes
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
        <StatCard
          title="Parque Global"
          value={data?.stats?.devices?.toLocaleString() ?? '0'}
          subtitle={data?.stats?.devicesUnmanaged ? `${data.stats.devicesUnmanaged} no gestionadas` : 'Impresoras Monitoreadas'}
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

      {/* Alertas operativas accionables — sólo aparecen si hay algo pendiente. */}
      {hasActionTiles && (
        <div className="flex flex-wrap gap-2 shrink-0">
          {!!data?.discovered?.pendingTotal && (
            <ActionTileChip to="/pending" icon={UserCheck} count={data.discovered.pendingTotal} label="equipo(s) esperando aprobación" color="amber" />
          )}
          {openIncidents > 0 && (
            <ActionTileChip to="/incidents?status=open" icon={AlertOctagon} count={openIncidents} label="incidente(s) abierto(s)" color="rose" />
          )}
          {pendingRequests > 0 && (
            <ActionTileChip to="/supply-requests" icon={PackageSearch} count={pendingRequests} label="pedido(s) de consumibles pendiente(s)" color="amber" />
          )}
        </div>
      )}

      {/* Área flexible: en xl+ ocupa el resto del viewport sin scroll de página,
          cada card scrollea internamente. Debajo de xl cae a stack normal
          (con scroll de página) — fallback declarado a propósito, no silencioso. */}
      {/* Las pistas del grid van con minmax(0,1fr) explícito: con `auto` cada
          card crece al tamaño de su contenido (listas largas) y se derrama por
          encima de la fila siguiente — la altura definida es lo que habilita
          el scroll interno de cada card. */}
      <div className="flex flex-col gap-3 xl:flex-1 xl:min-h-0">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 xl:flex-[3] xl:min-h-0 auto-rows-[280px] xl:grid-rows-[minmax(0,1fr)] [&>*]:min-h-0 [&>*]:overflow-hidden">
          <BrandDistributionCard brands={data?.brands} />
          <TopClientsCard topClients={data?.topClients} />
          <OfflineAgentsCard offlineAgents={data?.offlineAgents} now={now} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 xl:flex-[2] xl:min-h-0 auto-rows-[220px] xl:grid-rows-[minmax(0,1fr)] [&>*]:min-h-0">
          <div className="lg:col-span-2 h-full min-h-0"><AlertsByClassCard alertsByClass={data?.alertsByClass} /></div>
          <div className="h-full min-h-0"><AgentVersionsCard agentVersions={data?.agentVersions} currentAgentVersion={data?.currentAgentVersion} /></div>
        </div>

        <div className="xl:flex-[3] xl:min-h-0 h-[320px] xl:h-auto">
          <SupplyAlertsTable />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
