import { type EwsData } from './types';
import { htmlCounter } from './helpers';

// ─── Generic parser (common counter label patterns) ──────────────────────────

export function parseGeneric(html: string): Partial<EwsData> {
  const total = htmlCounter(html, /Total\s+(?:Pages|Impressions|Count|Print)/i)
    ?? htmlCounter(html, /TOTAL/i);
  const mono  = htmlCounter(html, /Mono(?:chrome)?\s+(?:Pages|Count|Total)/i)
    ?? htmlCounter(html, /Black\s+(?:Pages|Count)/i);
  const color = htmlCounter(html, /Color\s+(?:Pages|Count|Total)/i);

  const modelMatch = html.match(/(?:Model|Product)\s*(?:Name)?[\s:]+([A-Za-z0-9][A-Za-z0-9 \-]{3,50})/i);
  const serialMatch = html.match(/(?:Serial\s*(?:Number)?|S\/N)\s*:?\s*([A-Z0-9]{6,20})/i);

  return {
    model:      modelMatch  ? modelMatch[1].trim()  : undefined,
    serial:     serialMatch ? serialMatch[1].trim() : undefined,
    totalPages: total  ?? undefined,
    monoPages:  mono   ?? undefined,
    colorPages: color  ?? undefined,
  };
}
