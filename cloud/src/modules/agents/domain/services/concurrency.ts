import type { IncomingReading } from "../entities/agent";

/**
 * Ejecuta `fn` sobre `items` con un techo de tareas concurrentes (no todas a
 * la vez, no una por una) — pool simple de N workers sin librería externa.
 */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await fn(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

/**
 * Agrupa por identidad CRUDA (`device_id`/`ip` tal como los manda el agente)
 * para que dos lecturas del MISMO dispositivo dentro de un lote se procesen
 * en orden estricto entre sí (evita un lost-update) — grupos DISTINTOS corren
 * en paralelo.
 */
export function groupReadingsByIdentity(readings: IncomingReading[]): Map<string, IncomingReading[]> {
  const groups = new Map<string, IncomingReading[]>();
  for (const r of readings) {
    const rawKey = (r.device_id || r.ip || "").trim().toLowerCase() || `__no-identity-${groups.size}`;
    const group = groups.get(rawKey);
    if (group) group.push(r); else groups.set(rawKey, [r]);
  }
  return groups;
}
