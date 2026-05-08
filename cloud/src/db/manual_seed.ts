import knex from "knex";
import config from "./knexfile";

const db = knex(config.development);

async function run() {
  try {
    await db("clients").insert({
      id: "00000000-0000-0000-0000-000000000000",
      name: "Cliente de Prueba"
    }).onConflict("id").ignore();
    console.log("✅ Cliente dummy verificado");
  } catch (err) {
    console.error("❌ Error en seed:", err);
  } finally {
    await db.destroy();
  }
}

run();
