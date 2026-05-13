# Auditoría Frontend — STC Cloud Portal
**Fecha:** 2026-05-11 | **Auditor:** Principal Frontend Architect  
**Scope:** `cloud/portal/src` (25 archivos, ~5,200 líneas de código)

---

## RESUMEN EJECUTIVO

El portal está bien estructurado para un producto en fase MVP avanzada. El sistema de diseño *Design 2026* es sólido y consistente en un 80% del código. Existen **2 bugs críticos funcionales** que deben corregirse antes de producción, varias inconsistencias visuales que degradan el *premium feel*, y oportunidades de refactor que reducirán deuda técnica significativamente.

**Estado general:** `LISTO CONDICIONAL` — corregir los 2 críticos y aplicar el checklist de cierre.

---

## [CRÍTICO] Bugs Funcionales o Visuales Graves

---

### CRIT-01 | URL hardcodeada de Vercel en MonitorDetail.tsx
**Archivo:** `pages/MonitorDetail.tsx` — líneas 573 y 577  
**Severidad:** Alta — En producción con dominio propio, el agente recibirá la URL equivocada y fallará la activación.

**Código actual:**
```typescript
// MonitorDetail.tsx:573
STC-Agent.exe --activate {regenKey.key} --url https://stc-cloud-portal.vercel.app

// MonitorDetail.tsx:577
navigator.clipboard.writeText(`STC-Agent.exe --activate ${regenKey.key} --url https://stc-cloud-portal.vercel.app`);
```

**Referencia correcta (ya usada en otros archivos):**
- `Agents.tsx:437` — usa `{window.location.origin}` ✓  
- `Monitors.tsx:383` — usa `{window.location.origin}` ✓

**Fix:**
```typescript
// MonitorDetail.tsx:573
STC-Agent.exe --activate {regenKey.key} --url {window.location.origin}

// MonitorDetail.tsx:577
navigator.clipboard.writeText(`STC-Agent.exe --activate ${regenKey.key} --url ${window.location.origin}`);
```

---

### CRIT-02 | JWT almacenado en localStorage (vulnerable a XSS)
**Archivo:** `lib/api.ts` — línea 4  
**Severidad:** Alta — Cualquier script inyectado (extensiones, CDNs comprometidas, XSS en futuras features) puede robar tokens.

**Código actual:**
```typescript
const token = localStorage.getItem('stc_token');
```

**Impacto:** Sin mitigación adicional (CSP estricto, sanitización total de inputs), localStorage no es apropiado para tokens de sesión.

**Fix recomendado:** Migrar a `httpOnly` cookies gestionadas por el backend. Si eso no es inmediato viable, añadir al menos:
1. CSP header estricto en el servidor (`script-src 'self'`)
2. Rotación de token por sesión
3. Validación de `iat`/`exp` en el cliente antes de cada request

---

### CRIT-03 | Paleta de colores bifurcada — CSS variable ignorada
**Archivos:** `index.css` vs todos los componentes en `pages/`  
**Severidad:** Media-Alta — Produce divergencia visual que empeorará con el tiempo.

`index.css` define correctamente:
```css
--color-primary: #2563eb;  /* Modern Blue */
```

Sin embargo, **todos los componentes** usan directamente `#2980b9` como clase Tailwind:
```typescript
// ClientDetail.tsx:183, 188, 196, 214, 215, 251, 256, 263... (50+ ocurrencias)
className="text-[#2980b9]"
className="border-l-[#2980b9]"
className="bg-blue-50 text-[#2980b9]"
```

`#2563eb` (Tailwind blue-600) y `#2980b9` son colores distintos. El sistema de diseño tiene **dos azules primarios compitiendo**. En pantallas de alta gama la diferencia es notoria.

**Fix:** Elegir uno y estandarizar. Recomendación: mantener `#2980b9` (más cálido, más *premium*) y actualizar `index.css`:
```css
--color-primary: #2980b9;
```
Luego definir en `tailwind.config.js`:
```js
colors: { brand: '#2980b9' }
```
Y reemplazar todas las ocurrencias `text-[#2980b9]` → `text-brand`.

