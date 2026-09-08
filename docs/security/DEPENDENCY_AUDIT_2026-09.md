# Auditoría de Dependencias — Septiembre 2026

**Fecha:** 8 de septiembre de 2026
**Herramienta:** `npm audit` sobre los lockfiles reales de cada paquete
**Alcance:** backend (`cloud/`), portal (`cloud/portal/`), agente (`agent/`) y monorepo raíz
**Estado del sistema:** sin desplegar — se auditan los artefactos que produce el repositorio

---

## Resumen ejecutivo

**No hay vulnerabilidades críticas en ningún paquete.** El hallazgo que más importa es una
vulnerabilidad **alta en `ws` dentro del agente** (§3): es la única que se empaqueta en un
artefacto que se instala en la red del cliente, y tiene arreglo directo. La imagen del backend
(§1) tiene 3 vulnerabilidades sin parche aplicable, todas de riesgo práctico bajo en esta
configuración.

> **Nota de alcance:** el sistema todavía no está desplegado. Este informe evalúa los artefactos
> que produce el repositorio (la imagen del backend, el build estático del portal y el binario del
> agente), no un ambiente en operación.

| Paquete | Qué se audita | Total | Crítica | Alta | Moderada | Baja |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: |
| **Backend (imagen desplegable)** | `cloud/package-lock.json` — el lockfile que usa el Dockerfile | **3** | 0 | 1 | 2 | 0 |
| Portal | `cloud/portal/package-lock.json` | 9 → **7** | 0 | 7 → **6** | 0 | 2 → **1** |
| **Agente** | resuelto por el lockfile de la raíz (es un workspace) | 2 → **1** | 0 | 1 → **0** | 0 | 1 |
| Monorepo raíz (desarrollo) | `package-lock.json` (workspaces) | 7 → **3** | 0 | 3 → **0** | 3 → **2** | 1 |

> Las flechas indican el estado antes y después de las correcciones aplicadas en esta misma pasada (ver **Plan de acción**).

> **Por qué hay dos números para el backend:** el repo tiene dos lockfiles. El de la raíz es un
> monorepo con workspaces (`cloud`, `agent`, `shared`) que se usa para desarrollo local; el de
> `cloud/` es independiente y es el que instala `cloud/Dockerfile` al construir la imagen. Ese
> segundo lockfile está **más actualizado** que el de desarrollo: ya tiene parcheados `fastify`
> (5.12.1), `ws` (8.21.3) y `find-my-way` (9.9.0), que en el lock de la raíz siguen en versiones
> vulnerables. Las 3 vulnerabilidades de la primera fila son las únicas que quedarían en la imagen
> desplegable; auditar sólo desde la raíz da un panorama más alarmante que el real.

---

## 1. Backend — la imagen desplegable

Auditoría de `cloud/package-lock.json`, idéntico resultado con `--omit=dev` (las 3 están en
dependencias de ejecución, no de build).

| Paquete | Versión | Severidad | Tipo | Vulnerabilidad |
| :--- | :--- | :--- | :--- | :--- |
| `fast-uri` | 4.1.2 | **Alta** | Transitiva (`fastify` → `ajv`) | SSRF por normalización de IPv6 malformada y por re-decodificación de hostname; confusión de host por normalización de esquema percent-encoded y por canonicalización IDN omitida |
| `exceljs` | 4.4.0 | Moderada | **Directa** | Arrastra una versión vulnerable de `uuid` |
| `uuid` | 8.3.2 | Moderada | Transitiva (`exceljs`) | Falta de control de límites de buffer en v3/v5/v6 cuando se provee `buf` |

### Evaluación de riesgo real

- **`fast-uri` (alta):** las vulnerabilidades son de parseo de URIs con SSRF y confusión de host.
  En STC Cloud `fast-uri` no recibe URIs controladas por un atacante: lo usa `ajv` internamente
  para resolver referencias `$ref` de los esquemas JSON, que son estáticos y están definidos en
  el código del propio backend. No hay ninguna ruta que pase una URI de entrada del usuario a
  este parser. **Riesgo práctico: bajo.**
