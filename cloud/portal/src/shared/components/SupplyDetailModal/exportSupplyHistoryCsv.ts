import type { SupplyHistory } from '../../types/supplyHistory';

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function slug(v: string | null): string {
  return (v ?? 'consumible').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'consumible';
}

/**
 * Exporta la serie que se está viendo (no la completa): lo que se descarga
 * es lo que el gráfico muestra con la ventana elegida. Mismo formato BOM +
 * UTF-8 que el resto de los CSV del portal (Excel en español).
 */
export function exportSupplyHistoryCsv(history: SupplyHistory, visibleDays: SupplyHistory['points']): void {
  const header = ['Fecha', 'Nivel %', 'Contador total', 'Monocromo', 'Color'];
  const lines = [header, ...visibleDays.map((p) => [
    p.day, p.level ?? '', p.total_pages ?? '', p.mono_pages ?? '', p.color_pages ?? '',
  ])];
  const csv = lines.map((row) => row.map(csvField).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug(history.device.serial_number)}-${slug(history.supply.description)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
