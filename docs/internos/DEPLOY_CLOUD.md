# 🚀 Guía de Despliegue — Self-Hosted (Docker, VPS propio)

> Todo el stack de STC Cloud (API, portal, Postgres/TimescaleDB, Redis,
> reverse proxy con SSL) corre self-hosted en Docker sobre un servidor propio
> (VPS o físico), orquestado por `docker-compose.prod.yml` y automatizado por
> `deploy.sh`.

| Componente | Dónde corre | Contenedor |
|---|---|---|
| **Portal React** | Mismo VPS, detrás de nginx | `portal` |
| **Backend API** | Mismo VPS | `api` |
| **PostgreSQL + TimescaleDB** | Mismo VPS | `postgres` |
| **Redis** | Mismo VPS | `redis` |
| **Reverse proxy** | Mismo VPS | `nginx` (modo `letsencrypt`, + `certbot`) o `nginx-external` (modo `external`) |
| **Backup de base de datos** | Mismo VPS | `backup` (pg_dump diario, retención 30 días) |

---

## Modos de TLS

El TLS se elige con `COMPOSE_PROFILES` en `.env.production` (perfiles de
`docker-compose.prod.yml`). El dominio no se escribe en ningún archivo:
`nginx/entrypoint.sh` renderiza los bloques `server` desde
`nginx/templates/<modo>.conf.template` con `DOMAIN` cada vez que arranca el
contenedor, y lo compartido (locations, cabeceras, TLS, gateway EWS) vive en
`nginx/snippets/`.

| Modo | Quién termina TLS | Puertos del host | Certificados |
|---|---|---|---|
| `letsencrypt` | El nginx del compose | `80` + `443` | Let's Encrypt vía certbot: `deploy.sh` los emite la primera vez, el contenedor `certbot` los renueva cada 12 h y nginx los recarga cada 6 h |
| `external` | Un reverse proxy externo (nginx proxy manager, ALB de AWS, Caddy, Traefik…) | sólo `NGINX_HTTP_PORT` (default `80`), HTTP plano | Ninguno acá; los maneja el proxy externo |

En ambos modos la app se usa por **HTTPS** (`PORTAL_ORIGIN` y `EWS_GATEWAY_URL`
siguen siendo `https://…`): las cookies de sesión llevan `Secure` en
producción y el navegador no las manda por HTTP plano. El modo `external`
sirve para delegar el TLS, no para prescindir de él.

### Modo `external`: qué tiene que hacer el proxy de adelante

- Reenviar **dos hostnames** al mismo destino `http://<host>:<NGINX_HTTP_PORT>`:
  `DOMAIN` (portal + API + WS) y `ews.DOMAIN` (gateway EWS). nginx los
  distingue por el header `Host`, así que el proxy tiene que **conservarlo**
  (es el default en nginx proxy manager, Caddy y Traefik; en un ALB también).
- **WebSocket habilitado** (en nginx proxy manager: "Websockets Support" en el
  proxy host). El agente y el portal usan `/ws`.
- Mandar `X-Forwarded-For` y `X-Forwarded-Proto` (todos lo hacen por defecto).
  Con eso nginx reconstruye la IP real del cliente (rate limit de login,
  auditoría, `request.ip` de la API) y la API ve `https`.
- Si el proxy llega con **IP pública** (otra VM, no la misma VPC), agregar su
  IP en `TRUSTED_PROXY_CIDR`; las redes privadas y loopback ya se confían.
- **Cerrar `NGINX_HTTP_PORT` a todo lo que no sea el proxy** (security group /
  firewall): es HTTP plano y, si un cliente llegara directo, la IP real que
  ve la app sería la que él declare.
- Si el proxy corre **en el mismo host** (por ejemplo nginx proxy manager en
  Docker), usar `NGINX_HTTP_PORT=127.0.0.1:8080` y apuntar el proxy a
  `http://<IP del host>:8080` (o al gateway de Docker, `172.17.0.1`), para no
  exponer el puerto a la red.

---

## Prerrequisitos del servidor

- Un VPS (o servidor físico) con Docker y Docker Compose v2 instalados.
- Un dominio propio con el registro DNS `A` de `DOMAIN` apuntando a la IP
  del servidor (modo `letsencrypt`) o del proxy externo (modo `external`).
- Un segundo registro `A` para `ews.<dominio>`, al mismo destino: es el
  hostname aparte por el que el operador navega la web embebida (EWS) de un
  equipo del cliente. Va en un origen propio para que las páginas del
  firmware no compartan cookies ni políticas con el portal. Es opcional: sin
  `EWS_GATEWAY_URL` no se pide su certificado y "Abrir EWS" responde 503 con
  un mensaje.
