import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Plus, Cpu } from 'lucide-react';
import { useDashboard } from '../hooks/useDashboard';
import { useDashboardExtras } from '../hooks/useDashboardExtras';
import StatsStrip from '../components/StatsStrip';
import CounterPanel from '../components/CounterPanel';
import SuppliesPanel from '../components/SuppliesPanel';
import AlertsByClassCard from '../components/AlertsByClassCard';
import AgentVersionsCard from '../components/AgentVersionsCard';
import MonitorPresenceCard from '../components/MonitorPresenceCard';
import BrandDistributionCard from '../components/BrandDistributionCard';
import TopClientsCard from '../components/TopClientsCard';

/* Panel de control al estilo HP SDS ("Portal → Panel de control"): paneles de
 * CONTADORES con fila Total y "Mostrar detalles…" hacia la pantalla que tiene
 * el listado. Nada scrollea dentro del dashboard — si algo necesita una lista,
 * esa lista vive en su propia página. Por eso entra en una pantalla sin
 * scroll: no por forzar alturas, sino porque muestra totales, no filas. */

const Dashboard = () => {
  const { data, loading, fetchDashboardData } = useDashboard();
  const { incidents, supplyRequests, supplies } = useDashboardExtras();

  useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-40 animate-pulse">
        <Activity size={48} className="text-brand animate-spin mb-4" />
        <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Cargando inteligencia de flota...</p>
      </div>
    );
  }

  const d = data?.discovered;
  const inc = incidents?.byStatus ?? {};
  const sr = supplyRequests ?? {};

  return (
    <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-3 shrink-0">
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

      <StatsStrip stats={data?.stats} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 items-start">
        <CounterPanel
          title="Dispositivos pendientes de registro" to="/pending" className="xl:col-span-3"
          cells={[
            { label: 'Descubiertos hoy', value: d?.today ?? 0, tone: 'amber' },
            { label: 'Ayer', value: d?.yesterday ?? 0, tone: 'amber' },
            { label: 'Pendientes', value: d?.pendingTotal ?? 0, tone: 'amber', to: '/pending' },
          ]}
        />
        <CounterPanel
          title="Movimientos y cambios" to="/activity" className="xl:col-span-2"
          cells={[
            { label: 'Hoy y ayer', value: data?.movements?.recent ?? 0, to: '/activity' },
            { label: 'Total', value: data?.movements?.total ?? 0, to: '/activity' },
          ]}
        />
        <CounterPanel
          title="Solicitudes de consumibles" to="/supply-requests" className="xl:col-span-4"
          cells={[
            { label: 'Pendientes', value: sr.pending ?? 0, tone: 'rose', to: '/supply-requests' },
            { label: 'Revisadas', value: sr.reviewed ?? 0, tone: 'amber', to: '/supply-requests' },
            { label: 'Procesadas', value: sr.processed ?? 0, tone: 'emerald', to: '/supply-requests' },
            { label: 'Completadas', value: sr.completed ?? 0, to: '/supply-requests' },
          ]}
        />
        <CounterPanel
          title="Incidencias" to="/incidents" className="xl:col-span-3"
          cells={[
            { label: 'Abiertas', value: inc.open ?? 0, tone: 'rose', to: '/incidents?status=open' },
            { label: 'En curso', value: inc.in_progress ?? 0, tone: 'amber', to: '/incidents?status=in_progress' },
            { label: 'En espera', value: inc.on_hold ?? 0, to: '/incidents?status=on_hold' },
            { label: 'Cerradas', value: inc.closed ?? 0, tone: 'emerald', to: '/incidents?status=closed' },
          ]}
        />
      </div>

      <AlertsByClassCard alertsByClass={data?.alertsByClass} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 items-start">
        <SuppliesPanel summary={supplies} />
        <MonitorPresenceCard agents={data?.stats?.agents} />
        <AgentVersionsCard agentVersions={data?.agentVersions} currentAgentVersion={data?.currentAgentVersion} />
        <BrandDistributionCard brands={data?.brands} />
        <TopClientsCard topClients={data?.topClients} />
      </div>
    </div>
  );
};

export default Dashboard;
