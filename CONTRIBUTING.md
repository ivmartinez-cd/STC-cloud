# Guía de Contribución — STC Cloud

## Prerrequisitos

| Herramienta | Versión mínima |
|-------------|---------------|
| Node.js | 20.x |
| Docker + Docker Compose | 24.x / v2.x |
| .NET SDK (solo para Monitor UI) | 10.x |

## Levantar el entorno de desarrollo

### 1. Clonar el repositorio

```bash
git clone https://github.com/tu-org/stc-cloud.git
cd stc-cloud
```

### 2. Configurar variables de entorno

```bash
cp .env.production.example .env
```

Editar `.env` con valores de desarrollo (ver el archivo para referencia).

### 3. Levantar PostgreSQL + Redis

```bash
docker run -d --name stc-postgres -p 5432:5432 \
  -e POSTGRES_USER=stc_admin \
  -e POSTGRES_PASSWORD=stc_dev_pass \
  -e POSTGRES_DB=stc_cloud \
  timescale/timescaledb:latest-pg16

docker run -d --name stc-redis -p 6379:6379 redis:7-alpine
```

### 4. Instalar dependencias

```bash
npm install              # root (workspaces)
cd cloud && npm install  # backend
cd portal && npm install # portal
cd ../../agent && npm install  # agente
```

### 5. Ejecutar migraciones

```bash
cd cloud
npx knex migrate:latest --knexfile src/db/knexfile.ts
npm run seed
```

### 6. Iniciar en modo desarrollo

```bash
# Terminal 1 — Backend
cd cloud && npm run dev

# Terminal 2 — Portal
cd cloud/portal && npm run dev
```

- Backend: `http://localhost:3000`
- Portal: `http://localhost:5173`

## Ejecutar tests

```bash
# Tests unitarios del agente (no requiere servidor)
cd agent && npm test

# Tests E2E (requiere backend corriendo)
cd cloud
$env:PORTAL_ADMIN_PASSWORD = "Admin1234"  # PowerShell
npm test

# Load test
npm run test:load -- --agents 5 --duration 20
```

## Estructura del proyecto

```
stc-cloud/
├── cloud/           # Backend API (Fastify + TypeScript)
│   ├── portal/      # Frontend React (Vite + TailwindCSS)
│   └── src/
│       ├── api/     # Servidor y rutas
│       ├── db/      # Migraciones y seeds (Knex)
│       ├── services/# Lógica de negocio
│       ├── jobs/    # Workers (BullMQ)
│       ├── ws/      # WebSocket hub
│       └── tests/   # E2E y load tests
├── agent/           # Agente Windows (Node.js + SNMP)
│   └── src/
│       ├── core/    # Main loop, config
│       ├── snmp/    # Scanner y OIDs
│       ├── sync/    # SQLite queue + uploader
│       └── tests/   # Unit tests
├── monitor-ui/      # Tray app Windows (.NET WinForms)
├── installer/       # Inno Setup installer
├── shared/          # Tipos y utilidades compartidas
└── docs/            # Documentación técnica
```

## Convenciones

- **Commits**: Mensajes descriptivos en español o inglés
- **Branches**: `feature/nombre`, `fix/nombre`, `docs/nombre`
- **Testing**: Escribir tests para toda lógica nueva
- **Linting**: Ejecutar `npm run lint` antes de cada commit
