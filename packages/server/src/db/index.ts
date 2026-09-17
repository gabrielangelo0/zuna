import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema.ts";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));
const DEFAULT_PGLITE_DIR = fileURLToPath(new URL("../../.data/pglite", import.meta.url));

let database: Database | null = null;
let closeConnection: (() => Promise<void>) | null = null;

/**
 * Com DATABASE_URL, conecta num Postgres de verdade (produção).
 * Sem ela, usa PGlite: Postgres embutido que grava em packages/server/.data (desenvolvimento).
 * Em ambos os casos aplica as migrações pendentes antes de continuar.
 */
export async function connectDatabase(): Promise<Database> {
  if (database) return database;

  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: url });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    database = db as unknown as Database;
    closeConnection = () => pool.end();
    console.log("Banco: Postgres (DATABASE_URL)");
  } else {
    const dataDir = process.env.PGLITE_DIR ?? DEFAULT_PGLITE_DIR;
    mkdirSync(dataDir, { recursive: true });
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const client = new PGlite(dataDir);
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    database = db as unknown as Database;
    closeConnection = () => client.close();
    console.log(`Banco: PGlite em ${dataDir}`);
  }
  return database;
}

export function db(): Database {
  if (!database) throw new Error("O banco de dados ainda não foi conectado.");
  return database;
}

export async function disconnectDatabase() {
  const close = closeConnection;
  database = null;
  closeConnection = null;
  await close?.();
}
