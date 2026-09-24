import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema.ts";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));
const DEFAULT_PGLITE_DIR = fileURLToPath(new URL("../../.data/pglite", import.meta.url));

let database: Database | null = null;
let closeConnection: (() => Promise<void>) | null = null;

/** Quantas vezes insistir na primeira conexão, e quanto esperar entre uma tentativa e outra. */
const CONNECT_TRIES = 12;
const CONNECT_WAIT_MS = 2500;

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * A rede interna da Railway só fica de pé alguns segundos depois de o contêiner subir, e o
 * primeiro `getaddrinfo` do Postgres falha com ENOTFOUND. Sem insistir, o processo morre e o
 * deploy inteiro vai para CRASHED com o banco intacto do outro lado.
 */
async function withRetry<T>(what: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const code = (error as { cause?: { code?: string }; code?: string }).cause?.code ?? (error as { code?: string }).code;
      const temporary = code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "EAI_AGAIN" || code === "ETIMEDOUT";
      if (!temporary || attempt >= CONNECT_TRIES) throw error;
      console.log(`${what}: ${code} na tentativa ${attempt} de ${CONNECT_TRIES}; tentando de novo em ${CONNECT_WAIT_MS} ms.`);
      await sleep(CONNECT_WAIT_MS);
    }
  }
}

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
    await withRetry("Banco", () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }));
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
