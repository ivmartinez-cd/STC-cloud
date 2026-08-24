import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import type { Alert } from '../../types/alerts';

const getTonerColorInfo = (type: string) => {
  if (type.includes('black')) {
    return { name: 'Negro', badgeClass: 'bg-slate-950 border-slate-800 text-white', barColor: '#0f172a' };
  }
  if (type.includes('cyan')) {
    return { name: 'Cian', badgeClass: 'bg-cyan-500 border-cyan-400 text-white', barColor: '#06b6d4' };
  }
  if (type.includes('magenta')) {
    return { name: 'Magenta', badgeClass: 'bg-pink-500 border-pink-400 text-white', barColor: '#ec4899' };
  }
  if (type.includes('yellow')) {
    return { name: 'Amarillo', badgeClass: 'bg-yellow-400 border-yellow-300 text-slate-900', barColor: '#eab308' };
  }
  return null;
};

export default function SupplyAlertsTable() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await api.get<Alert[]>('/alerts?resolved=false');
      // Este panel es de CONSUMIBLES — sólo tóner. `type` es texto libre, así que
      // el filtro se hace acá (no hay un `type=` de servidor que exprese "toner_%
      // en cualquiera de sus variantes"). Desde que existen `agent_offline` y
      // `device_offline` (y ya existían códigos EWS libres), sin este filtro
      // aparecerían acá con columnas de tóner vacías — la página dedicada
      // `/alerts` es donde se ven todos los tipos.
      setAlerts(res.filter((a) => a.type.startsWith('toner_')));
    } catch (err) {
      console.error('Error al obtener alertas:', err);
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  useEffect(() => {
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  return (
    <div className="cd-panel p-4 h-full flex flex-col hover:shadow-xl hover:shadow-brand/5 transition-all duration-500">
      <div className="flex items-center justify-between gap-3 shrink-0 mb-2">
        <div className="min-w-0">
          <h3 className="text-xs font-black text-[#1a2333] tracking-tight flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-500 animate-pulse" /> Consumibles en Alerta
          </h3>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Suministros bajos y críticos detectados</p>
        </div>
        <Link to="/supplies" className="text-[9px] font-extrabold uppercase tracking-widest text-brand hover:underline shrink-0">
          Ver todos
        </Link>
        {alerts.length > 0 && (
          <span className={`px-2 py-0.5 text-[9px] font-black rounded-full shadow-lg shrink-0 ${
            alerts.some(a => a.severity === 'critical')
              ? 'bg-rose-500 text-white shadow-rose-900/20 animate-pulse'
              : 'bg-amber-500 text-white shadow-amber-900/20'
          }`}>
            {alerts.length}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {alertsLoading ? (
          <div className="h-full flex flex-col items-center justify-center animate-pulse">
            <Activity size={24} className="text-brand animate-spin mb-2" />
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Consultando alertas...</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-emerald-500 bg-emerald-50/30 rounded-2xl border border-emerald-100 border-dashed">
            <ShieldCheck size={32} className="mb-2 text-emerald-500 animate-bounce duration-1000" />
            <h4 className="text-[11px] font-black uppercase tracking-widest text-emerald-600">Niveles Óptimos</h4>
            <p className="text-[9px] font-bold text-slate-400 mt-1">Todos los consumibles por encima de los límites configurados</p>
          </div>
        ) : (
          <div className="w-full h-full overflow-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="py-1.5 px-2.5 text-[9px] font-black text-slate-500 uppercase tracking-widest">Cliente</th>
                  <th className="py-1.5 px-2.5 text-[9px] font-black text-slate-500 uppercase tracking-widest">S/N</th>
                  <th className="py-1.5 px-2.5 text-[9px] font-black text-slate-500 uppercase tracking-widest">Modelo</th>
                  <th className="py-1.5 px-2.5 text-[9px] font-black text-slate-500 uppercase tracking-widest">Color</th>
                  <th className="py-1.5 px-2.5 text-[9px] font-black text-slate-500 uppercase tracking-widest">Descripción</th>
                  <th className="py-1.5 px-2.5 text-[9px] font-black text-slate-500 uppercase tracking-widest">Motivo</th>
                  <th className="py-1.5 px-2.5 text-[9px] font-black text-slate-500 uppercase tracking-widest">Fecha</th>
                  <th className="py-1.5 px-2.5 text-[9px] font-black text-slate-500 uppercase tracking-widest">Nivel Actual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {alerts.map((alert) => {
                  const isToner = alert.type.startsWith('toner_');
                  const tonerInfo = isToner ? getTonerColorInfo(alert.type) : null;
                  return (
                    <tr key={alert.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-1 px-2.5 text-[9px] text-[#1a2333] font-black uppercase">
                        {alert.client_name || '-'}
                      </td>
                      <td className="py-1 px-2.5 text-[9px] text-slate-500 font-mono">
                        {alert.serial || '-'}
                      </td>
                      <td className="py-1 px-2.5 text-[9px] text-slate-700 font-bold">
                        {alert.device_name || 'Dispositivo'}
                      </td>
                      <td className="py-1 px-2.5 text-[9px]">
                        {isToner && tonerInfo ? (
                           <div className="flex items-center gap-1.5">
                             <div className="w-2 h-2 rounded-sm border border-slate-200" style={{ backgroundColor: tonerInfo.barColor }} />
                             <span className="font-bold text-slate-600">{tonerInfo.name}</span>
                           </div>
                        ) : (
                           <span className="text-slate-400 font-medium">Sin color</span>
                        )}
                      </td>
                      <td className="py-1 px-2.5 text-[9px] text-slate-600 max-w-[180px] truncate" title={alert.message}>
                        {alert.message.split(' en ')[0]}
                      </td>
                      <td className="py-1 px-2.5">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                          alert.severity === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {alert.severity === 'critical' ? 'Crítico' : 'Nivel bajo'}
                        </span>
                      </td>
                      <td className="py-1 px-2.5 text-[9px] text-slate-500 font-medium">
                        {new Date(alert.created_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-1 px-2.5 w-28">
                        {isToner ? (
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden border border-slate-200/50">
                              <div className="h-full rounded-full" style={{ width: `${alert.value}%`, backgroundColor: tonerInfo?.barColor || '#ef4444' }} />
                            </div>
                            <span className="text-[8px] font-bold text-slate-500 w-6 text-right">{alert.value}%</span>
                          </div>
                        ) : (
                          <span className="text-[9px] text-slate-500">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
