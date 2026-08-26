/** Puerto de sólo-lectura hacia `modules/system-settings` — igual criterio que
 * `AuditLogWriter`: el application layer nunca importa `knex` directo (regla
 * `arch-application`), así que el acceso a la base pasa por un puerto chico
 * en vez del `Knex` crudo. */
export interface SystemSettingsReader {
  /** Umbral global de consumible (Configuración del sistema) — default de
   * `supply_request_threshold_pct` para clientes nuevos, ver `CreateClientUseCase`. */
  getSupplyThresholdCriticalPct(): Promise<number>;
}