- **`exceljs` / `uuid` (moderadas):** `exceljs` se usa para generar los reportes en formato XLSX.
  La vulnerabilidad de `uuid` requiere que el llamador pase un buffer propio (`buf`) a las
  funciones v3/v5/v6; `exceljs` no expone esa ruta a datos de usuario. **Riesgo práctico: bajo.**
  El único "arreglo" que ofrece `npm audit` es bajar a `exceljs@3.4.0`, una versión mayor hacia
  atrás que rompería la generación de reportes — **no se aplica a propósito**; corresponde
  esperar que exceljs actualice su dependencia de `uuid`.

### Dependencias ya parcheadas en el lockfile de la imagen

Vale registrarlo porque son las de mayor superficie de ataque del backend, y en el lockfile de
desarrollo todavía figuran vulnerables:

| Paquete | Versión en la imagen | Estado |
| :--- | :--- | :--- |
| `fastify` | 5.12.1 | Parcheado (bypass de validación de esquema y spoofing de `X-Forwarded-*` bajo `trustProxy` afectan a ≤5.12.0) |
| `ws` | 8.21.3 | Parcheado (DoS por exceso de headers, divulgación de memoria no inicializada, agotamiento de memoria) |
| `find-my-way` | 9.9.0 | Parcheado (DoS con HTTP/2, afecta a ≤9.6.0) |

---

## 2. Portal — 9 hallazgos, ninguno llega al navegador del usuario

El portal se sirve como **build estático** detrás de nginx: el resultado de `vite build` son
archivos HTML/CSS/JS. Las herramientas de construcción no forman parte de ese artefacto.

**Build-time únicamente (7 de 9):** `vite` (6.4.2), `postcss` (8.5.14), `@babel/core`,
`browserslist`, `js-yaml`, `brace-expansion`, `nanoid`. Sus vulnerabilidades (lectura arbitraria
de archivos vía `sourceMappingURL`, DoS por expansión exponencial, bypass de `server.fs.deny` en
Windows) sólo son explotables por alguien que ya tenga acceso a la máquina de desarrollo o al
pipeline de build. **No forman parte del artefacto desplegado.**

**Runtime (2 de 9):** `react-router` y `react-router-dom` 7.15.0. De las seis vulnerabilidades
reportadas, cinco aplican a los modos **SSR y RSC** de React Router (CSRF vía peticiones de
documento PUT/PATCH/DELETE, `RSCErrorHandler` sin validación de protocolo, inyección de
constructor en `deserializeErrors()` durante la hidratación SSR, bypass de CSRF en modo RSC).
El portal usa `BrowserRouter` en modo SPA puro, sin SSR ni RSC (`cloud/portal/src/App.tsx:2`),
por lo que **esas cinco no aplican**. La sexta — redirección abierta mediante barra invertida en
`<Link>` y `useNavigate` — sí sería aplicable en teoría, pero requiere que la aplicación navegue
a un destino controlado por el usuario, cosa que el portal no hace (todas las rutas de
navegación son literales del código).

**Acción recomendada:** actualizar `react-router-dom` a 7.15.1 o superior en el próximo ciclo de
mantenimiento. No es urgente.

---

## 3. Agente — una vulnerabilidad alta que sí llega al binario

**`ws` 8.20.1 — severidad alta.** El agente usa `ws` como dependencia de ejecución para el canal
WebSocket con el portal, y el lockfile de la raíz lo fija en 8.20.1, que cae dentro del rango
afectado (`8.0.0 - 8.20.1`) por tres vulnerabilidades: denegación de servicio al recibir una
petición con muchos headers HTTP, divulgación de memoria no inicializada, y agotamiento de
memoria mediante fragmentos y chunks diminutos.

Es el hallazgo de mayor relevancia práctica de esta auditoría, porque el agente se instala dentro
de la red del cliente y `esbuild` empaqueta esa versión de `ws` dentro del binario distribuido.
Aun así, la exposición es acotada: el agente **no escucha conexiones entrantes** (modelo
Zero-Inbound), es siempre el cliente que inicia la conexión saliente hacia el portal. Para
explotarlo haría falta que un atacante lograra suplantar al portal o interceptar la conexión TLS.

**Acción recomendada: actualizar `ws` a ≥8.21.3** (la versión que ya usa el lockfile del backend).
Es un cambio de versión menor, sin ruptura de API.

