import { and, asc, count, eq, sql } from "drizzle-orm";
import { MONSTERS, type MonsterKind, type QuestDef, type QuestKind, type QuestProgress } from "@zuna/shared";
import { db } from "./db/index.ts";
import { characterQuests, quests } from "./db/schema.ts";

// Missões no banco: a lista fica em memória (é lida a toda hora) e o andamento de cada
// personagem é gravado quando muda.

type QuestRow = typeof quests.$inferSelect;

function toQuest(row: QuestRow): QuestDef {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    kind: (row.kind === "boss" ? "boss" : "kill") as QuestKind,
    monster: (MONSTERS[row.monster as MonsterKind] ? row.monster : "rat") as MonsterKind,
    amount: Math.max(1, row.amount),
    worldId: row.worldId,
    minLevel: row.minLevel,
    players: Math.max(1, row.players),
    x: row.x,
    y: row.y,
    bossScale: row.bossScale,
    repeatMinutes: row.repeatMinutes,
    rewardXp: row.rewardXp,
    rewardGold: row.rewardGold,
    rewardItem: row.rewardItem,
    rewardItemCount: Math.max(1, row.rewardItemCount),
    enabled: row.enabled,
    sort: row.sort,
  };
}

let catalog: QuestDef[] = [];

export async function reloadQuests() {
  const rows = await db().select().from(quests).orderBy(asc(quests.sort), asc(quests.minLevel), asc(quests.id));
  catalog = rows.map(toQuest);
}

export function allQuests(): QuestDef[] {
  return catalog;
}

export function questById(id: number): QuestDef | undefined {
  return catalog.find((quest) => quest.id === id);
}

/** Missões que valem para quem está jogando (as desligadas somem da lista). */
export function liveQuests(): QuestDef[] {
  return catalog.filter((quest) => quest.enabled);
}

export async function saveQuest(quest: Omit<QuestDef, "id"> & { id: number }): Promise<QuestDef> {
  const { id, ...values } = quest;
  if (id > 0) await db().update(quests).set(values).where(eq(quests.id, id));
  else await db().insert(quests).values(values);
  await reloadQuests();
  return (id > 0 ? questById(id) : catalog[catalog.length - 1])!;
}

export async function removeQuest(id: number) {
  await db().transaction(async (tx) => {
    await tx.delete(characterQuests).where(eq(characterQuests.questId, id));
    await tx.delete(quests).where(eq(quests.id, id));
  });
  await reloadQuests();
}

/** Quantos personagens já entregaram e quantos estão fazendo cada missão. */
export async function questCounts(): Promise<Map<number, { finished: number; doing: number }>> {
  const rows = await db()
    .select({
      questId: characterQuests.questId,
      finished: sql<number>`cast(count(*) filter (where ${characterQuests.times} > 0) as integer)`,
      doing: sql<number>`cast(count(*) filter (where ${characterQuests.times} = 0) as integer)`,
    })
    .from(characterQuests)
    .groupBy(characterQuests.questId);
  return new Map(rows.map((row) => [row.questId, { finished: row.finished, doing: row.doing }]));
}

// ---------------------------------------------------------------- andamento dos personagens

export async function listQuestProgress(characterId: number): Promise<QuestProgress[]> {
  const rows = await db().select().from(characterQuests).where(eq(characterQuests.characterId, characterId));
  return rows.map((row) => ({
    questId: row.questId,
    progress: row.progress,
    done: row.done,
    readyAt: row.readyAt ? row.readyAt.toISOString() : "",
    times: row.times,
  }));
}

export async function saveQuestProgress(characterId: number, progress: QuestProgress) {
  const values = {
    progress: progress.progress,
    done: progress.done,
    times: progress.times,
    readyAt: progress.readyAt ? new Date(progress.readyAt) : null,
    updatedAt: new Date(),
  };
  await db()
    .insert(characterQuests)
    .values({ characterId, questId: progress.questId, ...values })
    .onConflictDoUpdate({ target: [characterQuests.characterId, characterQuests.questId], set: values });
}

export async function questsFinishedBy(characterId: number): Promise<number> {
  const [row] = await db()
    .select({ total: count() })
    .from(characterQuests)
    .where(and(eq(characterQuests.characterId, characterId), sql`${characterQuests.times} > 0`));
  return Number(row?.total ?? 0);
}
