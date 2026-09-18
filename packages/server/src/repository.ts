import { and, asc, count, desc, eq, gte, sql } from "drizzle-orm";
import {
  MAX_CHARACTERS,
  TEMPLE_X,
  TEMPLE_Y,
  catalogItem,
  playerStats,
  type Appearance,
  type CharacterSummary,
  type RankingBoard,
  type RankingRow,
} from "@zuna/shared";
import { db } from "./db/index.ts";
import { accounts, characters, purchases, unlocks } from "./db/schema.ts";

export type AccountRow = typeof accounts.$inferSelect;
export type CharacterRow = typeof characters.$inferSelect;

export function appearanceFromRow(row: CharacterRow): Appearance {
  return {
    skin: row.skin,
    hairColor: row.hairColor,
    outfit: row.outfit,
    primary: row.colorPrimary,
    secondary: row.colorSecondary,
    detail: row.colorDetail,
  };
}

export function summaryFromRow(row: CharacterRow): CharacterSummary {
  return { id: row.id, name: row.name, level: row.level, appearance: appearanceFromRow(row) };
}

// ---------------------------------------------------------------- contas

export async function findAccountByUsername(username: string): Promise<AccountRow | undefined> {
  const [row] = await db().select().from(accounts).where(eq(accounts.username, username)).limit(1);
  return row;
}

/** Retorna o id da conta criada, ou null se o usuário já existe. */
export async function createAccount(username: string, passwordHash: string): Promise<number | null> {
  const [row] = await db()
    .insert(accounts)
    .values({ username, passwordHash })
    .onConflictDoNothing({ target: accounts.username })
    .returning({ id: accounts.id });
  return row?.id ?? null;
}

export async function getAccount(accountId: number): Promise<AccountRow | undefined> {
  const [row] = await db().select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  return row;
}

export async function addDiamonds(accountId: number, amount: number): Promise<number> {
  const [row] = await db()
    .update(accounts)
    .set({ diamonds: sql`${accounts.diamonds} + ${amount}` })
    .where(eq(accounts.id, accountId))
    .returning({ diamonds: accounts.diamonds });
  return row?.diamonds ?? 0;
}

export async function listUnlocks(accountId: number): Promise<string[]> {
  const rows = await db().select({ itemId: unlocks.itemId }).from(unlocks).where(eq(unlocks.accountId, accountId));
  return rows.map((row) => row.itemId);
}

// ---------------------------------------------------------------- personagens

export async function listCharacters(accountId: number): Promise<CharacterRow[]> {
  return db().select().from(characters).where(eq(characters.accountId, accountId)).orderBy(asc(characters.id));
}

export async function loadCharacter(accountId: number, characterId: number): Promise<CharacterRow | undefined> {
  const [row] = await db()
    .select()
    .from(characters)
    .where(and(eq(characters.id, characterId), eq(characters.accountId, accountId)))
    .limit(1);
  return row;
}

export type CreateCharacterResult =
  | { ok: true; row: CharacterRow }
  | { ok: false; status: 409; message: string };

export async function createCharacter(accountId: number, name: string, appearance: Appearance): Promise<CreateCharacterResult> {
  return db().transaction(async (tx): Promise<CreateCharacterResult> => {
    const [{ total }] = await tx.select({ total: count() }).from(characters).where(eq(characters.accountId, accountId));
    if (total >= MAX_CHARACTERS) {
      return { ok: false, status: 409, message: `Cada conta pode ter até ${MAX_CHARACTERS} personagens.` };
    }
    const stats = playerStats(1);
    const [row] = await tx
      .insert(characters)
      .values({
        accountId,
        name,
        nameKey: name.toLowerCase(),
        hp: stats.maxHp,
        mana: stats.maxMana,
        x: TEMPLE_X,
        y: TEMPLE_Y,
        skin: appearance.skin,
        hairColor: appearance.hairColor,
        outfit: appearance.outfit,
        colorPrimary: appearance.primary,
        colorSecondary: appearance.secondary,
        colorDetail: appearance.detail,
      })
      .onConflictDoNothing({ target: characters.nameKey })
      .returning();
    if (!row) return { ok: false, status: 409, message: "Esse nome já está em uso." };
    return { ok: true, row };
  });
}

export interface CharacterSnapshot {
  id: number;
  level: number;
  kills: number;
  /** Ids dos poderes na barra, na ordem das teclas. */
  shortcuts: string[];
  xp: number;
  hp: number;
  mana: number;
  gold: number;
  x: number;
  y: number;
  appearance: Appearance;
  pet: string;
  mount: string;
  mounted: boolean;
}

