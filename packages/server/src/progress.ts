import { asc, count, eq } from "drizzle-orm";
import {
  DEFAULT_PROGRESS_SETTINGS,
  LEVEL_REWARD_MAX_LEVEL,
  XP_RATE_MAX,
  milestoneList,
  type LevelReward,
  type ProgressSettings,
} from "@zuna/shared";
import { db } from "./db/index.ts";
import { characterMilestones, levelRewards, serverMeta } from "./db/schema.ts";

// Progressão no banco: a taxa de XP e os baús de marco (editados no painel) ficam em memória;
// o que cada personagem já recebeu é gravado para o baú não pagar duas vezes.

const SEED_KEY = "marcos";
const SETTINGS_KEY = "progressao-config";

type RewardRow = typeof levelRewards.$inferSelect;

function toReward(row: RewardRow): LevelReward {
  return {
    id: row.id,
    level: Math.max(2, row.level),
    name: row.name,
    rewardGold: row.rewardGold,
    rewardDiamonds: row.rewardDiamonds,
    rewardItem: row.rewardItem,
    rewardItemCount: Math.max(1, row.rewardItemCount),
    enabled: row.enabled,
  };
}

/**
 * Marcos de fábrica: um baú a cada dez níveis no começo e a cada vinte depois.
 * Os diamantes são por personagem, então ficam curtos de propósito.
 */
const FACTORY_REWARDS: Omit<LevelReward, "id">[] = [
  { level: 5, name: "Primeiros Passos", rewardGold: 400, rewardDiamonds: 0, rewardItem: "pocao-vida", rewardItemCount: 10, enabled: true },
  { level: 10, name: "Aventureiro", rewardGold: 1500, rewardDiamonds: 0, rewardItem: "pocao-mana", rewardItemCount: 10, enabled: true },
  { level: 20, name: "Caçador", rewardGold: 5000, rewardDiamonds: 5, rewardItem: "", rewardItemCount: 1, enabled: true },
  { level: 30, name: "Veterano", rewardGold: 12000, rewardDiamonds: 0, rewardItem: "pocao-vida-forte", rewardItemCount: 15, enabled: true },
  { level: 40, name: "Bravo", rewardGold: 25000, rewardDiamonds: 10, rewardItem: "", rewardItemCount: 1, enabled: true },
  { level: 50, name: "Herói de Zuna", rewardGold: 50000, rewardDiamonds: 15, rewardItem: "pocao-vida-suprema", rewardItemCount: 10, enabled: true },
  { level: 70, name: "Lenda Viva", rewardGold: 120000, rewardDiamonds: 20, rewardItem: "", rewardItemCount: 1, enabled: true },
  { level: 90, name: "Domador de Dragões", rewardGold: 250000, rewardDiamonds: 25, rewardItem: "pocao-mana-suprema", rewardItemCount: 15, enabled: true },
  { level: 110, name: "Senhor do Abismo", rewardGold: 500000, rewardDiamonds: 40, rewardItem: "", rewardItemCount: 1, enabled: true },
  { level: 150, name: "Imortal", rewardGold: 1000000, rewardDiamonds: 60, rewardItem: "", rewardItemCount: 1, enabled: true },
];

let catalog: LevelReward[] = [];
let settings: ProgressSettings = { ...DEFAULT_PROGRESS_SETTINGS };

async function metaValue(key: string): Promise<string | null> {
  const [row] = await db().select().from(serverMeta).where(eq(serverMeta.key, key)).limit(1);
  return row?.value ?? null;
}

async function setMeta(key: string, value: string) {
  await db()
    .insert(serverMeta)
    .values({ key, value })
    .onConflictDoUpdate({ target: serverMeta.key, set: { value, updatedAt: new Date() } });
}

function clampRate(value: unknown): number {
  const rate = Number(value);
  return Number.isFinite(rate) ? Math.min(XP_RATE_MAX, Math.max(0, Math.round(rate * 100) / 100)) : 1;
}

export async function reloadProgress() {
  const rows = await db().select().from(levelRewards).orderBy(asc(levelRewards.level), asc(levelRewards.id));
  catalog = rows.map(toReward);
  const raw = await metaValue(SETTINGS_KEY);
  try {
    settings = { xpRate: clampRate(raw ? (JSON.parse(raw) as ProgressSettings).xpRate : 1) };
  } catch {
    settings = { ...DEFAULT_PROGRESS_SETTINGS };
  }
}

/** Primeiro arranque: grava os marcos de fábrica. Depois disso, quem manda é o painel. */
export async function ensureProgressSeed() {
  if ((await metaValue(SEED_KEY)) !== "fabrica-v1") {
    await db().insert(levelRewards).values(FACTORY_REWARDS.map((reward) => ({ ...reward })));
    await setMeta(SEED_KEY, "fabrica-v1");
  }
  await reloadProgress();
}

export function levelRewardsAll(): LevelReward[] {
  return catalog;
}

export function progressSettings(): ProgressSettings {
  return settings;
}

/** Multiplicador de XP do painel (o evento do mundo e os bônus do jogador vêm por cima). */
export function xpRate(): number {
  return settings.xpRate;
}

export async function saveProgressSettings(change: Partial<ProgressSettings>) {
  settings = { xpRate: clampRate(change.xpRate ?? settings.xpRate) };
  await setMeta(SETTINGS_KEY, JSON.stringify(settings));
}

export async function saveLevelReward(reward: Omit<LevelReward, "id"> & { id: number }): Promise<LevelReward | undefined> {
  const { id, ...values } = reward;
  values.level = Math.min(LEVEL_REWARD_MAX_LEVEL, Math.max(2, values.level));
  if (id > 0) await db().update(levelRewards).set(values).where(eq(levelRewards.id, id));
  else await db().insert(levelRewards).values(values);
  await reloadProgress();
  return id > 0 ? catalog.find((entry) => entry.id === id) : catalog[catalog.length - 1];
}

export async function removeLevelReward(id: number) {
  await db().delete(levelRewards).where(eq(levelRewards.id, id));
  await reloadProgress();
}

export async function levelRewardsGiven(): Promise<number> {
  const [row] = await db().select({ total: count() }).from(characterMilestones);
  return Number(row?.total ?? 0);
}

// ---------------------------------------------------------------- marcos de cada personagem

export async function takenMilestones(characterId: number): Promise<number[]> {
  const rows = await db()
    .select({ level: characterMilestones.level })
    .from(characterMilestones)
    .where(eq(characterMilestones.characterId, characterId));
  return rows.map((row) => row.level);
}

/**
 * Marca os baús como entregues e devolve só os que ainda não tinham sido pagos.
 * A gravação ignora o que já existe, então duas entregas ao mesmo tempo não pagam duas vezes.
 */
export async function claimMilestones(characterId: number, levels: number[]): Promise<number[]> {
  if (levels.length === 0) return [];
  const saved = await db()
    .insert(characterMilestones)
    .values(levels.map((level) => ({ characterId, level })))
    .onConflictDoNothing()
    .returning({ level: characterMilestones.level });
  return saved.map((row) => row.level);
}

/** Baús que este personagem já deveria ter pelo nível, mas ainda não recebeu. */
export async function pendingMilestones(characterId: number, level: number): Promise<LevelReward[]> {
  const due = milestoneList(catalog).filter((reward) => reward.level <= level);
  if (due.length === 0) return [];
  const taken = new Set(await takenMilestones(characterId));
  return due.filter((reward) => !taken.has(reward.level));
}
