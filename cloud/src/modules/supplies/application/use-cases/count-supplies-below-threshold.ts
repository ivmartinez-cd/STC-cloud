import type { SuppliesRepository } from "../../domain/repositories/supplies-repository";
import { buildFleetRows } from "./build-fleet-rows";

/** Cuántos ítems de TODA la flota caen a partir de `pct%` — usado por el
 * endpoint de impacto de Configuración (handoff hifi #3, fase 2, 26/08/2026)
 * para mostrar "esto afecta a N ítems" mientras el admin mueve el slider,
 * ANTES de guardar. Deliberadamente no reusa `CRITICAL_PCT`/`LOW_PCT` —
 * son los umbrales fijos de la vista de Consumibles, un concepto distinto
 * del umbral global configurable. */
export class CountSuppliesBelowThresholdUseCase {
  constructor(private readonly repo: SuppliesRepository) {}

  async execute(pct: number): Promise<number> {
    const rows = await buildFleetRows(this.repo, {});
    return rows.filter((r) => r.percentage != null && r.percentage <= pct).length;
  }
}
