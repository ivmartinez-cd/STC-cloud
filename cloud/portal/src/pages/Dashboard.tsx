import { useEffect, useState, useCallback } from 'react';
import { HardDrive, AlertTriangle, Activity, Radio } from 'lucide-react';
import { api } from '../lib/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
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
  title, value, icon: Icon, iconColor, iconBg,
}: {
  title: string; value: string | number; icon: any; iconColor: string; iconBg: string;
}) => (
  <div className="cd-panel rounded-xl p-5 flex items-center gap-4">
    <div className={`p-3 rounded-xl ${iconBg} shrink-0`}>
      <Icon className={iconColor} size={22} />
    </div>
    <div>
      <div className="text-2xl font-bold text-[#1a2333]">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{title}</div>
    </div>
  </div>
);

const Dashboard = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get<DashboardData>('/dashboard')
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
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
    { title: 'Total Dispositivos',  value: data?.stats.devices  ?? '—', icon: HardDrive,     iconColor: 'text-[#2980b9]',    iconBg: 'bg-[#2980b9]/10' },
    { title: 'Monitores Activos',   value: data?.stats.agents   ?? '—', icon: Radio,          iconColor: 'text-[#689f38]',    iconBg: 'bg-[#689f38]/10' },
    { title: 'Lecturas Recibidas',  value: data?.stats.readings ?? '—', icon: Activity,       iconColor: 'text-[#f39c12]',    iconBg: 'bg-[#f39c12]/10' },
    {
      title:     alertCount === 0 ? 'Sistema Saludable' : 'Alertas Activas',
      value:     alertCount,
      icon:      alertCount === 0 ? Radio : AlertTriangle,
      iconColor: alertCount === 0 ? 'text-[#689f38]' : 'text-red-500',
      iconBg:    alertCount === 0 ? 'bg-[#689f38]/10' : 'bg-red-100',
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <h1 className="text-2xl font-bold text-[#1a2333]">Panel de Control</h1>
        <p className="text-slate-500 text-sm mt-0.5">Estado de la flota de impresoras.</p>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm">
          Error al cargar dashboard: {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => <StatCard key={i} {...s} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Chart */}
        <div className="lg:col-span-2 cd-panel rounded-xl p-6">
          <h3 className="font-semibold text-[#1a2333] mb-5 text-sm">Últimas lecturas — páginas totales</h3>
          {chartData.length === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-slate-400">
              <p className="italic text-sm">Esperando datos de los monitores...</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={56} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #d1d8e0', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#1a2333' }}
                  formatter={(value: any, _: any, props: any) => [value.toLocaleString(), props.payload.label]}
                />
                <Bar dataKey="total" fill="#2980b9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Recent readings */}
        <div className="cd-panel rounded-xl p-5">
          <h3 className="font-semibold text-[#1a2333] mb-4 text-sm">Lecturas Recientes</h3>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {!data?.recent?.length && (
              <p className="text-slate-400 text-sm py-4 text-center">Esperando datos de los monitores...</p>
            )}
            {data?.recent?.map((r, i) => (
              <div key={i} className="flex items-start gap-3 px-2 py-2.5 rounded-lg hover:bg-slate-50 transition-colors">
                <div className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${
                  ['idle', 'online'].includes(r.status) ? 'bg-[#689f38]' : 'bg-slate-300'
                }`} />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#1a2333] truncate">
                    {r.brand?.toUpperCase()} — {r.ip}
                  </div>
                  <div className="text-xs text-slate-400">
                    {r.total_pages?.toLocaleString()} págs · {new Date(r.time).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
