export const fmtDateTime = (v: string | null | undefined): string =>
  v ? new Date(v).toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const POLL_LABEL: Record<string, string> = { ews: 'EWS (web embebida)', snmp: 'SNMP', pjl: 'PJL (9100)', ipp: 'IPP (631)', unknown: '—' };