---

### CRIT-04 | `loadAgents` definida pero no usada en el `useEffect` inicial
**Archivo:** `pages/Agents.tsx` — líneas 89–105  
**Severidad:** Media — Lógica duplicada. El `useEffect` hace fetch directo en lugar de llamar a `loadAgents`, lo que significa que el botón "Refrescar" y la carga inicial son caminos de código distintos. Un bug en uno no aplica al otro.

**Código actual:**
```typescript
const loadAgents = useCallback(async () => { /* fetch agents */ }, [showToast]);

useEffect(() => {
  Promise.all([
    api.get<Agent[]>('/agents').then(...),   // ← duplica loadAgents
    api.get<Client[]>('/clients').then(...),
  ]).finally(() => setLoading(false));
}, [showToast]);
```

**Fix:**
```typescript
useEffect(() => {
  Promise.all([loadAgents(), loadClients()])
    .finally(() => setLoading(false));
}, [loadAgents, loadClients]);
```

---

## [UX/UI] Mejoras de Diseño para Elevar el Premium Feel

---

### UX-01 | Ausencia de `aria-label` en acciones destructivas
Botones de "Revocar", "Eliminar", "Confirmar" no tienen `aria-label`. Un screen reader o auditoría de accesibilidad (Lighthouse) los reportará como fallos. Impacto directo en clientes enterprise que usan tecnologías asistivas.

**Archivos afectados:** `Agents.tsx`, `Monitors.tsx`, `ClientDetail.tsx`, `ConfirmModal.tsx`

**Fix rápido:**
```typescript
<button aria-label="Revocar agente" onClick={...}>
  <ShieldOff size={16} />
</button>
```

---

### UX-02 | Empty states incompletos en Agents.tsx
Cuando no hay agentes registrados, se muestra la tabla vacía sin estado visual. Todos los demás pages tienen empty states con iconos y mensajes contextuales. Este es el único que lo omite.

**Fix:** Añadir bloque condicional antes de la tabla:
```tsx
{filtered.length === 0 && !loading && (
  <div className="text-center py-20 text-slate-400">
    <Server size={48} className="mx-auto mb-4 opacity-30" />
    <p className="font-semibold">Sin agentes registrados</p>
    <p className="text-sm mt-1">Crea un agente para comenzar el monitoreo</p>
  </div>
)}
```

---

### UX-03 | No hay feedback visual en `delete` de agente durante la operación
Al revocar un agente, el botón no cambia de estado durante el proceso. El usuario puede hacer doble-click.

**Código actual:** `revoking` state existe (`useState<string | null>(null)`) pero no se aplica al botón trigger (solo al modal).

**Fix:** Deshabilitar el botón de abrir el ConfirmModal mientras `revoking === agent.id`.

---

### UX-04 | Modales sin animación de entrada/salida
Los modales aparecen instantáneamente (`opacity-0` a `opacity-100` sin transición), lo que se siente brusco en un producto *premium*. Los toasts sí tienen animación (`animate-slide-up`).

**Fix — agregar a `index.css`:**
```css
@keyframes modalIn {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.animate-modal-in {
  animation: modalIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
```
Aplicar `.animate-modal-in` al div interior de cada modal.

---

### UX-05 | Tablas sin ordenamiento ni paginación real
Las tablas de Agents, Clients, MonitorDevices muestran todos los registros con un límite de 100/5000 hardcodeado. Con carga real de datos (>50 registros) la experiencia se degrada.

**Prioridad:** Media. Implementar al menos `sort by column` en las cabeceras de tabla (sin backend, solo `Array.sort` local).

---

### UX-06 | `formatLastSeen` en Agents.tsx no se actualiza en tiempo real
La función recalcula la distancia temporal solo en el momento del render. Si el panel está abierto 10 minutos, sigue mostrando "Hace 2 min" aunque hayan pasado 12.

**Fix:** Añadir un `setInterval` de 60 segundos que fuerce un re-render superficial del componente (o un `useTime` hook que devuelva `Date.now()` actualizado).

---

