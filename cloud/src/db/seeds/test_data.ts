import { Knex } from "knex";

export async function seed(knex: Knex): Promise<void> {
    // Deletes ALL existing entries
    // await knex("clients").del();

    // Inserts seed entries
    await knex("clients").insert([
        { id: "00000000-0000-0000-0000-000000000000", name: "Cliente de Prueba" }
    ]).onConflict("id").ignore();
};
