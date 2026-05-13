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
      loadExtensions: [".js", ".ts"],
    },
    pool: {
      min: 0,
      max: 5,
    },
  },
};

export default config;