### UX-07 | Input de búsqueda sin debounce
El filtrado en `Agents.tsx` y `Clients.tsx` se ejecuta en cada keystroke con `.filter()` sobre el array completo. Con 200+ registros puede sentirse lento en dispositivos de bajo rendimiento.

**Fix:** Añadir `useMemo` para el filtrado:
```typescript
const filtered = useMemo(
  () => agents.filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase())),
  [agents, searchTerm]
);
```

---

## [REFACTOR] Sugerencias de Optimización de Código

---

### REF-01 | Agents.tsx — 804 líneas, debe fragmentarse
Es el componente más grande y contiene 4 responsabilidades distintas que deberían ser componentes separados:

| Sub-componente propuesto | Líneas aprox. |
|--------------------------|---------------|
| `AgentTable.tsx` | 200 |
| `CreateAgentModal.tsx` | 200 |
| `ConfigAgentModal.tsx` | 150 |
| `RegenKeyModal.tsx` | 120 |
| `Agents.tsx` (orquestador) | ~134 |

---

### REF-02 | Duplicación de lógica de formato de fechas
Tres patrones distintos para formatear fechas en el codebase:
- `formatLastSeen()` — `Agents.tsx:31`
- `formatDate()` — `MonitorDetail.tsx` (función propia)
- `.toLocaleTimeString()` inline — `DeviceDetail.tsx:228`

**Fix:** Crear `src/lib/formatters.ts`:
```typescript
export const formatRelativeTime = (ts: string | null): string => { ... }
export const formatDate = (ts: string): string => { ... }
export const formatDateTime = (ts: string): string => { ... }
```

---

### REF-03 | `api.ts` sin timeout ni retry
Una red lenta hará que los `fetch` queden pendientes indefinidamente. El usuario verá el spinner forever.

**Fix:**
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 15_000);
const res = await fetch(url, { ...init, signal: controller.signal });
clearTimeout(timeout);
```

---

### REF-04 | Constantes mágicas dispersas
Valores que deben estar centralizados en `src/lib/constants.ts`:

| Valor | Ubicación actual |
|-------|-----------------|
| `5 * 60 * 1000` (offline threshold) | `Agents.tsx:44` |
| `60_000` (poll interval) | `Dashboard.tsx:94` |
| `5000` (report record limit) | `Reports.tsx:65` |
| `100` (display limit) | `Reports.tsx:218` |
| `'public'` (SNMP default) | `Agents.tsx:53`, `MonitorDetail.tsx` (múltiples) |

---

### REF-05 | z-index sin escala definida
Valores manuales `z-[50]`, `z-[60]`, `z-[70]`, `z-[100]`, `z-[150]`, `z-[200]` distribuidos en múltiples archivos. En el futuro, un modal sobre otro puede romperse silenciosamente.

**Fix — definir en `tailwind.config.js`:**
```js
zIndex: {
  'sidebar': '50',
  'dropdown': '60',
  'overlay': '100',
  'modal': '150',
  'toast': '200',
}
```

---

### REF-06 | Sin `React.lazy()` para code-splitting
Todos los componentes de página se importan de forma estática en `App.tsx`. El bundle inicial carga código de Settings, Reports, DeviceDetail aunque el usuario solo vea el Dashboard.

**Fix en `App.tsx`:**
```typescript
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Clients   = lazy(() => import('./pages/Clients'));
// ...
// Envolver Routes en: <Suspense fallback={<PageLoader />}>
```

---

### REF-07 | `ConfirmModal.tsx` no recibe `isLoading` prop
El modal de confirmación genérico no puede mostrar un spinner durante la operación. Cada página reimplementa su propia lógica de "está procesando".

**Fix:** Añadir prop `isLoading?: boolean` a `ConfirmModal` y deshabilitar botones durante el proceso.

---

### REF-08 | Toast sin deduplicación
Si el usuario hace click rápido en "Guardar" dos veces (o el error persiste), aparecen múltiples toasts idénticos apilados.

**Fix en `ToastContext.tsx`:** Antes de `setToasts(prev => [...prev, newToast])`, verificar si ya existe un toast con el mismo mensaje activo.

---

## CHECKLIST DE CIERRE

Tareas ordenadas por impacto/esfuerzo. Las marcadas con `⚡` son cambios de <30 minutos.

### Bloque 1 — CRÍTICOS (ejecutar antes de deploy)

- [x] `⚡` **CRIT-01** ~~Reemplazar `https://stc-cloud-portal.vercel.app` por `window.location.origin` en `MonitorDetail.tsx:573,577`~~ — **RESUELTO** `MonitorDetail.tsx`
- [x] `⚡` **CRIT-03** ~~Estandarizar color primario: elegir `#2980b9`, actualizar `index.css` y añadir `brand` en `tailwind.config.js`~~ — **RESUELTO** `index.css` + 138 ocurrencias → `text-brand`/`bg-brand`/`border-brand` en 12 archivos. Definido `@theme { --color-brand }`.
- [x] `⚡` **CRIT-04** ~~Unificar carga inicial y `loadAgents` en `Agents.tsx` para eliminar duplicación de fetch~~ — **RESUELTO** Extraído `loadClients`, `useEffect` ahora llama `loadAgents()` + `loadClients()` como fuente única de verdad.
- [x] **CRIT-02** ~~Evaluar migración de JWT de localStorage a httpOnly cookies (coordinación backend requerida)~~ — **RESUELTO** Migración completa coordinada frontend+backend: `@fastify/cookie` instalado, `portalAuth` lee `stc_session` cookie, login emite `Set-Cookie: httpOnly; SameSite=Strict`, nuevos endpoints `/portal/logout` y `/portal/me`. Frontend: `api.ts` usa `credentials: 'include'`, `AuthContext` verifica sesión vía `/me` al montar, `App.tsx` bloquea flash de redirect con flag `checking`.