- Modo `letsencrypt`: puertos `80` y `443` abiertos desde Internet hacia el
  servidor (el `80` lo usa el challenge HTTP-01 de certbot).
- Modo `external`: `NGINX_HTTP_PORT` abierto **sólo** hacia el proxy.

## 1️⃣ Configurar variables de entorno

```bash
cp .env.production.example .env.production
```

Completar en `.env.production`:

- `COMPOSE_PROFILES` — `letsencrypt` o `external` (ver arriba). Se le puede
  sumar `,observability`.
- `DOMAIN` — el dominio real (ej. `monitor.tuempresa.com`).
- `JWT_SECRET`, `COOKIE_SECRET` — generar con `openssl rand -base64 64` /
  `openssl rand -base64 32`.
- `DB_PASSWORD`, `PORTAL_ADMIN_PASSWORD` — contraseñas propias, no dejar los
  placeholders `CAMBIAR_POR_*` (`deploy.sh` aborta si detecta que quedaron
  sin cambiar).
- `EWS_GATEWAY_URL` — `https://ews.<dominio>` (el segundo hostname de los
  prerrequisitos). Es la URL a la que el portal manda al operador al abrir el
  EWS de un equipo.
- Sólo modo `letsencrypt`: `LETSENCRYPT_EMAIL` (opcional, default
  `admin@DOMAIN`).
- Sólo modo `external`: `NGINX_HTTP_PORT` y `TRUSTED_PROXY_CIDR` (opcionales,
  ver arriba).
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
2. Verifica que `.env.production` exista, que las variables críticas
   (`JWT_SECRET`, `DB_PASSWORD`, `PORTAL_ADMIN_PASSWORD`, `DOMAIN`) estén
   completadas (no los placeholders de ejemplo) y que `COMPOSE_PROFILES`
   tenga exactamente un modo de TLS.
3. Levanta todo: `docker compose -f docker-compose.prod.yml --env-file
   .env.production up -d --build --wait`. En modo `letsencrypt` sin
   certificado todavía, nginx arranca sirviendo sólo el challenge ACME
   (`nginx/templates/bootstrap.conf.template`) y responde 503 al resto.
4. Sólo modo `letsencrypt`, primera vez: pide a Let's Encrypt (webroot
   challenge, `docker compose run --rm certbot certonly …` sobre el volumen
   `certbot-certs`) el certificado de `DOMAIN` y, si `EWS_GATEWAY_URL` está
   definida, el de `ews.DOMAIN`. Apenas aparece el primero, nginx pasa solo a
   la config completa; `deploy.sh` igual fuerza un
   `entrypoint.sh reload` para tomar el segundo sin esperar.
5. Corre las migraciones dentro del contenedor `api`
   (`npx knex migrate:latest --knexfile dist/db/knexfile.js`).

Al terminar, el portal queda accesible en `https://${DOMAIN}` y la API en
`https://${DOMAIN}/api/v1/...` (mismo dominio, nginx enruta por path).

Para validar la config de nginx sin reiniciar nada (por ejemplo después de
tocar `nginx/`):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec nginx sh /etc/nginx/entrypoint.sh check      # `nginx-external` en modo external
```

## 3️⃣ Configurar el Agente Windows

En el agente instalado en el cliente, la URL del servidor apunta al dominio
propio:

```
API_URL=https://tu-dominio.com
```

## ✅ Verificación

| Test | URL | Resultado esperado |
|---|---|---|
| Health check | `https://tu-dominio.com/api/v1/health` | `{"status":"ok"}` |
| Portal login | `https://tu-dominio.com/login` | Pantalla de login |
| API | `https://tu-dominio.com/api/v1/dashboard` | Requiere auth (401 sin sesión) |
| Gateway EWS | `https://ews.tu-dominio.com/` | Texto "La sesión de EWS venció o se cerró" (401 sin sesión) |

## 🔄 Actualizar el deploy (nueva versión del backend/portal)

El despliegue es manual: no hay auto-deploy al hacer `git push`, hay que
correr el rebuild en el servidor:

```bash
git pull origin main
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Siempre con `--env-file .env.production`: de ahí salen los perfiles
(`COMPOSE_PROFILES`), sin eso compose no ve el servicio de nginx del modo
elegido ni certbot.

Las migraciones nuevas hay que correrlas a mano después del rebuild (mismo
comando que usa `deploy.sh` internamente):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec api sh -c \
  "npx knex migrate:latest --knexfile dist/db/knexfile.js"
```

## Comandos útiles

```bash
alias dcp='docker compose -f docker-compose.prod.yml --env-file .env.production'
dcp logs -f          # Ver logs de todos los servicios
dcp logs -f api      # Ver logs sólo de la API
dcp ps               # Estado de los contenedores
dcp restart api      # Reiniciar sólo la API
dcp down             # Detener todo (no borra volúmenes)
```

