import type { Knex } from "knex";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// DATABASE_URL sigue soportado por si algún día se vuelve a un Postgres
// gestionado (Neon/Render/Railway), pero el deploy real hoy es 100%
// self-hosted en Docker (docker-compose.prod.yml, Postgres/TimescaleDB en el
// mismo compose) — el fallback de variables individuales es el camino real.
const connection: Knex.PgConnectionConfig | string = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    }
  : {
      host: process.env.DB_HOST || "localhost",
      // Sin esto, `pg` cae a su default (5432) sin importar `DB_PORT` — adentro
      // de Docker da lo mismo (Postgres escucha en 5432 ahí), pero corriendo
      // tests desde el host contra el puerto expuesto (5434 en docker-compose)
      // hacía que cualquier test que importara un módulo real de la app (con
      // su propio pool de Knex, ej. jobs/alertDigestJob.ts) fallara al conectar
      // — encontrado corriendo la suite completa fuera de un contenedor.
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || "stc_admin",
      password: process.env.DB_PASSWORD || "stc_secret",
      database: process.env.DB_NAME || "stc_cloud",
    };

// Pool configurable por env — el `max:5` original venía de una época con
// Postgres gestionado (Neon) donde cada conexión activa contaba contra
// cómputo facturado; en Docker self-hosted esa restricción no aplica y 5
// conexiones se quedan cortas con varios clientes syncando en paralelo +
// tráfico del portal (cola/timeouts de `tarn` en los picos). Default de 20
// deja margen para eso sin acercarse al `max_connections` default de
// Postgres (100) — si en el futuro corren varias réplicas de `api`, hay que
// bajar este valor o subir `max_connections` en el propio Postgres para que
// N réplicas × pool no lo superen.
const config: { [key: string]: Knex.Config } = {
  development: {
    client: "pg",
    connection,
    migrations: {
      directory: "./migrations",
      // .ts hace falta para correr contra src/ en dev (tsx/ts-node); contra
      // dist/ compilado sólo debería matchear .js — pero `.d.ts` TAMBIÉN
      // termina en ".ts", y knex lo toma como candidato a migración y trata
      // de hacerle `require()` (revienta con "Unexpected token 'export'",
      // las declaraciones de tipo no son JS ejecutable). El script
      // `postbuild` de package.json borra los `.d.ts`/`.d.ts.map` de
      // `dist/db/migrations` después de cada build para que esto nunca pase
      // corriendo contra dist/ — no hace falta tocar esto.
      loadExtensions: [".js", ".ts"],
    },
    pool: {
      min: Number(process.env.DB_POOL_MIN ?? 2),
      max: Number(process.env.DB_POOL_MAX ?? 20),
    },
  },
};

export default config;