`esbuild` aparece además con severidad baja (lectura arbitraria de archivos al correr su servidor
de desarrollo en Windows). Es una **dependencia de desarrollo** usada para empaquetar el binario
(`agent/build-sea.js`); su servidor de desarrollo nunca se ejecuta. **Sin impacto.**

Las otras dependencias de ejecución (`better-sqlite3`, `net-snmp`, `node-windows`) no tienen
vulnerabilidades reportadas.

> **Sobre el lockfile del agente:** `agent/` es un workspace del monorepo, por lo que no tiene ni
> puede tener un `package-lock.json` propio — sus versiones las fija el lockfile de la raíz. Los
> builds del agente ya son reproducibles por esa vía; auditarlo de forma aislada (generando un
> lockfile efímero) da un resultado **engañosamente limpio**, porque resuelve versiones más nuevas
> que las que realmente se empaquetan.

---

## 4. Monorepo raíz — sólo desarrollo

El lockfile de la raíz cubre el entorno de desarrollo **y las versiones con las que se compila
el agente** (es un workspace). Sus hallazgos de backend — `fastify` (≤5.12.0), `find-my-way`
(≤9.6.0) y `ws` (8.17.0 en la raíz) — **ya están corregidos en el lockfile que usa el
Dockerfile**, así que no llegan a la imagen del backend.

La excepción es el `ws` 8.20.1 del workspace `agent`, que sí se empaqueta en el binario (§3).

**Acción recomendada:** correr `npm audit fix` en la raíz. Además de alinear el entorno de
desarrollo, es la vía para subir el `ws` del agente a una versión parcheada.

---

## Plan de acción

### Aplicado en esta pasada (8/9/2026)

| Acción | Resultado |
| :--- | :--- |
| `npm audit fix` en la raíz del monorepo | `ws` 8.17.0/8.20.1 → **8.21.3**, `fastify` 5.8.5 → 5.12.3, `find-my-way` 9.6.0 → 9.9.0, `fast-uri` 3.1.2 → 3.1.7. El workspace `agent` dejó de tener su copia propia de `ws` y usa la parcheada. **Monorepo: 7 → 3 hallazgos.** Sólo cambió `package-lock.json`; ningún `package.json`, así que no se movieron rangos semver. |
| `react-router-dom` actualizado en el portal | 7.15.0 → **7.18.3**. **Portal: 9 → 7 hallazgos**, y los 7 restantes son todos build-time. |
| Verificación | `tsc --noEmit` en portal, backend y agente: los tres compilan sin errores. |

### Pendiente

| Prioridad | Acción | Motivo |
| :--- | :--- | :--- |
| Seguimiento | Esperar que `exceljs` actualice `uuid`, y que `fastify` propague `fast-uri` ≥4.1.3 al lockfile del backend | El "fix" que ofrece npm es un downgrade a `exceljs@3.4.0` que rompería la generación de reportes |
| Baja | Regenerar `cloud/package-lock.json` fuera del árbol para incorporar `fast-uri` ≥4.1.3 cuando esté disponible | Es un lockfile mantenido aparte del monorepo; no lo alcanza el `npm audit fix` de la raíz |

**No se recomienda ejecutar `npm audit fix --force` en ningún paquete:** en todos los casos
propone cambios de versión mayor hacia atrás (notablemente `exceljs@3.4.0`) que romperían
funcionalidad en uso.

---

## Cómo reproducir esta auditoría

```bash
# Backend, lockfile de la imagen (el que importa) — independiente del monorepo
cd cloud && npm audit --omit=dev

# Portal
cd cloud/portal && npm audit

# Monorepo (desarrollo; incluye los workspaces cloud/agent/shared)
npm audit
```

El agente **no se audita por separado**: es un workspace, y `npm audit` en la raíz ya cubre sus
dependencias con las versiones reales que se empaquetan. Generarle un lockfile aislado da un
resultado engañosamente limpio — para ver qué versión se empaqueta realmente, consultar el
lockfile de la raíz:

```bash
# Versión real de un paquete en el workspace del agente
node -e "const l=require('./package-lock.json');console.log(l.packages['agent/node_modules/ws'])"
```
