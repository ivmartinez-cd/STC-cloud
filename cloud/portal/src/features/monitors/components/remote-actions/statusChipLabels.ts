import type { StatusChipTone } from './StatusChip';

/** Lote (`status` de `remote_action_batches`) → tono + etiqueta. */
export function batchStatusChip(status: string): { label: string; tone: StatusChipTone } {
  switch (status) {
    case 'sent': return { label: 'ENVIADO', tone: 'attention' };
    case 'completed': return { label: 'COMPLETADO', tone: 'neutral' };
    case 'completed_with_errors': return { label: 'COMPLETADO CON ERRORES', tone: 'severe' };
    case 'cancelled': return { label: 'CANCELADO', tone: 'muted' };
    default: return { label: 'PROGRAMADO', tone: 'idle' };
  }
}

/** Item del lote (`command_status`: success/error/pending/sent/null) → tono + etiqueta. */
export function itemStatusChip(commandStatus: string | null): { label: string; tone: StatusChipTone } {
  if (commandStatus === 'success') return { label: 'COMPLETADO', tone: 'neutral' };
  if (commandStatus === 'error') return { label: 'ERROR', tone: 'severe' };
  return { label: 'EN COLA', tone: 'attention' };
}
