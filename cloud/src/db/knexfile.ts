import type { Knex } from "knex";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// Soporta DATABASE_URL (Neon, Render, Railway) o variables individuales (Docker local)
const connection: Knex.PgConnectionConfig | string = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    }
  : {
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "stc_admin",
      password: process.env.DB_PASSWORD || "stc_secret",
      database: process.env.DB_NAME || "stc_cloud",
    };

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
      min: 0,
      max: 5,
    },
  },
};

export default config;
