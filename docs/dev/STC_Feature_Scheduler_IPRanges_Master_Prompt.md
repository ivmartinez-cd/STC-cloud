# Master Prompt: Programación Horaria Avanzada y Multi-Rango de IPs - STC Cloud

> **Histórico/superado (agosto 2026)**: ninguna de las dos features de este
> prompt se terminó construyendo tal como está especificado acá. El rango
> múltiple de IPs sí se implementó, pero con un diseño distinto (CIDR +
> exclusiones compiladas del lado cloud, ver `services/ipRangeSpec.ts`) al
> "array simple de {start,end}" descripto abajo. El planificador
> `scan_schedule` (Modo Intervalo / Modo Custom) se implementó tal cual el
> 23/05/2026 y se reemplazó deliberadamente 4 días después por el modelo de
> 3 loops HP SDS-aligned + horario laboral configurable
> (`services/businessHours.ts`) — el código del scheduler custom se eliminó
> como código muerto en agosto de 2026 (ver
> `docs/dev/STC_Gap_Analysis_vs_HP_SDS_2026-08.md`). Se conserva este archivo
> como registro histórico del diseño original, no como especificación
> vigente.

Este archivo contiene las especificaciones y la directiva técnica para que un modelo de IA o un desarrollador sénior implemente la refactorización completa del planificador de escaneo (*Advanced Scheduling*) y el soporte de múltiples rangos de IP en el panel de configuración de agentes, cumpliendo estrictamente con las directrices de `docs/dev/ANTIGRAVITY_SKILLS.md`.

---

## 📋 Instrucciones de Uso
1. Copie el contenido del bloque **"MASTER PROMPT"** ubicado a continuación.
2. Péguelo en el chat de su asistente de IA junto con los archivos del portal y el agente.
3. El asistente guiará o ejecutará la refactorización de forma precisa y paso a paso.

---

