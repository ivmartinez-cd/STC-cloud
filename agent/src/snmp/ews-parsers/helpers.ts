export function htmlTonerPct(html: string, label: RegExp): number | null {
  const m = html.match(new RegExp(label.source + '[^<]{0,200}(\\d+)\\s*%', 'i'));
  if (!m) return null;
  const pct = parseInt(m[1], 10);
  return isNaN(pct) ? null : Math.min(100, Math.max(0, pct));
}

export function htmlCounter(html: string, label: RegExp): number | null {
  const m = html.match(new RegExp(
    label.source + '[^<]{0,80}<[^>]+>[\\s]*(\\d[\\d,\\.]*)',
    'i',
  ));
  return m ? toInt(m[1]) : null;
}

export function toInt(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = parseInt(v.replace(/[,\.]/g, ''), 10);
  return isNaN(n) ? null : n;
}
