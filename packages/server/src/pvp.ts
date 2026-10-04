import { desc, eq } from "drizzle-orm";
import { DEFAULT_PVP_SETTINGS, clampPvpSettings, type PvpSettings } from "@zuna/shared";
import { db } from "./db/index.ts";
import { pvpKills, serverMeta } from "./db/schema.ts";

// Ajustes do combate entre jogadores: ficam no banco, o painel muda e vale na hora.
// O registro de mortes mora aqui também, porque é o que dá o que responder quando a disputa
// chegar — e com queda de item ela chega.

const SETTINGS_KEY = "pvp-config";

let settings: PvpSettings = { ...DEFAULT_PVP_SETTINGS };

async function metaValue(key: string): Promise<string | null> {
  const [row] = await db().select().from(serverMeta).where(eq(serverMeta.key, key)).limit(1);
  return row?.value ?? null;
}

export async function reloadPvp() {
  const raw = await metaValue(SETTINGS_KEY);
  try {
    settings = raw ? clampPvpSettings(JSON.parse(raw) as Partial<PvpSettings>, DEFAULT_PVP_SETTINGS) : { ...DEFAULT_PVP_SETTINGS };
  } catch {
    settings = { ...DEFAULT_PVP_SETTINGS };
  }
}

export function pvpSettings(): PvpSettings {
  return settings;
}

export async function savePvpSettings(change: Partial<PvpSettings>) {
  settings = clampPvpSettings(change, settings);
  await db()
    .insert(serverMeta)
    .values({ key: SETTINGS_KEY, value: JSON.stringify(settings) })
    .onConflictDoUpdate({ target: serverMeta.key, set: { value: JSON.stringify(settings), updatedAt: new Date() } });
}

export interface PvpKillWrite {
  killerId: number;
  victimId: number;
  killerName: string;
  victimName: string;
  worldId: number;
  markedKiller: boolean;
  droppedItems: string[];
}

export async function recordPvpKill(kill: PvpKillWrite) {
  await db().insert(pvpKills).values({ ...kill, droppedItems: kill.droppedItems.join(",") });
}

export interface PvpKillRow {
  id: number;
  killerName: string;
  victimName: string;
  worldId: number;
  markedKiller: boolean;
  droppedItems: string;
  createdAt: string;
}

/** As últimas mortes, para o painel responder a reclamação de griefing. */
export async function recentPvpKills(limit = 100): Promise<PvpKillRow[]> {
  const rows = await db().select().from(pvpKills).orderBy(desc(pvpKills.createdAt)).limit(Math.min(500, Math.max(1, limit)));
  return rows.map((row) => ({
    id: row.id,
    killerName: row.killerName,
    victimName: row.victimName,
    worldId: row.worldId,
    markedKiller: row.markedKiller,
    droppedItems: row.droppedItems,
    createdAt: row.createdAt.toISOString(),
  }));
}
