import type { Knex } from "knex";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: "../../.env" });

const config: { [key: string]: Knex.Config } = {
  development: {
    client: "pg",
    connection: {
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "stc_admin",
      password: process.env.DB_PASSWORD || "stc_secret",
      database: process.env.DB_NAME || "stc_cloud",
    },
    migrations: {
      directory: "./migrations",
      extension: "ts",
    },
  },
};

export default config;