### Bloque 2 — UX PREMIUM (elevan el feel sin romper nada)

- [x] `⚡` **UX-02** ~~Agregar empty state visual a `Agents.tsx` cuando no hay agentes~~ — **RESUELTO** Empty state diferenciado: `Server` icon + "Sin agentes registrados" cuando `agents.length === 0`; `Search` icon + "Sin nodos que coincidan" cuando hay agentes pero el filtro no retorna resultados.
- [x] `⚡` **UX-03** ~~Deshabilitar botón trigger de revoke mientras `revoking === agent.id`~~ — **RESUELTO** `disabled={revoking === agent.id}` + `disabled:cursor-not-allowed` en el botón ShieldOff.
- [x] `⚡` **UX-04** ~~Añadir animación `modalIn` en `index.css` y aplicar a todos los modales~~ — **RESUELTO** `@keyframes modalIn` (scale + translateY) + `@keyframes overlayIn` en `index.css`. Aplicado `animate-modal-in` / `animate-overlay-in` en 7 modales: `ConfirmModal`, `Agents` (×2), `Clients`, `ClientDetail`, `MonitorDetail` (×2), `Monitors`. Reemplaza `animate-in zoom-in-95` que no tenía efecto real (tailwindcss-animate no instalado).
- [x] `⚡` **UX-01** ~~Añadir `aria-label` a botones de acción en tablas (Revocar, Eliminar, Configurar)~~ — **RESUELTO** `aria-label` dinámico con nombre del agente en los 3 botones de `Agents.tsx`; `aria-label` en el link chevron de `Clients.tsx`.
- [x] **UX-07** ~~Envolver filtros de búsqueda en `useMemo`~~ — **RESUELTO** `filteredAgents` en `Agents.tsx` y `filtered` en `Clients.tsx` envueltos en `useMemo([..., searchTerm])`.
- [x] **UX-06** ~~Implementar `useTime` hook para actualizar `formatLastSeen` en tiempo real~~ — **RESUELTO** Nuevo `src/hooks/useTime.ts` (tick cada 60 s con `setInterval`). `formatLastSeen` acepta `now: number`. `Agents.tsx` llama `useTime()` y pasa `now` a cada celda — el tiempo relativo se actualiza sin polling manual.

### Bloque 3 — REFACTOR (deuda técnica controlada)

