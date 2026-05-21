import { useState } from 'react';
import { useNow } from '../../hooks/useNow';
import { Link } from 'react-router-dom';
import { Printer, Download, X } from 'lucide-react';
import { OFFLINE_THRESHOLD_MS } from '../../lib/constants';
import type { Device, MonitorData } from '../../types/monitor';

interface Props {
  devices: Device[];
  monitorName: string;
  monitorStatus: MonitorData['status'];
  monitorLastSeen: string | null;
}

function exportCountersCSV(devices: Device[], monitorName: string, discriminate: boolean) {
  const today = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const rows = ['SERIE;FECHA;TIPO;CLASE;CONTADOR;CLASE;CONTADOR;MOTIVO;OBSERVACIONES'];

  for (const d of devices) {
    const serie = d.serial_number ?? 'S/N';
    const mono = d.mono_pages ?? 0;
    const color = d.color_pages ?? 0;
    const total = d.total_pages ?? (mono + color);
    const isColor = color > 0;

    let row: string;
    if (isColor) {
      row = discriminate
        ? `${serie};${today};7;10;${mono};20;${color};;`
        : `${serie};${today};7;20;${total};;;;`;
    } else {
      row = `${serie};${today};7;10;${mono};;;;`;
    }
    rows.push(row);
  }

  const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `contadores_${monitorName.replace(/\s+/g, '_')}_${today.replace(/\//g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const DeviceInventoryTable = ({ devices, monitorName, monitorStatus, monitorLastSeen }: Props) => {
  const [showExportModal, setShowExportModal] = useState(false);

  const now = useNow();
  const isMonitorOnline = monitorStatus === 'active'
    && monitorLastSeen !== null
    && (now - new Date(monitorLastSeen).getTime() <= OFFLINE_THRESHOLD_MS);

  const handleExport = (discriminate: boolean) => {
    exportCountersCSV(devices, monitorName, discriminate);
    setShowExportModal(false);
  };

  return (
    <>
      <div className="cd-panel overflow-hidden border-none shadow-xl shadow-blue-900/5 animate-in slide-in-from-bottom-4 duration-500">
        <header className="px-8 py-6 bg-white border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-[#1a2333] uppercase tracking-tight">Parque de Impresión</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Dispositivos descubiertos y monitorizados por este nodo</p>
          </div>
          <div className="flex items-center gap-3">
            {devices.length > 0 && (
              <button
                onClick={() => setShowExportModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-[11px] font-black uppercase tracking-wider transition-colors border border-emerald-200"
              >
                <Download size={13} /> Exportar CSV
              </button>
            )}
            <span className="px-4 py-1.5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-black uppercase tracking-widest">
              {devices.length} Equipos
            </span>
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="cd-table">
            <thead>
              <tr>
                <th className="!bg-[#004a99] !text-white !rounded-tl-2xl">Dispositivo</th>
                <th className="!bg-[#004a99] !text-white">Red</th>
                <th className="!bg-[#004a99] !text-white">Número de Serie</th>
                <th className="!bg-[#004a99] !text-white">Tóner</th>
                <th className="!bg-[#004a99] !text-white !text-right !rounded-tr-2xl">Contadores (Total / Mono / Color)</th>
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Printer size={48} className="text-slate-200" />
                      <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">No se han descubierto dispositivos en este segmento</p>
                    </div>
                  </td>
                </tr>
              ) : (
                devices.map((device) => (
                  <tr key={device.id} className="group hover:bg-slate-50/50 transition-all">
                    <td className="px-8 py-5">
                      <Link to={`/devices/${device.id}`} className="flex items-center gap-4 group/device">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 group-hover/device:bg-brand group-hover/device:text-white transition-all">
                          <Printer size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-[#1a2333] tracking-tight group-hover/device:text-brand transition-colors">{device.model || 'Modelo Genérico'}</p>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{device.brand || 'Marca n/a'}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-600 font-mono">{device.ip_address}</span>
                        {isMonitorOnline ? (
                          <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Conexión OK</span>
                        ) : (
                          <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Sin Contacto</span>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg font-mono text-xs font-bold border border-slate-200">
                        {device.serial_number || 'N/A'}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      {device.toner_black !== undefined && device.toner_black !== null ? (
                        <div className="w-28 space-y-1.5">
                          {device.toner_cyan === null || device.toner_cyan === undefined ? (
                            // Monocromo
                            <div className="space-y-1">
                              <div className="flex justify-between items-center text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
                                <span>Negro</span>
                                <span className={device.toner_black <= 15 ? 'text-amber-500 animate-pulse font-black' : 'text-slate-600'}>
                                  {device.toner_black}%
                                </span>
                              </div>
                              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                                <div 
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    device.toner_black <= 15 ? 'bg-amber-400' : 'bg-slate-800'
                                  }`} 
                                  style={{ width: `${device.toner_black}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            // Color CMYK
                            <div className="space-y-1">
                              <div className="flex justify-between items-center text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
                                <span>CMYK</span>
                                <span className={
                                  (device.toner_black <= 15 || device.toner_cyan <= 15 || device.toner_magenta <= 15 || device.toner_yellow <= 15)
                                    ? 'text-amber-500 animate-pulse font-black'
                                    : 'text-slate-600'
                                }>
                                  Mín: {Math.min(device.toner_black, device.toner_cyan, device.toner_magenta, device.toner_yellow)}%
                                </span>
                              </div>
                              <div className="grid grid-cols-4 gap-1">
                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/30" title={`Negro: ${device.toner_black}%`}>
                                  <div className={`h-full ${device.toner_black <= 15 ? 'bg-amber-400 animate-pulse' : 'bg-slate-800'}`} style={{ width: `${device.toner_black}%` }} />
                                </div>
                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/30" title={`Cian: ${device.toner_cyan}%`}>
                                  <div className={`h-full ${device.toner_cyan <= 15 ? 'bg-amber-400 animate-pulse' : 'bg-[#00adef]'}`} style={{ width: `${device.toner_cyan}%` }} />
                                </div>
                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/30" title={`Magenta: ${device.toner_magenta}%`}>
                                  <div className={`h-full ${device.toner_magenta <= 15 ? 'bg-amber-400 animate-pulse' : 'bg-[#ec008c]'}`} style={{ width: `${device.toner_magenta}%` }} />
                                </div>
                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/30" title={`Amarillo: ${device.toner_yellow}%`}>
                                  <div className={`h-full ${device.toner_yellow <= 15 ? 'bg-amber-400 animate-pulse' : 'bg-[#f5c400]'}`} style={{ width: `${device.toner_yellow}%` }} />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">n/a</span>
                      )}
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <p className="text-sm font-black text-[#1a2333] tabular-nums">
                          {(device.total_pages || 0).toLocaleString()} <span className="text-[10px] text-slate-500 font-bold uppercase">Total</span>
                        </p>
                        <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-slate-500">
                          <span>{(device.mono_pages || 0).toLocaleString()} M</span>
                          <span className="w-1 h-1 bg-slate-200 rounded-full" />
                          <span className="text-brand">{(device.color_pages || 0).toLocaleString()} C</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowExportModal(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-[32px] shadow-2xl shadow-black/20 w-full max-w-sm p-8 animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-emerald-50 rounded-2xl">
                <Download size={22} className="text-emerald-600" />
              </div>
              <div>
                <h3 className="text-base font-black text-[#1a2333] tracking-tight">Exportar Contadores</h3>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">¿Discriminar mono / color?</p>
              </div>
            </div>
            <div className="flex flex-col gap-3 mb-4">
              <button onClick={() => handleExport(true)} className="w-full py-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors text-sm font-black text-emerald-700">
                Sí, discriminar
              </button>
              <button onClick={() => handleExport(false)} className="w-full py-4 rounded-2xl border-2 border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-black text-slate-700">
                No
              </button>
            </div>
            <button onClick={() => setShowExportModal(false)} className="w-full py-3 rounded-2xl text-slate-500 text-xs font-bold hover:bg-slate-50 transition-colors flex items-center justify-center gap-2">
              <X size={14} /> Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default DeviceInventoryTable;
