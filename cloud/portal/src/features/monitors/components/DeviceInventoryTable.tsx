import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronRight, CheckSquare, Square, Trash2, RotateCcw, ArrowRightLeft, Radio, X, Download } from 'lucide-react';
import type { Device } from '../../../shared/types/monitor';
import type { AgentDeviceDirectoryRow, AgentDeviceSegment, AgentDeviceSortField, SortDir } from '../types/monitorDetail';
import { api } from '../../../shared/lib/api';
import { fmt } from '../../../shared/lib/formatters';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { useMonitorDeviceDirectory, MONITOR_DEVICE_PAGE_SIZE } from '../hooks/useMonitorDeviceDirectory';
import { useToast } from '../../../store/ToastContext';
import BulkActionBar from '../../../shared/components/BulkActionBar';
import EstadoChip from '../../../shared/components/EstadoChip';
import TonerLevelBars from '../../../shared/components/TonerLevelBars';
import {
  BulkDecommissionModal, BulkRecommissionModal, BulkMoveDevicesModal, BulkMonitorStateModal,
  type BulkActionResult,
} from '../../../shared/components/DeviceLifecycleModals';

interface Props {
  /** Lista COMPLETA (sin paginar) — sólo para exportar CSV de contadores y previsualizar
   * "dar de baja desconectados"; la tabla en pantalla usa `useMonitorDeviceDirectory`
   * (paginada/filtrada/ordenada server-side). */
  devices: Device[];
  monitorName: string;
  agentId: string;
  clientId: string;
  pendingCount: number;
  active: boolean;
  onRefresh?: () => void;
  isReadOnlyViewer?: boolean;
}

// La casilla de selección es una columna propia (28px) — antes compartía la
// pista ancha con "equipo" (el header nunca reservaba un track para ella),
// así que la fila (8 elementos) quedaba corrida una posición contra el
// header (7 elementos): "equipo" invadía la pista de ESTADO, ESTADO la de
// DIRECCIÓN IP, etc. Ahora header y fila usan siempre las mismas 8 pistas.
const GRID_COLS = 'grid-cols-[28px_minmax(220px,1fr)_132px_130px_128px_90px_96px_40px]';

const SEGMENT_OPTIONS: Array<{ value: AgentDeviceSegment; label: string }> = [
  { value: 'todos', label: 'TODOS' },
  { value: 'sin_conexion', label: 'OFFLINE' },
  { value: 'con_alertas', label: 'CON ALERTAS' },
  { value: 'sin_aprobar', label: 'SIN APROBAR' },
];

const SORTABLE_HEADERS: Array<{ field: AgentDeviceSortField; label: string }> = [
  { field: 'consumible_pct', label: 'CONSUMIBLES' },
  { field: 'alerts_count', label: 'ALERTAS' },
  { field: 'last_seen', label: 'ÚLT. REPORTE' },
];

const SORT_LABELS: Record<AgentDeviceSortField, string> = { alerts_count: 'alertas', consumible_pct: 'consumibles', last_seen: 'último reporte' };

function brandBadge(brand: string | null): string {
  return brand ? brand.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '—' : '—';
}

