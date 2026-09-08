# Auditoría de Dependencias — Septiembre 2026

**Fecha:** 8 de septiembre de 2026
**Herramienta:** `npm audit` sobre los lockfiles reales de cada paquete
**Alcance:** backend (`cloud/`), portal (`cloud/portal/`), agente (`agent/`) y monorepo raíz

---

## Resumen ejecutivo

**No hay vulnerabilidades críticas en ningún paquete.** Lo que efectivamente se despliega en
producción tiene **3 vulnerabilidades** (1 alta, 2 moderadas), ninguna explotable en la
configuración actual del sistema, y ninguna con un parche aplicable sin romper compatibilidad.

| Paquete | Qué se audita | Total | Crítica | Alta | Moderada | Baja |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: |
| **Backend (producción)** | `cloud/package-lock.json` — el lockfile que usa el Dockerfile | **3** | 0 | 1 | 2 | 0 |
| Portal | `cloud/portal/package-lock.json` | 9 | 0 | 7 | 0 | 2 |
| Agente | `agent/package.json` | 1 | 0 | 0 | 0 | 1 |
| Monorepo raíz (desarrollo) | `package-lock.json` (workspaces) | 7 | 0 | 3 | 3 | 1 |

> **Por qué hay dos números para el backend:** el repo tiene dos lockfiles. El de la raíz es un
> monorepo con workspaces (`cloud`, `agent`, `shared`) que se usa para desarrollo local; el de
> `cloud/` es independiente y es el que instala `cloud/Dockerfile` al construir la imagen de
> producción. El lockfile de producción está **más actualizado** que el de desarrollo: ya tiene
> parcheados `fastify` (5.12.1), `ws` (8.21.3) y `find-my-way` (9.9.0), que en el lock de la raíz
> siguen en versiones vulnerables. Las 3 vulnerabilidades de la primera fila son las que
> realmente llegan al servidor.

---

## 1. Backend en producción — lo que importa

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

### Dependencias que ya están parcheadas en producción

Vale registrarlo porque son las de mayor superficie de ataque del backend, y en el lockfile de
desarrollo todavía figuran vulnerables:

| Paquete | Versión en producción | Estado |
| :--- | :--- | :--- |
| `fastify` | 5.12.1 | Parcheado (bypass de validación de esquema y spoofing de `X-Forwarded-*` bajo `trustProxy` afectan a ≤5.12.0) |
| `ws` | 8.21.3 | Parcheado (DoS por exceso de headers, divulgación de memoria no inicializada, agotamiento de memoria) |
| `find-my-way` | 9.9.0 | Parcheado (DoS con HTTP/2, afecta a ≤9.6.0) |

---

## 2. Portal — 9 hallazgos, ninguno llega al navegador del usuario

El portal se despliega como **build estático** servido por nginx: el resultado de `vite build`
son archivos HTML/CSS/JS. Las herramientas de construcción no se despliegan.

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

## 3. Agente — limpio

Una sola vulnerabilidad, de severidad baja: `esbuild` (lectura arbitraria de archivos al correr
su servidor de desarrollo en Windows). `esbuild` es una **dependencia de desarrollo** que se usa
para empaquetar el binario del agente (`agent/build-sea.js`); su servidor de desarrollo nunca se
ejecuta, ni en el build ni en la máquina del cliente. **Sin impacto.**

Las dependencias de ejecución del agente (`better-sqlite3`, `net-snmp`, `node-windows`, `ws`) no
tienen vulnerabilidades reportadas al resolver el árbol con las versiones actuales.

> Nota operativa: el agente no tiene `package-lock.json` commiteado, por lo que cada build
> resuelve las versiones al momento. Para esta auditoría se generó un lockfile efímero fuera del
> repositorio. Commitear un lockfile daría builds reproducibles y auditables — recomendado.

---

## 4. Monorepo raíz — sólo desarrollo

Los 7 hallazgos del lockfile de la raíz corresponden al entorno de desarrollo local. Incluyen
`fastify` (≤5.12.0), `ws` (8.17.0) y `find-my-way` (≤9.6.0) en versiones que **ya están
corregidas en el lockfile de producción**. No afectan a ningún sistema desplegado.

**Acción recomendada:** correr `npm audit fix` en la raíz para alinear el entorno de desarrollo
con producción. Es un cambio sin riesgo y evita que una auditoría futura confunda el estado del
entorno local con el del servidor.

---

## Plan de acción

| Prioridad | Acción | Motivo |
| :--- | :--- | :--- |
| Media | `npm audit fix` en la raíz del monorepo | Alinea desarrollo con producción; sin riesgo |
| Media | Actualizar `react-router-dom` a ≥7.15.1 | Cierra la única vulnerabilidad de runtime del portal aplicable |
| Baja | Commitear un `package-lock.json` para `agent/` | Builds reproducibles y auditables |
| Seguimiento | Esperar que `exceljs` actualice `uuid`, y `fastify` propague `fast-uri` ≥4.1.3 | El "fix" que ofrece npm es un downgrade que rompe la generación de reportes |

**No se recomienda ejecutar `npm audit fix --force` en ningún paquete:** en todos los casos
propone cambios de versión mayor hacia atrás (notablemente `exceljs@3.4.0`) que romperían
funcionalidad en uso.

---

## Cómo reproducir esta auditoría

```bash
# Backend en producción (el que importa) — lockfile independiente del monorepo
cd cloud && npm audit --omit=dev

# Portal
cd cloud/portal && npm audit

# Monorepo (desarrollo; incluye los workspaces cloud/agent/shared)
npm audit
```

El agente requiere generar un lockfile efímero fuera del repositorio, ya que no tiene uno
commiteado:

```bash
mkdir /tmp/agent-audit && cp agent/package.json /tmp/agent-audit/
cd /tmp/agent-audit && npm install --package-lock-only --ignore-scripts && npm audit
```
