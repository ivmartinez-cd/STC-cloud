# 🚀 Guía de Despliegue — Vercel + Render + Neon (Free Tier)

> Stack gratuito para desplegar STC Cloud en producción.

| Componente | Plataforma | Tipo | Costo |
|---|---|---|---|
| **Portal React** | Vercel | Static Site (Vite) | $0 |
| **Backend API** | Render | Web Service (Node.js) | $0 |
| **PostgreSQL** | Neon | Serverless DB | $0 |
| **Redis** | Render | Managed Redis | $0 |

---

## 1️⃣ Neon — Base de datos (~2 min)

1. Ir a [neon.tech](https://neon.tech) → **Create Project**
2. Nombre del proyecto: `stc-cloud`
3. Región: `US East (Ohio)` (o la más cercana a tu Render)
4. Copiar la **connection string** que Neon genera:

```
postgresql://stc_admin:AbC123xYz@ep-cool-name-12345.us-east-2.aws.neon.tech/stc_cloud?sslmode=require
```

5. **Guardar esta URL** — la usarás en el paso siguiente

### Ejecutar migraciones (desde tu PC)

```bash
cd cloud
DATABASE_URL="postgresql://..." npx knex migrate:latest --knexfile src/db/knexfile.ts
```

> En PowerShell:
> ```powershell
> $env:DATABASE_URL = "postgresql://..."
> npx knex migrate:latest --knexfile src/db/knexfile.ts
> ```

---

## 2️⃣ Render — Backend API (~5 min)

### A. Crear Redis

1. Ir a [render.com](https://render.com) → **New** → **Redis**
2. Nombre: `stc-cloud-redis`
3. Plan: **Free** (25 MB)
4. Crear → copiar la **Internal URL** (algo como `redis://red-xxx:6379`)

### B. Crear Web Service

1. **New** → **Web Service**
2. Conectar el repo GitHub: `ivmartinez-cd/STC-cloud`
3. Configurar:

| Campo | Valor |
|---|---|
| **Name** | `stc-cloud-api` |
| **Root Directory** | `cloud` |
| **Runtime** | Node |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `node dist/api/server.js` |
| **Plan** | Free |

4. **Environment Variables** — agregar todas:

| Variable | Valor | Notas |
|---|---|---|
| `NODE_ENV` | `production` | |
| `DATABASE_URL` | `postgresql://...` | La URL de Neon (paso 1) |
| `REDIS_URL` | `redis://red-xxx:6379` | La Internal URL del Redis |
| `JWT_SECRET` | *(generar)* | Ejecutar: `openssl rand -base64 64` |
| `PORTAL_ADMIN_USER` | `admin` | |
| `PORTAL_ADMIN_PASSWORD` | *(tu contraseña)* | Mínimo 12 caracteres |
| `PORTAL_ORIGIN` | *(pendiente)* | Se agrega después del paso 3 |
| `TONER_WARN_PCT` | `20` | |
| `TONER_CRITICAL_PCT` | `10` | |

5. Click **Create Web Service**
6. Esperar a que el deploy termine (~3-5 min)
7. Copiar la URL del servicio (ej: `https://stc-cloud-api.onrender.com`)

### Verificar que funciona

```
https://stc-cloud-api.onrender.com/health
```

Debe responder: `{"status":"ok"}`

---

## 3️⃣ Vercel — Portal React (~3 min)

### A. Actualizar vercel.json

Antes de desplegar, editar `cloud/portal/vercel.json` y reemplazar la URL placeholder con la URL real de Render:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://TU-URL-REAL.onrender.com/api/:path*"
    },
    {
      "source": "/health",
      "destination": "https://TU-URL-REAL.onrender.com/health"
    }
  ]
}
```

Commitear y pushear el cambio:

```bash
git add cloud/portal/vercel.json
git commit -m "config: update Render URL in vercel.json"
git push origin main
```

### B. Desplegar en Vercel

1. Ir a [vercel.com](https://vercel.com) → **Add New Project**
2. Importar: `ivmartinez-cd/STC-cloud`
3. Configurar:

| Campo | Valor |
|---|---|
| **Root Directory** | `cloud/portal` |
| **Framework Preset** | Vite |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |

4. Click **Deploy**
5. Copiar la URL que Vercel asigna (ej: `https://stc-cloud-xxx.vercel.app`)

### C. Configurar CORS en Render

Volver al dashboard de Render → tu servicio `stc-cloud-api` → **Environment**:

1. Agregar/editar: `PORTAL_ORIGIN` = `https://stc-cloud-xxx.vercel.app`
2. Render reiniciará el servicio automáticamente

---

## 4️⃣ Configurar el Agente Windows

En el agente instalado en el cliente, actualizar la URL del servidor:

```
API_URL=https://stc-cloud-api.onrender.com
```

El agente se conecta directamente al backend en Render (no pasa por Vercel).

---

## ✅ Verificación final

| Test | URL | Resultado esperado |
|---|---|---|
| Health check | `https://TU-RENDER.onrender.com/health` | `{"status":"ok"}` |
| Portal login | `https://TU-VERCEL.vercel.app/login` | Pantalla de login |
| API via Vercel | `https://TU-VERCEL.vercel.app/api/v1/dashboard` | Requiere auth (401) |

---

## ⚠️ Limitaciones del Free Tier

| Plataforma | Limitación | Impacto |
|---|---|---|
| **Render** | Servicio duerme tras 15 min sin tráfico | Primer request tarda ~30 seg (cold start) |
| **Render** | 750 horas/mes de compute | Suficiente para 1 servicio 24/7 |
| **Render Redis** | 25 MB máximo | Suficiente para cola de comandos y cache |
| **Neon** | 0.5 GB storage, 190h compute/mes | Suficiente para piloto (~10k readings) |
| **Vercel** | 100 GB bandwidth/mes | Más que suficiente |

### Tip: Evitar cold starts

Mientras haya al menos un agente enviando heartbeats (cada 5 min), el servicio de Render se mantiene despierto.

---

## 🔄 Actualizar el deploy

Cada vez que pushees a `main`:

- **Render**: re-deploya automáticamente (auto-deploy habilitado por defecto)
- **Vercel**: re-deploya automáticamente (conectado a GitHub)

```bash
git add -A
git commit -m "feat: tu cambio"
git push origin main
# → Render y Vercel se actualizan solos
```