function formatLastReport(iso: string | null): string {
  if (!iso) return 'sin reporte';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.round(hrs / 24)} d`;
}

const ESTADO_LABEL: Record<AgentDeviceDirectoryRow['estado'], string> = {
  en_linea: 'EN LÍNEA', sin_conexion: 'SIN CONEXIÓN', sin_aprobar: 'SIN APROBAR',
};

function AlertsCell({ count }: { count: number }) {
  if (count === 0) return <div className="text-right font-montserrat text-[12.5px] font-semibold text-ink-200">—</div>;
  const cls = count >= 5 ? 'text-brand-severe' : 'text-ink-600';
  return <div className={`text-right font-montserrat text-[12.5px] font-semibold tabular-nums ${cls}`}>{fmt(count)}</div>;
}

function SortableHeader({ label, field, active, dir, onToggle }: {
  label: string; field: AgentDeviceSortField; active: boolean; dir: SortDir; onToggle: (f: AgentDeviceSortField) => void;
}) {
  return (
    <div role="columnheader" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} className="text-right">
      <button
        type="button" onClick={() => onToggle(field)}
        className={`font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] transition-colors duration-150 ease-in-out ${active ? 'text-ink-600' : 'text-ink-300 hover:text-ink-100'}`}
      >
        {label}{active ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
      </button>
    </div>
  );
}

function pageWindow(current: number, totalPages: number): Array<number | 'ellipsis'> {
  const withEnds = new Set<number>([0, totalPages - 1]);
  for (let i = Math.max(0, current - 1); i <= Math.min(totalPages - 1, current + 1); i++) withEnds.add(i);
  const sorted = Array.from(withEnds).sort((a, b) => a - b);
  const result: Array<number | 'ellipsis'> = [];
  let prev: number | null = null;
  for (const p of sorted) {
    if (prev !== null && p - prev > 1) result.push('ellipsis');
    result.push(p);
    prev = p;
  }
  return result;
}

function exportCountersCSV(devices: Device[], monitorName: string, discriminate: boolean) {
  const today = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const rows = ['SERIE;FECHA;TIPO;CLASE;CONTADOR;CLASE;CONTADOR;MOTIVO;OBSERVACIONES;NUMERO_ACTIVO;NUMERO_ETIQUETA;USO_30D;CICLO_TRABAJO'];

  for (const d of devices) {
    const serie = d.serial_number ?? 'S/N';
    const mono = d.mono_pages ?? 0;
    const color = d.color_pages ?? 0;
    const total = d.total_pages ?? (mono + color);
    const isColor = color > 0;
    const inventoryCols = `${d.asset_number ?? ''};${d.asset_tag ?? ''};${d.pages_30d ?? ''};${d.duty_cycle_effective ?? ''}`;

    let row: string;
    if (isColor) {
      row = discriminate
        ? `${serie};${today};7;10;${mono};20;${color};;;${inventoryCols}`
        : `${serie};${today};7;20;${total};;;;;${inventoryCols}`;
    } else {
      row = `${serie};${today};7;10;${mono};;;;;${inventoryCols}`;
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

/** "Equipos detectados por este monitor" (handoff hifi "Monitor — detalle", 25/08/2026)
 * — paginada/filtrada/ordenada server-side vía `useMonitorDeviceDirectory`, mismo
 * patrón que `ClientDevicesTable.tsx`. Conserva las acciones en bloque reales que ya
 * existían (dar de baja/reactivar/mover/estado de monitoreo/exportar CSV) — el handoff
 * pide cerrar la deuda de paginación, no perder funcionalidad ya construida. */
const DeviceInventoryTable = ({ devices, monitorName, agentId, clientId, pendingCount, active, onRefresh, isReadOnlyViewer = false }: Props) => {
  const [showExportModal, setShowExportModal] = useState(false);
  const [approving, setApproving] = useState(false);
  const { showToast } = useToast();
  const dir = useMonitorDeviceDirectory(agentId, active);
  const { rows, total, totalPages, page, setPage, loading, error, refetch, rawQuery, setRawQuery, segment, setSegment, sortField, sortDir, toggleSort, hasActiveFilters, clearFilters } = dir;

  const rowSelection = useRowSelection(rows.map((d) => d.id));
  const [bulkModal, setBulkModal] = useState<'decommission' | 'recommission' | 'move' | 'monitor-state' | null>(null);
  const selectedIds = Array.from(rowSelection.selected);

  const handleBulkDone = (result: BulkActionResult) => {
    rowSelection.clear();
    refetch();
    if (onRefresh) onRefresh();
    const skippedMsg = result.skipped.length > 0 ? ` — ${result.skipped.length} sin aplicar` : '';
    showToast(`${result.count} equipo(s) actualizados${skippedMsg}`, result.count > 0 ? 'success' : 'error');
  };

  const handleDeleteOffline = async () => {
    try {
      const preview = await api.post<{ count: number; devices: Array<{ serial_number: string | null; ip_address: string | null; last_seen: string | null }> }>(
        `/agents/${agentId}/devices/decommission-stale`, { dryRun: true }
      );
      if (preview.count === 0) { showToast('No hay equipos desconectados para dar de baja.', 'warning'); return; }
      const list = preview.devices.map((d) => `• ${d.serial_number ?? d.ip_address ?? '—'}`).join('\n');
      if (!window.confirm(`Se dará de baja ${preview.count} equipo(s) desconectado(s):\n\n${list}\n\n¿Confirmar?`)) return;
      await api.post(`/agents/${agentId}/devices/decommission-stale`, {});
      refetch();
      if (onRefresh) onRefresh();
    } catch (e: unknown) {
      showToast('Error al dar de baja equipos desconectados: ' + ((e as Error).message ?? String(e)), 'error');
    }
  };

  /** Reusa el flujo YA existente de "Dispositivos pendientes de registro" del módulo
   * `clients` (`GET/POST /clients/:id/pending-devices*`, filtrado por `agentId`) — no
   * hace falta un endpoint nuevo en `agents` para esto. */
  const handleApproveDiscovered = async () => {
    if (!window.confirm(`¿Aprobar los ${pendingCount} equipo(s) descubierto(s) por este monitor?`)) return;
    setApproving(true);
    try {
      const pending = await api.get<{ items: Array<{ id: string }>; total: number }>(
        `/clients/${clientId}/pending-devices?agentId=${agentId}&limit=200`
      );
      const deviceIds = pending.items.map((d) => d.id);
      if (deviceIds.length === 0) { showToast('No hay equipos pendientes de aprobar.', 'warning'); return; }
      const result = await api.post<{ registered: number; skipped: Array<{ id: string; reason: string }> }>(
        `/clients/${clientId}/pending-devices/register`, { deviceIds }
      );
      showToast(`${result.registered} equipo(s) aprobado(s)`, 'success');
      refetch();
      if (onRefresh) onRefresh();
    } catch (e: unknown) {
      showToast('Error al aprobar descubiertos: ' + ((e as Error).message ?? String(e)), 'error');
    } finally {
      setApproving(false);
    }
  };

  const handleExport = (discriminate: boolean) => {
    exportCountersCSV(devices, monitorName, discriminate);
    setShowExportModal(false);
  };

  const from = page * MONITOR_DEVICE_PAGE_SIZE + 1;
  const to = Math.min((page + 1) * MONITOR_DEVICE_PAGE_SIZE, total);

  return (
    <>
      <div className="flex items-end justify-between gap-3.5 flex-wrap mb-[26px]">
        <div className="flex items-center gap-[11px]">
          <span className="block h-0.5 w-5 bg-brand" />
          <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.19em] text-ink-550">
            Equipos detectados por este monitor · {fmt(total)}
          </span>
        </div>
        {!isReadOnlyViewer && (
          <div className="flex gap-2.5">
            {devices.length > 0 && (
              <button
                type="button" onClick={() => setShowExportModal(true)}
                className="flex items-center gap-2 rounded-[3px] border border-line-300 bg-white px-3.5 py-2.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-600 hover:bg-surface-btn-hover"
              >
                <Download size={13} /> Exportar
              </button>
            )}
            {pendingCount > 0 && (
              <button
                type="button" onClick={handleApproveDiscovered} disabled={approving}
                className="rounded-[3px] bg-brand px-3.5 py-2.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-white hover:bg-brand-severe disabled:opacity-60"
              >
                {approving ? 'Aprobando…' : `Aprobar ${pendingCount} descubierto${pendingCount === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="rounded-[5px] border border-line-100 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-line-150 px-5 py-3.5">
          <div className="relative min-w-[240px] max-w-[400px] flex-1">
            <Search size={11} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#a9aeb0]" />
            <input
              type="text" value={rawQuery} onChange={(e) => setRawQuery(e.target.value)}
              placeholder="Buscar por serie, modelo o IP…"
              className="w-full rounded-[3px] border border-line-100 bg-surface-input py-[9px] pl-8 pr-3 font-sans text-[12.5px] text-ink-900 outline-none placeholder:text-ink-300"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {SEGMENT_OPTIONS.map((opt) => {
              const isActive = segment === opt.value;
              return (
                <button
                  key={opt.value} type="button" onClick={() => setSegment(opt.value)} aria-pressed={isActive}
                  className={`rounded-[3px] border px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] ${
                    isActive ? 'border-brand-chip-border bg-brand-soft text-brand-accent' : 'border-line-100 bg-white text-ink-100 hover:bg-surface-btn-hover'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div className="ml-auto font-sans text-[11.5px] text-ink-300">
            Ordenado por {SORT_LABELS[sortField]} · {sortDir}
          </div>
        </div>

        {!isReadOnlyViewer && (
          <BulkActionBar count={rowSelection.count} onClear={rowSelection.clear}>
            <button onClick={() => setBulkModal('decommission')} className="flex items-center gap-1.5 rounded-[3px] border border-line-300 bg-white px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover">
              <Trash2 size={12} /> Dar de baja
            </button>
            <button onClick={() => setBulkModal('recommission')} className="flex items-center gap-1.5 rounded-[3px] border border-line-300 bg-white px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover">
              <RotateCcw size={12} /> Reactivar
            </button>
            <button onClick={() => setBulkModal('move')} className="flex items-center gap-1.5 rounded-[3px] border border-line-300 bg-white px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover">
              <ArrowRightLeft size={12} /> Mover
            </button>
            <button onClick={() => setBulkModal('monitor-state')} className="flex items-center gap-1.5 rounded-[3px] border border-line-300 bg-white px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover">
              <Radio size={12} /> Estado de monitoreo
            </button>
            {!isReadOnlyViewer && (
              <button onClick={handleDeleteOffline} className="flex items-center gap-1.5 rounded-[3px] border border-brand-chip-border bg-white px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent transition-colors duration-150 ease-in-out hover:bg-brand-soft">
                <Trash2 size={12} /> Dar de baja desconectados
              </button>
            )}
          </BulkActionBar>
        )}

        <div className="overflow-x-auto">
          <div className="min-w-[1180px]" role="table" aria-label="Equipos detectados por este monitor">
            <div role="row" className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-100 bg-surface-table-head px-5 py-3`}>
              <div className="justify-self-start">
                {!isReadOnlyViewer && (
                  <button onClick={rowSelection.toggleAll} className="text-ink-300 hover:text-ink-100" title="Seleccionar todos">
                    {rowSelection.allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                  </button>
                )}
              </div>
              <div role="columnheader" className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">EQUIPO</div>
              <div role="columnheader" className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">ESTADO</div>
              <div role="columnheader" className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">DIRECCIÓN IP</div>
              {SORTABLE_HEADERS.map((h) => (
                <SortableHeader key={h.field} label={h.label} field={h.field} active={sortField === h.field} dir={sortDir} onToggle={toggleSort} />
              ))}
              <div role="columnheader" />
            </div>

            {error && (
              <div className="flex flex-col items-center justify-center gap-1.5 py-20 text-center">
                <span className="font-sans text-[12.5px] text-ink-900">No se pudo cargar</span>
                <button type="button" onClick={refetch} className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline">Reintentar</button>
              </div>
            )}

            {!error && loading && (
              Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px]`} style={{ height: 54 }}>
                  <span className="h-3 w-3/5 animate-pulse rounded bg-surface-track" />
                  <span className="h-3 w-2/5 animate-pulse rounded bg-surface-track" />
                  <span className="h-3 w-1/2 animate-pulse rounded bg-surface-track" />
                  <span className="h-3 w-3/5 justify-self-end animate-pulse rounded bg-surface-track" />
                  <span className="h-3 w-3/5 justify-self-end animate-pulse rounded bg-surface-track" />
                  <span className="h-3 w-2/5 justify-self-end animate-pulse rounded bg-surface-track" />
                  <span />
                </div>
              ))
            )}

            {!error && !loading && rows.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-1.5 py-20 text-center">
                <span className="font-sans text-[12.5px] text-ink-300">No se han descubierto equipos en este segmento</span>
                {hasActiveFilters && (
                  <button type="button" onClick={clearFilters} className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline">Limpiar filtros</button>
                )}
              </div>
            )}

            {!error && !loading && rows.map((d) => (
              <div key={d.id} className={`group grid ${GRID_COLS} min-h-[54px] items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px] transition-colors duration-150 ease-in-out hover:bg-surface-hover`}>
                {!isReadOnlyViewer && (
                  <button onClick={() => rowSelection.toggle(d.id)} className="justify-self-start text-ink-300 hover:text-brand">
                    {rowSelection.selected.has(d.id) ? <CheckSquare size={14} className="text-brand" /> : <Square size={14} />}
                  </button>
                )}
                <Link to={`/devices/${d.id}`} className="flex min-w-0 items-center gap-3">
                  <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[3px] border border-line-avatar bg-surface-avatar font-montserrat text-[9px] font-bold text-ink-400">
                    {brandBadge(d.brand)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-sans text-[12.5px] font-semibold text-ink-900">{d.model ?? d.name ?? 'Equipo'}</div>
                    <div className="truncate font-sans text-[11px] text-ink-300">Serie {d.serial_number ?? '—'}</div>
                  </div>
                </Link>

                <EstadoChip variant={d.estado === 'en_linea' ? 'neutral' : 'attention'} label={ESTADO_LABEL[d.estado]} />
                <div className="min-w-0 truncate font-mono text-[11.5px] text-ink-700">{d.ip_address ?? '—'}</div>
                <TonerLevelBars black={d.toner_black} cyan={d.toner_cyan} magenta={d.toner_magenta} yellow={d.toner_yellow} />
                <AlertsCell count={d.alerts_count} />
                <div className="text-right font-sans text-[12px] text-ink-400">{formatLastReport(d.last_seen)}</div>

                <div className="flex justify-end">
                  <Link to={`/devices/${d.id}`} className="flex h-[26px] w-[26px] items-center justify-center rounded-[3px] border border-line-avatar text-ink-300 transition-colors duration-150 ease-in-out group-hover:border-line-300 group-hover:text-ink-100">
                    <ChevronRight size={13} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 py-3.5">
            <div className="font-sans text-xs text-ink-400">{fmt(from)}–{fmt(to)} de {fmt(total)} equipos</div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button" disabled={page === 0} onClick={() => setPage(page - 1)}
                className="rounded-[3px] border border-line-avatar px-[11px] py-[7px] font-montserrat text-[10.5px] font-semibold uppercase tracking-[.05em] text-ink-200 disabled:cursor-default enabled:border-line-300 enabled:text-ink-600 enabled:hover:bg-surface-btn-hover"
              >
                ANTERIOR
              </button>
              {pageWindow(page, totalPages).map((p, i) => p === 'ellipsis' ? (
                <span key={`e${i}`} className="px-1 font-sans text-xs text-ink-200">…</span>
              ) : (
                <button
                  key={p} type="button" onClick={() => setPage(p)} aria-current={p === page ? 'page' : undefined}
                  className={`rounded-[3px] px-[11px] py-[7px] font-montserrat text-[10.5px] ${p === page ? 'bg-brand-soft font-bold text-brand-accent' : 'font-semibold text-ink-100 hover:bg-surface-btn-hover'}`}
                >
                  {p + 1}
                </button>
              ))}
              <button
                type="button" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}
                className="rounded-[3px] border border-line-300 px-[11px] py-[7px] font-montserrat text-[10.5px] font-semibold uppercase tracking-[.05em] text-ink-600 hover:bg-surface-btn-hover disabled:cursor-default disabled:border-line-avatar disabled:text-ink-200 disabled:hover:bg-transparent"
              >
                SIGUIENTE
              </button>
            </div>
          </div>
        )}
      </div>

      {showExportModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(20,20,20,.55)' }} onClick={() => setShowExportModal(false)}>
          <div className="w-full max-w-sm rounded-[5px] bg-white p-6" style={{ boxShadow: '0 20px 60px rgba(0,0,0,.25)' }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-5">
              <h3 className="font-montserrat text-[15px] font-extrabold text-ink-900">Exportar contadores</h3>
              <p className="mt-1 font-sans text-[12.5px] text-ink-300">¿Discriminar mono / color?</p>
            </div>
            <div className="mb-4 flex flex-col gap-2.5">
              <button onClick={() => handleExport(true)} className="w-full rounded-[3px] bg-brand py-3 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe">Sí, discriminar</button>
              <button onClick={() => handleExport(false)} className="w-full rounded-[3px] border border-line-300 bg-white py-3 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover">No</button>
            </div>
            <button onClick={() => setShowExportModal(false)} className="flex w-full items-center justify-center gap-2 rounded-[3px] py-2 font-montserrat text-[10.5px] font-semibold uppercase tracking-[.08em] text-ink-300 transition-colors duration-150 ease-in-out hover:text-ink-600">
              <X size={13} /> Cancelar
            </button>
          </div>
        </div>
      )}

      <BulkDecommissionModal isOpen={bulkModal === 'decommission'} onClose={() => setBulkModal(null)} onDone={handleBulkDone} deviceIds={selectedIds} />
      <BulkRecommissionModal isOpen={bulkModal === 'recommission'} onClose={() => setBulkModal(null)} onDone={handleBulkDone} deviceIds={selectedIds} />
      <BulkMoveDevicesModal isOpen={bulkModal === 'move'} onClose={() => setBulkModal(null)} onDone={handleBulkDone} deviceIds={selectedIds} currentClientId={clientId} currentAgentId={agentId} />
      <BulkMonitorStateModal isOpen={bulkModal === 'monitor-state'} onClose={() => setBulkModal(null)} onDone={handleBulkDone} deviceIds={selectedIds} />
    </>
  );
};

export default DeviceInventoryTable;
