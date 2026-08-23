# 🚀 Guía de Despliegue — Self-Hosted (Docker, VPS propio)

> STC Cloud ya no corre en Render/Vercel/Neon — todo el stack (API, portal,
> Postgres/TimescaleDB, Redis, reverse proxy con SSL) corre self-hosted en
> Docker sobre un servidor propio (VPS o físico), orquestado por
> `docker-compose.prod.yml` y automatizado por `deploy.sh`.

| Componente | Dónde corre | Contenedor |
|---|---|---|
| **Portal React** | Mismo VPS, detrás de nginx | `portal` |
| **Backend API** | Mismo VPS | `api` |
| **PostgreSQL + TimescaleDB** | Mismo VPS | `postgres` |
| **Redis** | Mismo VPS | `redis` |
| **Reverse proxy + SSL** | Mismo VPS | `nginx` (+ `certbot` para renovación automática) |
| **Backup de base de datos** | Mismo VPS | `backup` (pg_dump diario, retención 30 días) |

---

## Prerrequisitos del servidor

- Un VPS (o servidor físico) con Docker y Docker Compose v2 instalados.
- Un dominio propio con el registro DNS `A` apuntando a la IP del servidor
  (necesario para que certbot pueda emitir el certificado SSL vía HTTP-01
  challenge).
- Puertos `80` y `443` abiertos hacia el servidor.

## 1️⃣ Configurar variables de entorno

```bash
cp .env.production.example .env.production
```

Completar en `.env.production`:

- `DOMAIN` — el dominio real (ej. `monitor.tuempresa.com`). `deploy.sh` lo
  usa para reescribir `nginx.conf` y para pedir el certificado SSL.
- `JWT_SECRET`, `COOKIE_SECRET` — generar con `openssl rand -base64 64` /
  `openssl rand -base64 32`.
- `DB_PASSWORD`, `PORTAL_ADMIN_PASSWORD` — contraseñas propias, no dejar los
  placeholders `CAMBIAR_POR_*` (`deploy.sh` aborta si detecta que quedaron
  sin cambiar).
- El resto de las variables (`DB_HOST=postgres`, `REDIS_URL=redis://redis:6379`,
  etc.) ya apuntan a los nombres de servicio correctos del propio
  `docker-compose.prod.yml` — no hace falta tocarlos salvo que cambies la
  topología.

## 2️⃣ Ejecutar el despliegue

```bash
chmod +x deploy.sh
./deploy.sh
```

`deploy.sh` hace, en orden:

1. Verifica que Docker y Docker Compose v2 estén instalados.
2. Verifica que `.env.production` exista y que las variables críticas
   (`JWT_SECRET`, `DB_PASSWORD`, `PORTAL_ADMIN_PASSWORD`, `DOMAIN`) estén
   completadas (no los placeholders de ejemplo).
3. Reemplaza el dominio placeholder en `nginx.conf` por el `DOMAIN` real.
4. Si no existe un certificado SSL todavía, levanta `nginx` sin SSL
   temporalmente y pide uno a Let's Encrypt vía certbot (webroot challenge).
   Certbot corre después como su propio contenedor, renovando automáticamente
   cada 12h mientras el certificado siga vigente.
5. Levanta todos los servicios: `docker compose -f docker-compose.prod.yml
   --env-file .env.production up -d --build`, y corre las migraciones dentro
   del contenedor `api` (`npx knex migrate:latest --knexfile dist/db/knexfile.js`).

Al terminar, el portal queda accesible en `https://${DOMAIN}` y la API en
`https://${DOMAIN}/api/v1/...` (mismo dominio, nginx enruta por path).

## 3️⃣ Configurar el Agente Windows

En el agente instalado en el cliente, la URL del servidor apunta al dominio
propio (no a un host de Render):

```
API_URL=https://tu-dominio.com
```

## ✅ Verificación

| Test | URL | Resultado esperado |
|---|---|---|
| Health check | `https://tu-dominio.com/health` | `{"status":"ok"}` |
| Portal login | `https://tu-dominio.com/login` | Pantalla de login |
| API | `https://tu-dominio.com/api/v1/dashboard` | Requiere auth (401 sin sesión) |

## 🔄 Actualizar el deploy (nueva versión del backend/portal)

A diferencia de Render/Vercel, acá no hay auto-deploy al hacer `git push` —
hay que correr el rebuild manualmente en el servidor:

```bash
git pull origin main
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Las migraciones nuevas hay que correrlas a mano después del rebuild (mismo
comando que usa `deploy.sh` internamente):

```bash
docker compose -f docker-compose.prod.yml exec api sh -c \
  "npx knex migrate:latest --knexfile dist/db/knexfile.js"
```

## Comandos útiles

```bash
docker compose -f docker-compose.prod.yml logs -f          # Ver logs de todos los servicios
docker compose -f docker-compose.prod.yml logs -f api       # Ver logs sólo de la API
docker compose -f docker-compose.prod.yml ps                # Estado de los contenedores
docker compose -f docker-compose.prod.yml restart api       # Reiniciar sólo la API
docker compose -f docker-compose.prod.yml down              # Detener todo (no borra volúmenes)
```

## Backups

El contenedor `backup` corre `pg_dump` una vez al día automáticamente,
comprime el resultado y lo guarda en el volumen `backups`, purgando lo que
tenga más de 30 días. Para restaurar un backup:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U stc_admin -d stc_cloud < backup_descomprimido.sql
```

## Límites y sizing (self-hosted, no free tier)

Ya no aplican las limitaciones de plan gratuito de Render/Vercel/Neon
(spin-down, horas de cómputo, storage de 0.5 GB) — el techo real ahora es el
tamaño del VPS y los límites de recursos configurados en
`docker-compose.prod.yml` (`deploy.resources.limits` por servicio). Ver
`docs/cliente/STC_Analisis_Escalabilidad_Limites_v1.7.html` para el análisis
de capacidad frente a una base de 200+ clientes.