export async function saveCharacter(snapshot: CharacterSnapshot) {
  const { appearance } = snapshot;
  await db()
    .update(characters)
    .set({
      level: snapshot.level,
      xp: snapshot.xp,
      hp: snapshot.hp,
      mana: snapshot.mana,
      gold: snapshot.gold,
      kills: snapshot.kills,
      shortcuts: snapshot.shortcuts.join(","),
      x: snapshot.x,
      y: snapshot.y,
      skin: appearance.skin,
      hairColor: appearance.hairColor,
      outfit: appearance.outfit,
      colorPrimary: appearance.primary,
      colorSecondary: appearance.secondary,
      colorDetail: appearance.detail,
      pet: snapshot.pet,
      mount: snapshot.mount,
      mounted: snapshot.mounted,
      updatedAt: new Date(),
    })
    .where(eq(characters.id, snapshot.id));
}

/** Top do ranking. `level` desempata pela experiência; `kills`, pelo nível. */
export async function topCharacters(board: RankingBoard, limit: number): Promise<RankingRow[]> {
  const order =
    board === "gold"
      ? [desc(characters.gold), desc(characters.level)]
      : board === "kills"
        ? [desc(characters.kills), desc(characters.level)]
        : [desc(characters.level), desc(characters.xp)];
  const rows = await db()
    .select({
      name: characters.name,
      level: characters.level,
      xp: characters.xp,
      gold: characters.gold,
      kills: characters.kills,
      outfit: characters.outfit,
    })
    .from(characters)
    .orderBy(...order)
    .limit(limit);
  return rows.map((row, index) => ({
    rank: index + 1,
    name: row.name,
    level: row.level,
    outfit: row.outfit,
    value: board === "gold" ? row.gold : board === "kills" ? row.kills : Math.round(row.xp),
  }));
}

export async function markLogin(characterId: number) {
  await db().update(characters).set({ lastLoginAt: new Date() }).where(eq(characters.id, characterId));
}

// ---------------------------------------------------------------- compras

export type PurchaseResult = { ok: true; diamonds: number } | { ok: false; message: string };

/**
 * Compra atômica: tudo ou nada.
 * - Ouro: o valor da memória (o servidor manda no personagem online) é gravado já descontado.
 * - Diamantes: debitados na conta com a checagem de saldo dentro do próprio UPDATE.
 */
export async function purchaseItem(params: {
  accountId: number;
  characterId: number;
  itemId: string;
  currentGold: number;
}): Promise<PurchaseResult> {
  const item = catalogItem(params.itemId);
  if (!item || item.price === 0) return { ok: false, message: "Item indisponível." };

  return db().transaction(async (tx): Promise<PurchaseResult> => {
    const [owned] = await tx
      .select({ itemId: unlocks.itemId })
      .from(unlocks)
      .where(and(eq(unlocks.accountId, params.accountId), eq(unlocks.itemId, item.id)))
      .limit(1);
    if (owned) return { ok: false, message: "Você já tem esse item." };

    let diamonds: number;
    if (item.currency === "gold") {
      if (params.currentGold < item.price) return { ok: false, message: "Ouro insuficiente." };
      await tx
        .update(characters)
        .set({ gold: params.currentGold - item.price, updatedAt: new Date() })
        .where(eq(characters.id, params.characterId));
      const [account] = await tx
        .select({ diamonds: accounts.diamonds })
        .from(accounts)
        .where(eq(accounts.id, params.accountId));
      diamonds = account?.diamonds ?? 0;
    } else {
      const [account] = await tx
        .update(accounts)
        .set({ diamonds: sql`${accounts.diamonds} - ${item.price}` })
        .where(and(eq(accounts.id, params.accountId), gte(accounts.diamonds, item.price)))
        .returning({ diamonds: accounts.diamonds });
      if (!account) return { ok: false, message: "Diamantes insuficientes." };
      diamonds = account.diamonds;
    }

    await tx.insert(unlocks).values({ accountId: params.accountId, itemId: item.id });
    await tx.insert(purchases).values({
      accountId: params.accountId,
      characterId: params.characterId,
      itemId: item.id,
      currency: item.currency,
      price: item.price,
    });
    return { ok: true, diamonds };
  });
}

// ---------------------------------------------------------------- bloqueio

/** Uma conta bloqueada não entra no jogo; o motivo aparece para quem tenta. */
export async function accountBan(accountId: number): Promise<{ banned: boolean; reason: string }> {
  const [row] = await db()
    .select({ banned: accounts.banned, reason: accounts.banReason })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  return { banned: row?.banned === true, reason: row?.reason ?? "" };
}
