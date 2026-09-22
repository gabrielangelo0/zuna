import { asc, count, eq, sql } from "drizzle-orm";
import {
  DEFAULT_VOCATION_SETTINGS,
  FACTORY_VOCATIONS,
  SPELL_FAMILIES,
  setVocationCatalog,
  vocationList,
  type VocationDef,
  type VocationSettings,
} from "@zuna/shared";
import { db } from "./db/index.ts";
import { accounts, characters, serverMeta, vocations } from "./db/schema.ts";

// Classes no banco: a lista (editada no painel) fica em memória, no mesmo `setVocationCatalog`
// que o cliente usa, e o preço da troca vive em server_meta.

const SEED_KEY = "classes";
const SETTINGS_KEY = "classes-config";

type VocationRow = typeof vocations.$inferSelect;

/** Só famílias que existem de verdade entram na classe. */
function cleanFamilies(list: readonly string[]): string[] {
  const known = new Set(SPELL_FAMILIES.map((family) => family.family));
  return [...new Set(list.map((name) => name.trim()).filter((name) => known.has(name)))];
}

function toVocation(row: VocationRow): VocationDef {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    hpBase: row.hpBase,
    hpPerLevel: row.hpPerLevel,
    manaBase: row.manaBase,
    manaPerLevel: row.manaPerLevel,
    attackFactor: row.attackFactor,
    magicFactor: row.magicFactor,
    armorFactor: row.armorFactor,
    families: cleanFamilies(row.families ? row.families.split(",") : []),
    outfit: row.outfit,
    enabled: row.enabled,
    sort: row.sort,
  };
}

function toRow(vocation: VocationDef) {
  const { families, ...rest } = vocation;
  return { ...rest, families: cleanFamilies(families).join(",") };
}

let settings: VocationSettings = { ...DEFAULT_VOCATION_SETTINGS };

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

export async function reloadVocations() {
  const rows = await db().select().from(vocations).orderBy(asc(vocations.sort), asc(vocations.id));
  setVocationCatalog(rows.map(toVocation));
  const raw = await metaValue(SETTINGS_KEY);
  try {
    const saved = raw ? (JSON.parse(raw) as Partial<VocationSettings>) : {};
    settings = { changePrice: Math.max(0, Math.round(Number(saved.changePrice ?? DEFAULT_VOCATION_SETTINGS.changePrice)) || 0) };
  } catch {
    settings = { ...DEFAULT_VOCATION_SETTINGS };
  }
}

/** Primeiro arranque: grava as quatro de fábrica. Depois disso, quem manda é o painel. */
export async function ensureVocationSeed() {
  if ((await metaValue(SEED_KEY)) !== "fabrica-v1") {
    await db()
      .insert(vocations)
      .values(FACTORY_VOCATIONS.map(toRow))
      .onConflictDoNothing();
    await setMeta(SEED_KEY, "fabrica-v1");
  }
  await reloadVocations();
}

export function vocationSettings(): VocationSettings {
  return settings;
}

export async function saveVocationSettings(change: Partial<VocationSettings>) {
  settings = { changePrice: Math.max(0, Math.round(Number(change.changePrice ?? settings.changePrice)) || 0) };
  await setMeta(SETTINGS_KEY, JSON.stringify(settings));
}

export async function saveVocation(vocation: VocationDef, isNew: boolean) {
  const row = toRow(vocation);
  if (isNew) await db().insert(vocations).values(row);
  else {
    const { id, ...values } = row;
    await db().update(vocations).set(values).where(eq(vocations.id, id));
  }
  await reloadVocations();
}

/** Apaga a classe e deixa sem classe quem era dela (o jogador escolhe de novo, de graça). */
export async function removeVocation(id: string) {
  await db().transaction(async (tx) => {
    await tx.update(characters).set({ vocation: "" }).where(eq(characters.vocation, id));
    await tx.delete(vocations).where(eq(vocations.id, id));
  });
  await reloadVocations();
}

/** Quantos personagens em cada classe, e quantos ainda não escolheram. */
export async function vocationCounts(): Promise<{ players: Map<string, number>; without: number }> {
  const rows = await db()
    .select({ vocation: characters.vocation, total: count() })
    .from(characters)
    .groupBy(characters.vocation);
  const players = new Map<string, number>();
  let without = 0;
  for (const row of rows) {
    if (row.vocation) players.set(row.vocation, Number(row.total));
    else without += Number(row.total);
  }
  return { players, without };
}

/**
 * Grava a classe do personagem. A troca é paga: a conta só perde os diamantes se ainda
 * tiver o saldo, então dois pedidos ao mesmo tempo não cobram duas vezes.
 */
export async function saveCharacterVocation(characterId: number, vocation: string) {
  await db().update(characters).set({ vocation }).where(eq(characters.id, characterId));
}

export { vocationList };

/** Primeira escolha é de graça; da segunda em diante paga. */
export function vocationChangeCost(current: string): number {
  return current ? settings.changePrice : 0;
}

/** Tira os diamantes da conta só se houver saldo. Devolve o novo saldo, ou null quando falta. */
export async function chargeDiamonds(accountId: number, amount: number): Promise<number | null> {
  if (amount <= 0) return null;
  const [row] = await db()
    .update(accounts)
    .set({ diamonds: sql`${accounts.diamonds} - ${amount}` })
    .where(sql`${accounts.id} = ${accountId} and ${accounts.diamonds} >= ${amount}`)
    .returning({ diamonds: accounts.diamonds });
  return row ? row.diamonds : null;
}
