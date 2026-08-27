import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronRight, CheckSquare, Square, Trash2, RotateCcw, ArrowRightLeft, Radio, Download } from 'lucide-react';
import type { Device } from '../../../shared/types/monitor';
import { api } from '../../../shared/lib/api';
import { fmt } from '../../../shared/lib/formatters';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { useMonitorDeviceDirectory } from '../hooks/useMonitorDeviceDirectory';
import { useFitRows } from '../../../shared/hooks/useFitRows';
import { useToast } from '../../../store/ToastContext';
import BulkActionBar from '../../../shared/components/BulkActionBar';
import EstadoChip from '../../../shared/components/EstadoChip';
import TonerLevelBars from '../../../shared/components/TonerLevelBars';
import {
  BulkDecommissionModal, BulkRecommissionModal, BulkMoveDevicesModal, BulkMonitorStateModal,
  type BulkActionResult,
} from '../../../shared/components/DeviceLifecycleModals';
import { GRID_COLS, SEGMENT_OPTIONS, SORTABLE_HEADERS, SORT_LABELS, ESTADO_LABEL, brandBadge, formatLastReport, exportCountersCSV } from './deviceInventoryHelpers';
import { AlertsCell, SortableHeader } from './DeviceInventoryTableCells';
import ExportCountersModal from './ExportCountersModal';
import DeviceInventoryPagination from './DeviceInventoryPagination';

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

/** "Equipos detectados por este monitor" (handoff hifi "Monitor — detalle", 25/08/2026)
 * — paginada/filtrada/ordenada server-side vía `useMonitorDeviceDirectory`, mismo
 * patrón que `ClientDevicesTable.tsx`. Conserva las acciones en bloque reales que ya
 * existían (dar de baja/reactivar/mover/estado de monitoreo/exportar CSV) — el handoff
 * pide cerrar la deuda de paginación, no perder funcionalidad ya construida. */
const DeviceInventoryTable = ({ devices, monitorName, agentId, clientId, pendingCount, active, onRefresh, isReadOnlyViewer = false }: Props) => {
  const [showExportModal, setShowExportModal] = useState(false);
  const [approving, setApproving] = useState(false);
  const { showToast } = useToast();
  const fit = useFitRows({ estimate: 54 });
  const dir = useMonitorDeviceDirectory(agentId, active, fit.rows);
  const { rows, total, totalPages, pageSize, page, setPage, loading, error, refetch, rawQuery, setRawQuery, segment, setSegment, sortField, sortDir, toggleSort, hasActiveFilters, clearFilters } = dir;

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

  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-end justify-between gap-3.5 flex-wrap mb-4">
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

      <div className="flex min-h-0 flex-1 flex-col rounded-[5px] border border-line-100 bg-white">
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

        <div ref={fit.ref} className="min-h-0 flex-1 overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[1180px]" role="table" aria-label="Equipos detectados por este monitor">
            <div role="row" data-fit-fixed className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-100 bg-surface-table-head px-5 py-3`}>
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
              Array.from({ length: fit.rows }).map((_, i) => (
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
              <div key={d.id} data-fit-row className={`group grid ${GRID_COLS} min-h-[54px] items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px] transition-colors duration-150 ease-in-out hover:bg-surface-hover`}>
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
        </div>

        {total > 0 && (
          <DeviceInventoryPagination page={page} totalPages={totalPages} total={total} from={from} to={to} onPageChange={setPage} />
        )}
      </div>

      {showExportModal && (
        <ExportCountersModal onExport={handleExport} onClose={() => setShowExportModal(false)} />
      )}

      <BulkDecommissionModal isOpen={bulkModal === 'decommission'} onClose={() => setBulkModal(null)} onDone={handleBulkDone} deviceIds={selectedIds} />
      <BulkRecommissionModal isOpen={bulkModal === 'recommission'} onClose={() => setBulkModal(null)} onDone={handleBulkDone} deviceIds={selectedIds} />
      <BulkMoveDevicesModal isOpen={bulkModal === 'move'} onClose={() => setBulkModal(null)} onDone={handleBulkDone} deviceIds={selectedIds} currentClientId={clientId} currentAgentId={agentId} />
      <BulkMonitorStateModal isOpen={bulkModal === 'monitor-state'} onClose={() => setBulkModal(null)} onDone={handleBulkDone} deviceIds={selectedIds} />
    </div>
  );
};

export default DeviceInventoryTable;
