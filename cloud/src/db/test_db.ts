import knex from "knex";
import config from "./knexfile";

const db = knex(config.development);

async function run() {
  try {
    const deviceId = "00000000-0000-0000-0000-000000000000"; // Dummy client id just for format
    await db("readings").insert({
      time: new Date(),
      device_id: deviceId,
      total_pages: 10,
      status: "online"
    });
    console.log("✅ Lectura insertada");
  } catch (err: any) {
    console.error("❌ Error DB:", err.message);
  } finally {
    await db.destroy();
  }
}
run();
