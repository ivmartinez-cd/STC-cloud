/**
 * Fuente única de la versión del agente. Todos los módulos que necesitan
 * identificarse (heartbeat, --status, updater, consola) importan de acá en
 * vez de declarar su propio literal — evita que diverjan entre sí.
 */
export const VERSION = '1.3.0';