```markdown
# ROLE: PRINCIPAL FULL-STACK ENGINEER & SECURE MPS ARCHITECT

Actúa como un Desarrollador Principal y Arquitecto de Sistemas altamente detallado y meticuloso. Tu objetivo es implementar dos mejoras críticas solicitadas por el cliente en el monorepo de **STC Cloud**:

1.  **Múltiples Rangos de IP en Ajustes:** Permitir la configuración de un array de rangos de IP (Initial/Final IP) en el panel de Ajustes de `MonitorDetail.tsx`, tal como se permite en la creación de agentes (`CreateAgentModal.tsx` o `ConfigAgentModal.tsx`).
2.  **Planificador de Escaneo Avanzado (Advanced Scheduling):** Reemplazar la frecuencia simple de intervalos en minutos por un sistema híbrido que permita:
    *   **Modo Intervalo:** Escanear cada N minutos (15, 30, 60, 1440 min).
    *   **Modo Programación Personalizada (Cron/Calendario):** Escanear a horas exactas (ej: `09:00` y `15:00`) en días específicos de la semana (ej: Lunes a Viernes).

Debes ejecutar la refactorización de manera uniforme en la Base de Datos, las APIs de Backend (Fastify), el Portal Frontend (React) y el Agente DCA en segundo plano, respetando al 100% las reglas de **TypeScript Estricto (cero any)**, **JSDocs profesionales** y **Trazabilidad en `audit_logs`** exigidas en `ANTIGRAVITY_SKILLS.md`.

---

## 📐 ESPECIFICACIÓN ARQUITECTÓNICA DE LOS COMPONENTES

### 1. 🗄️ CAPA DE PERSISTENCIA Y APIS (BACKEND - Fastify & Knex)
*   **Esquema de Base de Datos:**
    *   La tabla `agents` ya tiene la columna JSONB `ip_ranges`. Modifica la lógica para que en la edición se acepte y actualice el array `IpRange[]` en lugar de mapear solo `ipStart`/`ipEnd`.
    *   Crea una nueva columna JSONB `scan_schedule` en la tabla `agents` mediante una migración robusta o actualízala dinámicamente si ya existe. El esquema JSON de la columna debe cumplir con la siguiente interfaz:
        ```typescript
        export interface ScanSchedule {
          mode: 'interval' | 'custom';
          interval_minutes?: number;   // ej: 15, 30, 60
          custom_days?: number[];      // [1, 2, 3, 4, 5] (1=Lunes, 7=Domingo)
          custom_times?: string[];     // ["09:00", "15:00"] (formato HH:MM)
        }
        ```
*   **Controladores y Servicios:**
    *   Actualiza `portalAgentController.ts` y `agentService.ts` para que al guardar la configuración, se valide y persista `ip_ranges` (array completo) y `scan_schedule` (objeto JSON validado).
    *   Garantiza que toda actualización registre el correspondiente evento `UPDATE_CONFIG` en `audit_logs` con `user_id`, `ip_address` y la metadata de los cambios.

### 2. 🎨 INTERFAZ DE USUARIO (PORTAL FRONTEND - React)
*   **Parámetros de Red Multi-Rango (`MonitorDetail.tsx`):**
    *   Reemplaza los campos estáticos de entrada de texto `IP Inicial` e `IP Final` por una **tabla o lista de rangos dinámica** (similar a `ConfigAgentModal.tsx`), con botones para *"Agregar Rango"* y *"Eliminar"* (`x`).
    *   Implementa validaciones de IPs sintácticas nativas en caliente para cada rango agregado antes de enviar.
*   **Planificador en Configuración (`MonitorDetail.tsx`):**
    *   Reemplaza el selector único de "Frecuencia de Escaneo" por un selector de tipo de frecuencia: *"Por Intervalo"* o *"Por Horario Personalizado"*.
    *   Si es *"Por Intervalo"*, muestra el dropdown clásico de minutos.
    *   Si es *"Por Horario Personalizado"*:
        *   Muestra un grupo de botones/checkboxes para seleccionar los **Días de la semana** (L, M, M, J, V, S, D).
        *   Muestra un controlador dinámico para agregar **Horas específicas** (ej: un input de tipo `time` con un botón `+` para listar múltiples horas como `09:00`, `15:00` y permitir borrarlas).
    *   Asegura que el hook `useMonitorDetail.ts` y la llamada a `onSave` propaguen correctamente este nuevo payload.

### 3. 🌐 ORQUESTADOR DE ESCANEO LOCAL (AGENT DCA - Node.js Daemon)
*   **Configuración y Sincronización (`agent/src/core/main.ts`):**
    *   El agente debe recibir `scan_schedule` al consultar `/api/v1/agents/config` o recibir actualizaciones por el canal WebSocket.
    *   Guarda este objeto serializado en el archivo cifrado `config.enc` local.
*   **Algoritmo de Ejecución Resiliente (El motor de escaneo):**
    *   En lugar de un simple `setTimeout` ciego, reescribe la orquestación del scanning en `agent/src/core/main.ts` para que evalúe dinámicamente el calendario:
        *   **Algoritmo por Minuto:** Levanta un temporizador interno rápido que despierte cada 60 segundos (`setInterval` o similar).
        *   **Condición de Escaneo:** En cada minuto, obtiene la hora actual en string `"HH:MM"` y el día de la semana (`new Date().getDay()`).
        *   **Evaluación del Schedule:**
            *   Si el modo es `'interval'`, evalúa si el delta de tiempo desde el último escaneo exitoso en SQLite es mayor o igual a `interval_minutes`.
            *   Si el modo es `'custom'`, evalúa si el día de la semana actual está en `custom_days` Y si la hora actual está listada en `custom_times` (y asegura mediante una bandera o timestamp que solo se ejecute una única vez por cada minuto coincidente para evitar escaneos repetidos en bucle).
        *   Si se cumple la condición, dispara la cascada de escaneo `snmpScan(...)` asíncrona de forma segura en segundo plano.

---

## 📋 PROCEDIMIENTO DE TRABAJO SUGERIDO

### Paso 1: Backend & Database
1. Crea una migración Knex para añadir `scan_schedule` (JSONB) en la tabla `agents` (o modifícala si la base está en sincronización directa).
2. Refactoriza el tipado en `shared/types.ts` o en las interfaces del backend para admitir `ScanSchedule`.
3. Integra las validaciones del esquema en `portalAgentRoutes.ts` para rechazar estructuras malformadas.

### Paso 2: Frontend Refactor (Portal)
1. Modifica la sección de Ajustes en `MonitorDetail.tsx` para importar los componentes de lista dinámica de rangos de IP y la nueva UI del planificador.
2. Actualiza los tipos de datos en `cloud/portal/src/types/monitor.ts` y ajusta `useMonitorDetail.ts` para serializar adecuadamente la programación horaria.

### Paso 3: Agent Refactor
1. Actualiza el mapper de configuración local y los modelos de lectura en `agent/src/core/config.ts` para persistir `ScanSchedule`.
2. Reescribe la lógica de disparo de escaneo en `agent/src/core/main.ts` con el planificador dinámico por minuto, garantizando un manejo de errores robusto.

### Paso 4: QA & Compilación
1. Corre la validación del build de TypeScript en ambos entornos: `npm run build -w cloud` y `npm run build -w agent`.
2. Corre la suite de tests unitarios del agente para asegurar que no se hayan roto las lecturas offline de SQLite.

Procede con la implementación garantizando un código de alta costura informática, 100% tipado y autolimpiable.
```
