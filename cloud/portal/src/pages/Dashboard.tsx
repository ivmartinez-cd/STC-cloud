import React, { useEffect, useState, useCallback } from 'react';
import { HardDrive, AlertTriangle, Activity, Radio, TrendingUp, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell
} from 'recharts';

interface DashboardData {
  stats: {
    devices:  number;
    agents:   number;
    readings: number;
    alerts:   number;
  };
  recent: Array<{
    time:        string;
    total_pages: number;
    mono_pages:  number | null;
    color_pages: number | null;
    status:      string;
    brand:       string;
    ip:          string;
  }>;
}

const StatCard = ({
  title, value, icon: Icon, iconColor, iconBg, trend,
}: {
  title: string; value: string | number; icon: React.ElementType; iconColor: string; iconBg: string; trend?: string;
}) => (
  <div className="cd-panel p-6 flex flex-col justify-between group hover:-translate-y-1 transition-all duration-300">
    <div className="flex items-start justify-between">
      <div className={`p-3 rounded-2xl ${iconBg} group-hover:scale-110 transition-transform`}>
        <Icon className={iconColor} size={24} />
      </div>
      {trend && (
        <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full">
          <TrendingUp size={10} />
          {trend}
        </div>
      )}
    </div>
    <div className="mt-4">
      <div className="text-3xl font-extrabold text-[#1a2333] tracking-tight">{value}</div>
      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">{title}</div>
    </div>
  </div>
);

const Dashboard = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const { showToast } = useToast();

  const load = useCallback(() => {
    api.get<DashboardData>('/dashboard')
      .then(setData)
      .catch((e: Error) => {
        showToast('Error al conectar con el servidor de monitoreo', 'error');
        console.error(e);
      });
  }, [showToast]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000); // Polling cada 30s para no saturar
    return () => clearInterval(t);
  }, [load]);

  const chartData = data?.recent
    ? [...data.recent].reverse().map((r, i) => ({
        name:  `#${i + 1}`,
        total: r.total_pages,
        mono:  r.mono_pages ?? 0,
        color: r.color_pages ?? 0,
        label: `${r.brand?.toUpperCase()} ${r.ip}`,
      }))
    : [];

  const alertCount = data?.stats.alerts ?? 0;
  const stats = [
    { title: 'Dispositivos',     value: data?.stats.devices  ?? '—', icon: HardDrive,     iconColor: 'text-[#2980b9]',    iconBg: 'bg-blue-50',     trend: '+2 hoy' },
    { title: 'Monitores',        value: data?.stats.agents   ?? '—', icon: Radio,          iconColor: 'text-[#689f38]',    iconBg: 'bg-emerald-50' },
    { title: 'Lecturas Hoy',     value: data?.stats.readings ?? '—', icon: Activity,       iconColor: 'text-[#f39c12]',    iconBg: 'bg-orange-50',   trend: 'Estable' },
    {
      title:     alertCount === 0 ? 'Salud Sistema' : 'Alertas Activas',
      value:     alertCount === 0 ? 'OK' : alertCount,
      icon:      alertCount === 0 ? Radio : AlertTriangle,
      iconColor: alertCount === 0 ? 'text-[#689f38]' : 'text-rose-500',
      iconBg:    alertCount === 0 ? 'bg-emerald-50' : 'bg-rose-50',
    },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight">Panel de Control</h1>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-slate-500 text-sm font-medium">Estado en tiempo real de la flota</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((s, i) => <StatCard key={i} {...s} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 cd-panel p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-[#1a2333]">Rendimiento Reciente</h3>
            <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#2980b9]" /> Páginas Totales
              </div>
            </div>
          </div>
          
          {chartData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <Activity size={32} className="mb-2 opacity-20" />
              <p className="italic text-sm">Esperando sincronización de datos...</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} width={40} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ 
                    background: '#ffffff', 
                    border: 'none', 
                    borderRadius: '12px', 
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                    padding: '12px'
                  }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                  labelStyle={{ display: 'none' }}
                  formatter={(value: number, _name: string, props: { payload: { label: string } }) => [value.toLocaleString(), props.payload.label]}
                />
                <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#e67e22' : '#2980b9'} fillOpacity={0.8 + (index / chartData.length) * 0.2} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Recent readings */}
        <div className="cd-panel p-6 flex flex-col">
          <h3 className="text-lg font-bold text-[#1a2333] mb-6">Actividad</h3>
          <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar">
            {!data?.recent?.length && (
              <div className="flex-1 flex items-center justify-center py-10">
                <p className="text-slate-400 text-sm font-medium italic">Sin actividad reciente</p>
              </div>
            )}
            {data?.recent?.map((r, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100 group">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 shadow-sm ${
                  ['idle', 'online'].includes(r.status) ? 'bg-emerald-500' : 'bg-slate-300'
                }`} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-[#1a2333] truncate group-hover:text-[#2980b9] transition-colors">
                    {r.brand?.toUpperCase()} — {r.ip}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                    {new Date(r.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {r.total_pages?.toLocaleString()} págs
                  </div>
                </div>
                <ChevronRight size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-all" />
              </div>
            ))}
          </div>
          <button className="mt-auto pt-6 text-center text-xs font-bold text-[#2980b9] hover:text-[#e67e22] transition-colors uppercase tracking-widest">
            Ver todo el historial
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