## Migrar a otro servidor

Los datos viven en los volúmenes `pgdata` (Postgres) y, en modo
`letsencrypt`, `certbot-certs`. Para mover la instalación (por ejemplo del
VPS actual a una VM nueva detrás de un proxy externo):

1. En el servidor viejo, sacar un dump fresco (el contenedor `backup` ya deja
   uno diario en el volumen `backups`; para uno al instante):
   ```bash
   dcp exec -T postgres pg_dump -U stc_admin stc_cloud | gzip > stc_migracion.sql.gz
   ```
2. En el servidor nuevo: clonar el repo, armar `.env.production` con el modo
   de TLS que corresponda y **los mismos secretos** (`JWT_SECRET`,
   `COOKIE_SECRET`, `SNMP_CREDENTIALS_KEY`: sin ellos las sesiones y las
   credenciales SNMPv3/SFTP cifradas dejan de ser legibles), y correr
   `./deploy.sh`.
3. Restaurar el dump antes de que nadie use la instalación nueva:
   ```bash
   gunzip -c stc_migracion.sql.gz | dcp exec -T postgres psql -U stc_admin -d stc_cloud
   ```
   Las migraciones ya aplicadas vienen en el dump (tabla `knex_migrations`),
   así que un `migrate:latest` posterior no las repite.
4. Apuntar el DNS de `DOMAIN` y `ews.DOMAIN` al destino nuevo (o al proxy).
   Los agentes usan `DOMAIN`, no la IP: si el dominio se mantiene, no hay que
   tocarlos; si cambia, hay que reconfigurar la URL del servidor en cada
   agente.
5. Copiar `agent-updates/` si se publicaron paquetes OTA en el viejo.

## Backups

El contenedor `backup` corre `pg_dump` una vez al día automáticamente,
comprime el resultado y lo guarda en el volumen `backups`, purgando lo que
tenga más de 30 días. Para restaurar un backup:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U stc_admin -d stc_cloud < backup_descomprimido.sql
```

## 📡 Observabilidad (perfil opcional)

Prometheus, Grafana y Alertmanager están definidos en el mismo
`docker-compose.prod.yml` pero bajo el perfil `observability`, así que **no
arrancan** con un `docker compose up -d` normal ni con `deploy.sh`. Para
levantarlos:

```bash
# Permanente: sumarlo al perfil de TLS en .env.production
COMPOSE_PROFILES=letsencrypt,observability     # o external,observability
# o puntual, sin tocar el archivo:
docker compose -f docker-compose.prod.yml --env-file .env.production \
  --profile observability up -d
```

Antes de levantarlo, completar en `.env.production`:

```
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=CAMBIAR_POR_CONTRASENA_SEGURA
```

Cómo queda expuesto:

- **Grafana**: bajo `https://${DOMAIN}/grafana/`, detrás del mismo nginx y el
  mismo certificado TLS que el portal y la API (`location /grafana/` en
  `nginx/snippets/app-locations.conf`) — no abre ningún puerto nuevo. Tiene su propio login,
  independiente del portal, y el registro de usuarios está deshabilitado
  (`GF_USERS_ALLOW_SIGN_UP: "false"`). El datasource de Prometheus y el
  dashboard de STC Cloud se auto-provisionan desde `grafana/provisioning/` y
  `grafana/dashboards/`.
- **Prometheus** y **Alertmanager**: sin puerto publicado ni `location` de
  nginx, a propósito — sólo accesibles dentro de la red interna
  `stc-network`, mismo nivel de confianza que el endpoint `/metrics` de la
  API. Prometheus scrapea `api:3000/metrics` cada 15s y retiene 15 días
  (`--storage.tsdb.retention.time=15d`); las reglas de alerta viven en
  `prometheus/alerts.yml`.

Alertmanager arranca con el receiver en `'null'` (no notifica a nadie) y los
datos SMTP como placeholders `CAMBIAR_*` en `alertmanager/alertmanager.yml`.
Para que mande alertas por mail hay que completar ahí los mismos valores SMTP
que ya usa la app y apuntar `route.receiver` al receiver `default` — el YAML
de Alertmanager no interpola variables de entorno, así que se cargan a mano.

## Límites y sizing

El techo de capacidad lo definen el tamaño del VPS y los límites de recursos
configurados en `docker-compose.prod.yml` (`deploy.resources.limits` por
servicio). Ver `docs/cliente/STC_Analisis_Escalabilidad_Limites_v1.7.html`
para el análisis de capacidad frente a una base de 200+ clientes y miles de
equipos.