- [x] `⚡` **REF-03** ~~Agregar timeout de 15s con `AbortController` en `api.ts`~~ — **RESUELTO** `AbortController` + `setTimeout(15_000)` con `clearTimeout` en `finally`. Lanza `"La solicitud tardó demasiado"` en AbortError.
- [x] `⚡` **REF-08** ~~Agregar deduplicación de toasts en `ToastContext.tsx`~~ — **RESUELTO** `showToast` verifica `prev.some(t => t.message === message && t.type === type)` antes de añadir. Mismo mensaje+tipo activo = ignorado.
- [x] `⚡` **REF-07** ~~Añadir prop `isLoading` a `ConfirmModal`~~ — **YA EXISTÍA** (añadido durante CRIT-02). Prop `isLoading?: boolean` presente, botones deshabilitados y spinner activo.
- [x] **REF-02** ~~Crear `src/lib/formatters.ts` y centralizar funciones de fecha~~ — **RESUELTO** Creado con `formatRelativeTime`, `formatDate`, `formatDateTime`. Función local `formatLastSeen` en `Agents.tsx` eliminada y reemplazada por `formatRelativeTime`.
- [x] **REF-04** ~~Crear `src/lib/constants.ts` y mover constantes mágicas~~ — **RESUELTO** Creado `src/lib/constants.ts` con 9 constantes. Conectado en `Dashboard`, `Agents`, `Reports`, `ToastContext`, `useTime`.
- [x] **REF-05** ~~Definir escala de z-index en `tailwind.config.js`~~ — **RESUELTO** Tailwind v4 no usa config.js. Variables CSS semánticas `--z-sidebar/dropdown/overlay/modal/toast` definidas en `@theme {}` de `index.css`. Los valores `z-[50/100/150/200]` existentes ya coinciden con la escala.
- [x] **REF-06** ~~Implementar `React.lazy()` para las páginas en `App.tsx`~~ — **RESUELTO** 9 páginas convertidas a `lazy()`. `Suspense` envuelve todas las rutas protegidas. `Login` y `Layout` quedan estáticos (se cargan siempre).
- [x] **REF-01** — Fragmentar `Agents.tsx` en sub-componentes (sprint dedicado) — **RESUELTO** Extraído a `src/types/agents.ts` (interfaces + utils), `components/agents/AgentTable.tsx`, `CreateAgentModal.tsx`, `ConfigAgentModal.tsx`, `RegenKeyModal.tsx`. Orquestador quedó en ~130 líneas. TypeScript limpio.

---

## MATRIZ DE PRIORIDAD

```
IMPACTO
  Alto │ CRIT-01  CRIT-02  CRIT-03
       │ UX-04    REF-03   REF-01
       │ UX-02    CRIT-04  REF-06
  Bajo │ UX-01    UX-03    REF-02
       └──────────────────────────
         Bajo    Medio    Alto  ESFUERZO
```

**Relación tiempo/valor más rentable:** CRIT-01, CRIT-03, UX-04, REF-03 — todos son cambios de <30 minutos con impacto inmediato en calidad y seguridad.

---

## PUNTOS FUERTES A PRESERVAR

Estos patrones están bien implementados — no tocar, replicar en nuevos features:

- **Sistema de Empty States** — consistente en todos los pages excepto Agents
- **Loading States** — feedback inmediato con spinners y texto contextual
- **Toast System** — implementación propia limpia y funcional
- **Responsive Design** — mobile-first con breakpoints correctos en toda la app
- **Error Boundaries** — `ErrorBoundary.tsx` cubre el árbol completo
- **useCallback + useEffect** — dependencias correctamente declaradas en la mayoría de hooks
- **Defensive fallbacks** en respuestas API (`Array.isArray()`, `?? []`, `?? 0`)
- **Auto-logout en 401** — flujo de sesión expirada bien implementado
- **Design System** — `.cd-panel`, `.cd-table`, `.cd-input` son una base sólida

---

*Auditoría generada con análisis estático de 25 archivos fuente. Prioridades basadas en impacto en producción, experiencia de usuario y mantenibilidad a 6 meses.*
