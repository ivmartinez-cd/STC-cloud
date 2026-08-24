# Guía de Arquitectura de Proyectos

**Versión:** 1.0.0  
**Audiencia:** Todo el equipo de desarrollo

---

## Índice

1. [Principios Fundamentales](#1-principios-fundamentales)
2. [Estructura de Proyectos](#2-estructura-de-proyectos)
3. [Capas y Responsabilidades](#3-capas-y-responsabilidades)
4. [Convenciones de Código](#4-convenciones-de-código)
5. [Gestión de Dependencias](#5-gestión-de-dependencias)
6. [Manejo de Errores](#6-manejo-de-errores)
7. [Testing](#7-testing)
8. [Seguridad](#8-seguridad)
9. [Control de Versiones](#9-control-de-versiones)
10. [Documentación](#10-documentación)
11. [Rendimiento](#11-rendimiento)
12. [Lista de Verificación por PR](#12-lista-de-verificación-por-pr)

---

## 1. Principios Fundamentales

### SOLID

| Principio | Descripción | Aplicación práctica |
|---|---|---|
| **S** — Single Responsibility | Cada clase/función hace una sola cosa | Si una función necesita "y" en su nombre, dividirla |
| **O** — Open/Closed | Abierto a extensión, cerrado a modificación | Usar interfaces y abstracciones |
| **L** — Liskov Substitution | Los subtipos deben ser sustituibles por sus tipos base | Herencia solo cuando existe una relación IS-A real |
| **I** — Interface Segregation | Interfaces pequeñas y específicas | Preferir múltiples interfaces pequeñas a una grande |
| **D** — Dependency Inversion | Depender de abstracciones, no de concreciones | Inyectar dependencias, nunca instanciarlas dentro |

### Clean Code

- **Nombres que expresan intención:** `getUserActiveOrders()` en vez de `getOrders2()`
- **Funciones cortas:** máximo 20 líneas; si necesita scroll, refactorizar
- **Un nivel de abstracción por función:** no mezclar lógica de negocio con detalles de I/O
- **Evitar comentarios que explican QUÉ:** el código debe ser autoexplicativo; comentar solo el POR QUÉ cuando no es obvio
- **DRY — Don't Repeat Yourself:** toda duplicación es deuda técnica
- **YAGNI — You Aren't Gonna Need It:** no agregar funcionalidad especulativa
- **KISS — Keep It Simple, Stupid:** la solución más simple que funciona es la correcta

### Reglas de Oro

> Si leer el código requiere pensar "¿qué hace esto?", refactorizar.  
> Si agregar una feature requiere modificar más de 2 archivos no relacionados, la arquitectura está mal.  
> Si los tests son difíciles de escribir, el diseño tiene un problema.

---

## 2. Estructura de Proyectos

### Estructura General (aplicable a cualquier stack)

```
project-root/
├── src/
│   ├── domain/          # Entidades, value objects, reglas de negocio puras
│   ├── application/     # Casos de uso, orquestación, DTOs
│   ├── infrastructure/  # DB, APIs externas, servicios de terceros
│   └── presentation/    # Controllers, endpoints, serializers
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
├── scripts/             # Scripts de build, migración, seed
├── .env.example         # Variables de entorno sin valores reales
└── README.md
```

### Estructura por Stack

#### Backend (Node.js / Python / Java)

```
src/
├── domain/
│   ├── entities/        # User, Order, Product...
│   ├── value-objects/   # Email, Money, PhoneNumber...
│   ├── repositories/    # Interfaces (contratos)
│   └── services/        # Servicios de dominio (lógica que no pertenece a una entidad)
├── application/
│   ├── use-cases/       # CreateUser, PlaceOrder... (uno por archivo)
│   └── dtos/            # Input/Output de cada caso de uso
├── infrastructure/
│   ├── database/
│   │   ├── models/      # Modelos ORM
│   │   ├── repositories/ # Implementaciones concretas
│   │   └── migrations/
│   ├── http/            # Clientes HTTP externos
│   └── cache/
└── presentation/
    ├── controllers/
    ├── middlewares/
    └── validators/
```

#### Backend — variante monolito modular (múltiples dominios de negocio)

La estructura capa → módulo de arriba asume una aplicación de un solo dominio. Cuando el
backend agrupa **varios dominios de negocio bien delimitados** bajo un mismo monolito
desplegable, usar capa → módulo obliga a que una feature contenida en un solo dominio toque
4 árboles de directorios distintos (`domain/<módulo>/`, `application/<módulo>/`,
`infrastructure/<módulo>/`, `presentation/<módulo>/`) — es el anti-patrón *Shotgun Surgery*
del Apéndice de esta misma guía. En ese caso se invierte el orden a **módulo → capa**:

```
src/
├── shared/                  # transversal a todos los módulos: config, errores base,
│   ├── domain/               # conexión a DB, middlewares, health check
│   ├── infrastructure/
│   └── presentation/
└── modules/
    └── <módulo>/             # ej. auth, insumos, liquidaciones, vacaciones...
        ├── domain/           # entities/, value-objects/, repositories/, services/
        ├── application/      # use-cases/, dtos/
        ├── infrastructure/   # database/, http/, cache/
        └── presentation/     # controllers/, middlewares/, validators/
```

Las reglas de dependencia de §3 no cambian dentro de cada módulo. Se agrega una regla
propia de tener varios módulos: **ningún módulo importa el `domain` o `application` de
otro módulo** — solo puede depender de `shared/`. Verificar esta regla con una herramienta
de análisis de imports en CI (ej. `import-linter` en Python), no dejarla como convención de
palabra. Justificar la elección por escrito con un ADR cuando se adopte esta variante (ver
`docs/adr/003-estructura-modulo-capa.md` de este repo como ejemplo).

#### Frontend (React / Vue / Angular)

```
src/
├── features/            # Feature slices (auth, dashboard, orders...)
│   └── [feature]/
│       ├── components/  # Componentes específicos del feature
│       ├── hooks/       # Hooks específicos del feature
│       ├── store/       # Estado local del feature
│       ├── api/         # Llamadas a API del feature
│       └── types/
├── shared/
│   ├── components/      # Componentes reutilizables
│   ├── hooks/
│   ├── utils/
│   └── types/
├── services/            # Servicios globales (auth, http client)
└── store/               # Estado global
```

---

## 3. Capas y Responsabilidades

### Regla de Dependencias

Las dependencias **siempre** apuntan hacia adentro:

```
Presentation → Application → Domain ← Infrastructure
```

- `Domain` no depende de nadie
- `Application` solo depende de `Domain`
- `Infrastructure` implementa las interfaces de `Domain`
- `Presentation` orquesta `Application`

### Qué va en cada capa

| Capa | Responsabilidad | Prohibido |
|---|---|---|
| **Domain** | Reglas de negocio, entidades, interfaces de repos | Imports de frameworks, DB, HTTP |
| **Application** | Casos de uso, validación de entrada | Lógica de negocio compleja, acceso directo a DB |
| **Infrastructure** | Implementaciones concretas (DB, APIs) | Lógica de negocio |
| **Presentation** | Serialización, autenticación, routing | Lógica de negocio, acceso directo a DB |

---

## 4. Convenciones de Código

### Nomenclatura

```
# Clases y tipos: PascalCase
class UserRepository
interface PaymentGateway
type OrderStatus

# Variables, funciones, métodos: camelCase
const userEmail = ...
function calculateTotalPrice() {}

# Constantes: SCREAMING_SNAKE_CASE
const MAX_RETRY_ATTEMPTS = 3
const DEFAULT_PAGE_SIZE = 20

# Archivos: kebab-case
user-repository.ts
create-order.use-case.ts
payment-gateway.interface.ts

# Carpetas: kebab-case
user-management/
order-processing/
```

### Tamaños Máximos

| Unidad | Límite | Acción si supera |
|---|---|---|
| Función / Método | 20 líneas | Extraer sub-funciones |
| Clase | 200 líneas | Dividir responsabilidades |
| Archivo | 300 líneas | Separar en módulos |
| Parámetros por función | 3 | Agrupar en objeto |
| Profundidad de anidamiento | 3 niveles | Extraer a función o invertir condición |

**Cómo se mide en este repo** (auditorías 2026-08-14/22): backend con AST sobre el span
físico, sin migraciones Alembic; frontend por archivo. En componentes React el límite de
20 líneas por función no se aplica al componente en sí (un componente JSX es una función
de render, y medirlo así da cientos de "violaciones" sin valor): el límite que rige es el
del archivo (300) más la regla de responsabilidad única — un componente no mezcla fetch,
estado y layout; cuando pasa, se extraen hooks y sub-componentes. Los casos que excedían
los límites al congelarse la deuda están en `scripts/sizes-baseline.json` (ADR-017/020) y
`make check` corre `scripts/check_sizes.py`, que falla con cualquier caso nuevo.

### Patrones Prohibidos

```typescript
// PROHIBIDO: Magic numbers
if (status === 3) { ... }

// CORRECTO:
const ORDER_STATUS_SHIPPED = 3;
if (status === ORDER_STATUS_SHIPPED) { ... }

// PROHIBIDO: Condiciones negativas dobles
if (!isNotAdmin) { ... }

// CORRECTO:
if (isAdmin) { ... }

// PROHIBIDO: Funciones con efectos secundarios ocultos
function getUser(id: string) {
  const user = db.find(id);
  analytics.track('user_viewed', id); // efecto secundario oculto
  return user;
}

// CORRECTO: Separar responsabilidades explícitamente

// PROHIBIDO: God Objects / God Functions
class UserService {
  createUser() {}
  sendEmail() {}
  processPayment() {}
  generateReport() {}
  // ...50 métodos más
}
```

---

## 5. Gestión de Dependencias

### Reglas

1. **Toda dependencia externa es una deuda técnica potencial.** Justificar cada nueva librería.
2. **Aislar siempre las dependencias externas** detrás de una interfaz propia (Adapter Pattern).
3. **Nunca importar directamente** una librería de terceros en el dominio o casos de uso.
4. **Versiones fijadas** (`"express": "4.18.2"` no `"^4.18.2"`) en producción.

### Ejemplo de Aislamiento

```typescript
// PROHIBIDO: dominio acoplado a librería externa
import axios from 'axios';

class OrderService {
  async getShippingRate(order: Order) {
    const res = await axios.get('https://shipping-api.com/rates');
    return res.data;
  }
}

// CORRECTO: dominio depende de su propia interfaz
interface ShippingProvider {
  getRate(origin: Address, destination: Address, weight: number): Promise<Money>;
}

// En infrastructure:
class FedexShippingAdapter implements ShippingProvider {
  async getRate(origin, destination, weight) {
    const res = await axios.get('...');
    return new Money(res.data.rate, 'USD');
  }
}
```

---

## 6. Manejo de Errores

### Jerarquía de Errores

```
AppError (base)
├── DomainError
│   ├── ValidationError
│   └── BusinessRuleViolationError
├── ApplicationError
│   ├── NotFoundError
│   └── UnauthorizedError
└── InfrastructureError
    ├── DatabaseError
    └── ExternalServiceError
```

### Reglas

1. **Nunca capturar errores para silenciarlos** — si no sabes qué hacer con un error, déjalo propagarse.
2. **Errores de dominio son parte del modelo** — no son excepciones inesperadas.
3. **Errores de infraestructura siempre se envuelven** antes de subir al dominio.
4. **Logging obligatorio** en el punto donde el error se maneja, no donde se crea.
5. **Nunca exponer stack traces** al cliente en producción.

```typescript
// PROHIBIDO
try {
  await processPayment(order);
} catch (e) {
  // silencio
}

// PROHIBIDO
catch (e) {
  console.log(e); // logging sin contexto
}

// CORRECTO
catch (error) {
  logger.error('Payment processing failed', {
    orderId: order.id,
    userId: order.userId,
    error: error.message,
  });
  throw new PaymentProcessingError('Unable to process payment', { cause: error });
}
```

---

**Cómo se verifica en este repo** (2026-08-22): `scripts/check_guards.py` (en `make check`
sobre HEAD y en el pre-commit sobre lo staged) falla con cualquier `except Exception`/`except:`
que no relance, no loguee ni delegue en un handler con nombre; con SQL armado por f-string o
concatenación; con literales tipo secreto; con `print(`/`console.log(`; con
`dangerouslySetInnerHTML`; con endpoints que devuelven `list[...]` sin `Page[T]` o sin
`require_permission`/identidad. Lo ya aceptado (pre-auth, ADR-021, constantes en SQL) está en
`scripts/guards-baseline.json`; agregar ahí algo nuevo es una decisión que se documenta.

## 7. Testing

### Pirámide de Testing

```
        /\
       /E2E\         (5-10%) — flujos críticos completos
      /------\
     /Integrac\      (20-30%) — contratos entre capas
    /----------\
   /    Unit    \    (60-70%) — lógica de negocio pura
  /--------------\
```

### Reglas

1. **Tests de dominio son tests unitarios puros** — sin DB, sin HTTP, sin filesystem.
2. **Un test, una aserción conceptual** — puede haber múltiples `expect`, pero prueban una sola idea.
3. **Tests independientes** — el orden de ejecución nunca debe importar.
4. **Datos de test explícitos** — no reutilizar fixtures globales mutables.
5. **Nombrar tests como especificaciones:** `should return error when email is invalid`

### Estructura de un Test

```typescript
describe('CreateUserUseCase', () => {
  describe('when email is already registered', () => {
    it('should throw DuplicateEmailError', async () => {
      // Arrange
      const existingUser = buildUser({ email: 'test@example.com' });
      const repo = new InMemoryUserRepository([existingUser]);
      const useCase = new CreateUserUseCase(repo);

      // Act
      const result = useCase.execute({ email: 'test@example.com', name: 'Ivan' });

      // Assert
      await expect(result).rejects.toThrow(DuplicateEmailError);
    });
  });
});
```

### Cobertura Mínima Obligatoria

| Capa | Cobertura mínima |
|---|---|
| Domain | 90% |
| Application (use cases) | 85% |
| Infrastructure | 70% (integración) |
| Presentation | 60% (e2e) |

---

## 8. Seguridad

### Reglas No Negociables

1. **Nunca commitear secretos** — usar variables de entorno siempre. `.env` en `.gitignore`.
2. **Validar toda entrada del usuario** en el borde del sistema (controllers/validators).
3. **Sanitizar salidas** — prevenir XSS en frontends.
4. **Nunca construir queries con concatenación de strings** — usar prepared statements u ORMs.
5. **Principio de mínimo privilegio** — cada servicio/usuario solo tiene los permisos que necesita.
6. **Dependencias auditadas** — correr `npm audit` / `pip-audit` / equivalente en cada CI.
7. **Autenticación vs Autorización separadas** — son responsabilidades distintas.

### Checklist de Seguridad por Feature

- [ ] Input validado y sanitizado
- [ ] Endpoint autenticado (si corresponde)
- [ ] Autorización verificada (no solo autenticación)
- [ ] Datos sensibles no logueados
- [ ] Rate limiting configurado (si expuesto a internet)
- [ ] Queries parametrizadas (sin SQL injection)

### Autorización por módulo (este repo)

Los permisos son usuario × módulo × acción sobre un catálogo en tablas (ADR-005/007/029). Un
módulo o pantalla nueva **no está terminado** hasta tener las cuatro patas — la auditoría del
2026-08-21 encontró un módulo entero (`turnos`) y varias pantallas sin ellas:

1. **Catálogo**: migración que siembra `module` + `module_action` (y que tenga `downgrade`).
   Sin fila en `module_action` el permiso no se puede conceder desde la UI de admin.
2. **Backend**: `modules/<m>/domain/well_known_permissions.py` con las `Permission` del módulo
   y `Depends(require_permission(...))` en **cada** endpoint — nunca un permiso "prestado" de
   otro módulo (`admin.manage`, etc.). Solo-sesión (`get_current_identity`) únicamente cuando
   la información es de verdad para cualquier usuario logueado, y documentado en el router.
3. **Frontend — ruta**: entrada en `frontend/src/shared/config/route-permissions.ts` (la
   consumen el `RouteGuard` del layout y los submenús del sidebar).
4. **Frontend — acciones**: `can(modulo, accion)` en cada botón de mutación, espejando el
   permiso que pide el endpoint que dispara.

No sembrar acciones "por si acaso": una fila del catálogo que ningún `require_permission`
chequea es un permiso que se puede tildar y no hace nada.

**Funciones por usuario (ADR-032)**: si una pantalla o card debe poder concederse a un usuario
independientemente de las acciones del módulo, es una "función": fila en `module_feature`
(migración, con backfill si reemplaza una regla de código), constante en
`modules/<m>/domain/well_known_features.py`, `require_feature` en el endpoint cuando expone
datos propios, entrada `feature:` en `route-permissions.ts` (o guard de card) y alta en
`FUNCIONES_TL` de las plantillas. Las acciones siguen decidiendo crear/editar/aprobar; las
funciones, qué se ve.

---

## 9. Control de Versiones

### Branching Strategy (Gitflow simplificado)

```
main          ← producción estable
develop       ← integración continua
feature/*     ← nuevas funcionalidades
fix/*         ← correcciones
release/*     ← preparación de release
hotfix/*      ← correcciones urgentes en producción
```

### Commits (Conventional Commits)

```
<type>(<scope>): <descripción en imperativo>

feat(orders): add bulk discount calculation
fix(auth): handle expired token refresh race condition
refactor(users): extract email validation to value object
test(payments): add integration tests for gateway timeout
docs(api): document rate limiting headers
chore(deps): update typescript to 5.5.0
```

**Tipos válidos:** `feat` | `fix` | `refactor` | `test` | `docs` | `chore` | `perf` | `ci`

### Reglas de Commits

- Cada commit debe compilar y pasar los tests
- Un commit = un cambio lógico (no acumular días de trabajo)
- Mensajes en inglés, presente imperativo: `add`, `fix`, `remove` (no `added`, `fixing`)
- Nunca commitear código comentado, `console.log`, o `TODO` sin ticket

### Pull Requests

- Máximo 400 líneas cambiadas por PR (si más, dividir)
- Al menos 1 reviewer antes de merge
- CI verde obligatorio antes de merge
- No mergear el propio PR sin review (excepto hotfixes urgentes documentados)

---

## 10. Documentación

### Qué documentar (y qué no)

| Documentar | No documentar |
|---|---|
| Por qué se tomó una decisión arquitectónica (ADR) | Qué hace el código (debe ser legible) |
| Configuración de entorno y setup inicial | Implementaciones obvias |
| Contratos de API (OpenAPI/AsyncAPI) | Código que se explica solo |
| Runbooks de operación | Cosas que ya están en el código |

### Architecture Decision Records (ADR)

Para cada decisión arquitectónica relevante, crear un ADR en `docs/adr/`:

```markdown
# ADR-001: Usar PostgreSQL como base de datos principal

## Estado: Aceptado

## Contexto
Necesitamos una base de datos que soporte transacciones ACID y consultas complejas.

## Decisión
Usaremos PostgreSQL 16.

## Consecuencias
- Positivas: ACID, JSON nativo, extensiones, madurez
- Negativas: Requiere gestionar esquema, migraciones obligatorias
```

### README Obligatorio por Proyecto

```markdown
# Nombre del Proyecto

## ¿Qué hace?
Una oración.

## Setup rápido
\`\`\`bash
cp .env.example .env
npm install
npm run db:migrate
npm run dev
\`\`\`

## Arquitectura
Enlace al diagrama o descripción de 3-5 líneas.

## Tests
\`\`\`bash
npm test
\`\`\`

## Variables de entorno
Tabla con nombre, descripción y si es obligatoria.
```

---

## 11. Rendimiento

### Reglas Base

1. **Medir antes de optimizar** — nunca optimizar sin datos (profiling primero).
2. **N+1 queries prohibidas** — usar eager loading, batch queries, o DataLoader.
3. **Paginación obligatoria** en todo endpoint que retorne colecciones.
4. **Índices de DB** revisados en cada PR que toca queries.
5. **Caching con expiración explícita** — nunca cachear indefinidamente sin razón documentada.

### Límites de Referencia

| Operación | SLA objetivo |
|---|---|
| API response (p95) | < 200ms |
| DB query simple | < 10ms |
| DB query compleja | < 100ms |
| Operación de background | < 30s |

---

## 12. Lista de Verificación por PR

Antes de solicitar review, verificar:

### Código

- [ ] Nombres de variables, funciones y clases son descriptivos
- [ ] No hay magic numbers ni magic strings sin constante nombrada
- [ ] No hay código duplicado (DRY aplicado)
- [ ] Funciones no exceden 20 líneas
- [ ] Profundidad de anidamiento máxima 3 niveles
- [ ] No hay `console.log`, `print`, `debugger` sin intención

### Arquitectura

- [ ] Las dependencias van en la dirección correcta (no dominio → infraestructura)
- [ ] Las dependencias externas están aisladas detrás de interfaces
- [ ] Cada clase/módulo tiene una sola responsabilidad

### Tests

- [ ] Tests unitarios para toda lógica de negocio nueva
- [ ] Tests de integración para nuevos endpoints o interacciones con DB
- [ ] Todos los tests pasan localmente
- [ ] Cobertura no decrece respecto a la rama base

### Seguridad

- [ ] Ningún secreto, credencial o dato sensible en el código
- [ ] Inputs validados en el borde del sistema
- [ ] Queries parametrizadas (sin concatenación de strings con input de usuario)

### Operación

- [ ] Variables de entorno nuevas documentadas en `.env.example`
- [ ] Migraciones de DB son reversibles (down migration)
- [ ] Breaking changes documentados

---

## Apéndice: Anti-Patrones a Evitar

| Anti-patrón | Por qué es malo | Alternativa |
|---|---|---|
| God Object | Una clase sabe demasiado, imposible de testear | Dividir por responsabilidad |
| Primitive Obsession | `string` para email, `number` para dinero | Value Objects |
| Feature Envy | Clase que usa más métodos de otra que los propios | Mover lógica a donde pertenece |
| Shotgun Surgery | Un cambio requiere editar 10 archivos | Cohesión, agrupar lo que cambia junto |
| Leaky Abstractions | Detalles de implementación se filtran hacia arriba | Interfaces bien definidas |
| Service Locator | Dependencias resueltas globalmente | Inyección de dependencias explícita |
| Anemic Domain Model | Entidades sin comportamiento, solo getters/setters | Lógica de negocio en las entidades |
| Hardcoded Configuration | Valores de config en el código fuente | Variables de entorno / config files |
