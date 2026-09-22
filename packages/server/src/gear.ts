import { and, asc, count, eq, gte, sql } from "drizzle-orm";
import {
  EQUIP_SLOTS,
  FACTORY_GEAR,
  ITEM_RARITIES,
  setGearCatalog,
  gearList,
  type EquipSlot,
  type GearDef,
  type ItemRarity,
  type OwnedItem,
} from "@zuna/shared";
import { db } from "./db/index.ts";
import { accounts, characterItems, gearItems, purchases, serverMeta } from "./db/schema.ts";

// Equipamentos no banco: o catálogo (editado no painel) e os itens de cada personagem.
// O catálogo fica em memória, no mesmo `setGearCatalog` que o cliente usa.

const SEED_KEY = "equipamentos";
const SETTINGS_KEY = "equipamentos-config";

export interface GearSettings {
  /** Multiplica a chance de todos os drops de itens (1 = normal). */
  dropRate: number;
}

let settings: GearSettings = { dropRate: 1 };

type GearRow = typeof gearItems.$inferSelect;

function toGear(row: GearRow): GearDef {
  return {
    id: row.id,
    name: row.name,
    slot: (EQUIP_SLOTS.includes(row.slot as EquipSlot) ? row.slot : "weapon") as EquipSlot,
    icon: row.icon,
    rarity: (ITEM_RARITIES.includes(row.rarity as ItemRarity) ? row.rarity : "comum") as ItemRarity,
    level: row.level,
    attack: row.attack,
    defense: row.defense,
    hp: row.hp,
    mana: row.mana,
    priceGold: row.priceGold,
    priceDiamonds: row.priceDiamonds,
    sellGold: row.sellGold,
    drops: row.drops,
    enabled: row.enabled,
  };
}

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

export async function reloadGear() {
  const rows = await db().select().from(gearItems).orderBy(asc(gearItems.level), asc(gearItems.name));
  setGearCatalog(rows.map(toGear));
  const raw = await metaValue(SETTINGS_KEY);
  try {
    const saved = raw ? (JSON.parse(raw) as Partial<GearSettings>) : {};
    settings = { dropRate: clampRate(saved.dropRate ?? 1) };
  } catch {
    settings = { dropRate: 1 };
  }
}

function clampRate(value: number): number {
  return Number.isFinite(value) ? Math.min(20, Math.max(0, value)) : 1;
}

/** Primeiro arranque: grava os itens de fábrica. Depois, o que o painel apagou não volta. */
export async function ensureGearSeed() {
  if ((await metaValue(SEED_KEY)) === null) {
    await db()
      .insert(gearItems)
      .values(FACTORY_GEAR.map((item) => ({ ...item })))
      .onConflictDoNothing();
    await setMeta(SEED_KEY, "fabrica-v1");
  }
  await reloadGear();
}

export function gearSettings(): GearSettings {
  return settings;
}

export async function saveGearSettings(change: Partial<GearSettings>) {
  settings = { dropRate: clampRate(change.dropRate ?? settings.dropRate) };
  await setMeta(SETTINGS_KEY, JSON.stringify(settings));
}

export async function saveGear(item: GearDef, isNew: boolean) {
  const { id, ...values } = item;
  if (isNew) await db().insert(gearItems).values(item);
  else await db().update(gearItems).set(values).where(eq(gearItems.id, id));
  await reloadGear();
}

/** Apaga do catálogo e de todos os personagens. */
export async function removeGear(id: string) {
  await db().transaction(async (tx) => {
    await tx.delete(characterItems).where(eq(characterItems.itemId, id));
    await tx.delete(gearItems).where(eq(gearItems.id, id));
  });
  await reloadGear();
}

/** Quantos personagens têm cada item. */
export async function gearOwners(): Promise<Map<string, number>> {
  const rows = await db()
    .select({ itemId: characterItems.itemId, owners: count() })
    .from(characterItems)
    .groupBy(characterItems.itemId);
  return new Map(rows.map((row) => [row.itemId, Number(row.owners)]));
}

export function allGear(): GearDef[] {
  return gearList();
}

// ---------------------------------------------------------------- itens dos personagens

export async function listCharacterItems(characterId: number): Promise<OwnedItem[]> {
  const rows = await db()
    .select()
    .from(characterItems)
    .where(eq(characterItems.characterId, characterId))
    .orderBy(asc(characterItems.id));
  return rows.map((row) => ({
    uid: row.id,
    itemId: row.itemId,
    equipped: (EQUIP_SLOTS.includes(row.equipped as EquipSlot) ? row.equipped : "") as EquipSlot | "",
  }));
}

export async function addCharacterItem(characterId: number, itemId: string): Promise<number> {
  const [row] = await db().insert(characterItems).values({ characterId, itemId }).returning({ id: characterItems.id });
  return row!.id;
}

export async function setItemEquipped(characterId: number, uid: number, equipped: EquipSlot | "") {
  await db()
    .update(characterItems)
    .set({ equipped })
    .where(and(eq(characterItems.id, uid), eq(characterItems.characterId, characterId)));
}

export async function removeCharacterItem(characterId: number, uid: number): Promise<boolean> {
  const rows = await db()
    .delete(characterItems)
    .where(and(eq(characterItems.id, uid), eq(characterItems.characterId, characterId)))
    .returning({ id: characterItems.id });
  return rows.length > 0;
}

export async function countBagItems(characterId: number): Promise<number> {
  const [row] = await db()
    .select({ total: sql<number>`cast(count(*) as integer)` })
    .from(characterItems)
    .where(and(eq(characterItems.characterId, characterId), eq(characterItems.equipped, "")));
  return row?.total ?? 0;
}

export type GearPurchase = { ok: true; diamonds: number; uid: number } | { ok: false; message: string };

/** Compra com diamantes: debita, entrega e registra, tudo ou nada. */
export async function buyGearWithDiamonds(params: {
  accountId: number;
  characterId: number;
  item: GearDef;
  price: number;
}): Promise<GearPurchase> {
  return db().transaction(async (tx): Promise<GearPurchase> => {
    const [account] = await tx
      .update(accounts)
      .set({ diamonds: sql`${accounts.diamonds} - ${params.price}` })
      .where(and(eq(accounts.id, params.accountId), gte(accounts.diamonds, params.price)))
      .returning({ diamonds: accounts.diamonds });
    if (!account) return { ok: false, message: "Diamantes insuficientes." };
    const [row] = await tx
      .insert(characterItems)
      .values({ characterId: params.characterId, itemId: params.item.id })
      .returning({ id: characterItems.id });
    await tx.insert(purchases).values({
      accountId: params.accountId,
      characterId: params.characterId,
      itemId: `equip:${params.item.id}`,
      currency: "diamonds",
      price: params.price,
    });
    return { ok: true, diamonds: account.diamonds, uid: row!.id };
  });
}
