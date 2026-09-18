import { and, asc, count, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import {
  catalogItem,
  playerStats,
  xpForLevel,
  type AdminAccountPatch,
  type AdminCharacterInfo,
  type AdminCharacterPatch,
  type AdminDay,
  type AdminDetailResponse,
  type AdminLogRow,
  type AdminPlayerRow,
  type AdminSort,
  type AdminStats,
  type AdminUnlockRow,
} from "@zuna/shared";
import { db } from "./db/index.ts";
import { accounts, adminActions, characters, purchases, unlocks } from "./db/schema.ts";

// Consultas que só o painel de administração usa. O jogo em si não passa por aqui.

const int = sql<number>`cast(count(*) as int)`;
const number = (value: unknown) => Number(value ?? 0);

/** Marca como administrador as contas listadas em ADMIN_USERS (uma vez, ao subir o servidor). */
export async function ensureAdmins(usernames: string[]): Promise<string[]> {
  const wanted = usernames.map((name) => name.trim().toLowerCase()).filter((name) => name.length > 0);
  if (wanted.length === 0) return [];
  const rows = await db()
    .update(accounts)
    .set({ isAdmin: true })
    .where(and(inArray(accounts.username, wanted), eq(accounts.isAdmin, false)))
    .returning({ username: accounts.username });
  return rows.map((row) => row.username);
}

export async function isAdminAccount(accountId: number): Promise<boolean> {
  const [row] = await db().select({ isAdmin: accounts.isAdmin }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  return row?.isAdmin === true;
}

// ---------------------------------------------------------------- lista de jogadores

const ORDER = {
  level: [desc(characters.level), desc(characters.xp)],
  gold: [desc(characters.gold), desc(characters.level)],
  kills: [desc(characters.kills), desc(characters.level)],
  recent: [desc(accounts.createdAt)],
  name: [asc(accounts.username)],
} as const satisfies Record<AdminSort, unknown>;

/** Uma linha por personagem; contas sem personagem também aparecem. */
export async function listPlayersForAdmin(
  query: string,
  sort: AdminSort,
  limit: number,
  offset: number,
  online: Set<number>,
): Promise<{ players: AdminPlayerRow[]; total: number }> {
  const term = `%${query.trim()}%`;
  const filter = query.trim() ? or(ilike(accounts.username, term), ilike(characters.name, term)) : undefined;

  const rows = await db()
    .select({
      accountId: accounts.id,
      username: accounts.username,
      isAdmin: accounts.isAdmin,
      banned: accounts.banned,
      diamonds: accounts.diamonds,
      accountCreatedAt: accounts.createdAt,
      characterId: characters.id,
      name: characters.name,
      level: characters.level,
      xp: characters.xp,
      gold: characters.gold,
      kills: characters.kills,
      outfit: characters.outfit,
      lastLoginAt: characters.lastLoginAt,
    })
    .from(accounts)
    .leftJoin(characters, eq(characters.accountId, accounts.id))
    .where(filter)
    .orderBy(...ORDER[sort], asc(accounts.username))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db()
    .select({ total: count() })
    .from(accounts)
    .leftJoin(characters, eq(characters.accountId, accounts.id))
    .where(filter);

  const players: AdminPlayerRow[] = rows.map((row) => ({
    accountId: row.accountId,
    username: row.username,
    isAdmin: row.isAdmin,
    banned: row.banned,
    diamonds: row.diamonds,
    characterId: row.characterId,
    name: row.name ?? "",
    level: row.level ?? 0,
    xp: Math.round(row.xp ?? 0),
    gold: row.gold ?? 0,
    kills: row.kills ?? 0,
    outfit: row.outfit ?? "",
    online: row.characterId !== null && online.has(row.characterId),
    createdAt: row.accountCreatedAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  }));
  return { players, total };
}

// ---------------------------------------------------------------- ficha do jogador

/** Conta, personagens, itens, compras e o que já mexeram nela. */
export async function adminPlayerDetail(accountId: number, online: Set<number>): Promise<AdminDetailResponse | null> {
  const [account] = await db().select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!account) return null;

  const [rows, items, buys, log] = await Promise.all([
    db().select().from(characters).where(eq(characters.accountId, accountId)).orderBy(asc(characters.id)),
    db().select().from(unlocks).where(eq(unlocks.accountId, accountId)).orderBy(desc(unlocks.acquiredAt)),
    db().select().from(purchases).where(eq(purchases.accountId, accountId)).orderBy(desc(purchases.id)).limit(30),
    adminActionsForAccount(accountId, 20),
  ]);

  const list: AdminCharacterInfo[] = rows.map((row) => {
    const stats = playerStats(row.level);
    return {
      characterId: row.id,
      name: row.name,
      level: row.level,
      xp: Math.round(row.xp),
      xpToNext: Math.max(0, Math.round(xpForLevel(row.level + 1) - row.xp)),
      gold: row.gold,
      kills: row.kills,
      hp: row.hp,
      maxHp: stats.maxHp,
      mana: row.mana,
      maxMana: stats.maxMana,
      x: row.x,
      y: row.y,
      outfit: row.outfit,
      pet: row.pet,
      mount: row.mount,
      shortcuts: row.shortcuts ? row.shortcuts.split(",") : [],
      createdAt: row.createdAt.toISOString(),
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      online: online.has(row.id),
    };
  });

  const unlockRows: AdminUnlockRow[] = items.map((row) => {
    const item = catalogItem(row.itemId);
    return {
      itemId: row.itemId,
      name: item?.name ?? row.itemId,
      kind: item?.kind ?? "outfit",
      acquiredAt: row.acquiredAt.toISOString(),
    };
  });

  return {
    account: {
      accountId: account.id,
      username: account.username,
      diamonds: account.diamonds,
      isAdmin: account.isAdmin,
      banned: account.banned,
      banReason: account.banReason,
      createdAt: account.createdAt.toISOString(),
    },
    characters: list,
    unlocks: unlockRows,
    purchases: buys.map((row) => ({
      id: row.id,
      itemId: row.itemId,
      name: catalogItem(row.itemId)?.name ?? row.itemId,
      currency: row.currency,
      price: row.price,
      at: row.createdAt.toISOString(),
    })),
    log,
  };
}

// ---------------------------------------------------------------- mudanças

export type AdminWriteResult = { ok: true } | { ok: false; message: string };

export async function adminUpdateCharacter(patch: AdminCharacterPatch): Promise<AdminWriteResult> {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    values.name = patch.name;
    values.nameKey = patch.name.toLowerCase();
  }
  if (patch.level !== undefined) values.level = patch.level;
  if (patch.xp !== undefined) values.xp = patch.xp;
  if (patch.gold !== undefined) values.gold = patch.gold;
  if (patch.kills !== undefined) values.kills = patch.kills;
  if (patch.outfit !== undefined) values.outfit = patch.outfit;
  if (patch.pet !== undefined) values.pet = patch.pet;
  if (patch.mount !== undefined) {
    values.mount = patch.mount;
    if (!patch.mount) values.mounted = false;
  }
  if (patch.x !== undefined) values.x = patch.x;
  if (patch.y !== undefined) values.y = patch.y;
  // Subir de nível pelo painel também acerta a barra de vida e mana guardadas.
  if (patch.level !== undefined) {
    const stats = playerStats(patch.level);
    values.hp = stats.maxHp;
    values.mana = stats.maxMana;
  }

  try {
    const rows = await db()
      .update(characters)
      .set(values)
      .where(eq(characters.id, patch.characterId))
      .returning({ id: characters.id });
    if (rows.length === 0) return { ok: false, message: "Personagem não encontrado." };
    return { ok: true };
  } catch (error) {
    if (String(error).includes("name_key")) return { ok: false, message: "Esse nome já está em uso." };
    throw error;
  }
}

export async function adminUpdateAccount(patch: AdminAccountPatch, passwordHash?: string): Promise<AdminWriteResult> {
  const values: Record<string, unknown> = {};
  if (patch.diamonds !== undefined) values.diamonds = patch.diamonds;
  if (patch.isAdmin !== undefined) values.isAdmin = patch.isAdmin;
  if (patch.banned !== undefined) {
    values.banned = patch.banned;
    values.banReason = patch.banned ? (patch.banReason ?? "") : "";
  } else if (patch.banReason !== undefined) {
    values.banReason = patch.banReason;
  }
  if (passwordHash) values.passwordHash = passwordHash;

  if (Object.keys(values).length > 0) {
    const rows = await db().update(accounts).set(values).where(eq(accounts.id, patch.accountId)).returning({ id: accounts.id });
    if (rows.length === 0) return { ok: false, message: "Conta não encontrada." };
  }
  if (patch.unlock) {
    await db().insert(unlocks).values({ accountId: patch.accountId, itemId: patch.unlock }).onConflictDoNothing();
  }
  if (patch.revoke) {
    await db()
      .delete(unlocks)
      .where(and(eq(unlocks.accountId, patch.accountId), eq(unlocks.itemId, patch.revoke)));
  }
  return { ok: true };
}

/** Apaga um personagem e devolve o nome dele, para o registro. */
export async function adminDeleteCharacter(characterId: number): Promise<string | null> {
  const [row] = await db().delete(characters).where(eq(characters.id, characterId)).returning({ name: characters.name });
  return row?.name ?? null;
}

// ---------------------------------------------------------------- visão geral

export async function adminStats(online: number): Promise<AdminStats> {
  const [accountRow] = await db()
    .select({
      total: int,
      admins: sql<number>`cast(count(*) filter (where ${accounts.isAdmin}) as int)`,
      banned: sql<number>`cast(count(*) filter (where ${accounts.banned}) as int)`,
      today: sql<number>`cast(count(*) filter (where ${accounts.createdAt} >= now() - interval '1 day') as int)`,
      week: sql<number>`cast(count(*) filter (where ${accounts.createdAt} >= now() - interval '7 days') as int)`,
      diamonds: sql<number>`cast(coalesce(sum(${accounts.diamonds}), 0) as double precision)`,
    })
    .from(accounts);

  const [characterRow] = await db()
    .select({
      total: int,
      today: sql<number>`cast(count(*) filter (where ${characters.createdAt} >= now() - interval '1 day') as int)`,
      gold: sql<number>`cast(coalesce(sum(${characters.gold}), 0) as double precision)`,
      kills: sql<number>`cast(coalesce(sum(${characters.kills}), 0) as double precision)`,
      topLevel: sql<number>`cast(coalesce(max(${characters.level}), 0) as int)`,
    })
    .from(characters);

  const [purchaseRow] = await db()
    .select({
      total: int,
      gold: sql<number>`cast(coalesce(sum(${purchases.price}) filter (where ${purchases.currency} = 'gold'), 0) as double precision)`,
      diamonds: sql<number>`cast(coalesce(sum(${purchases.price}) filter (where ${purchases.currency} = 'diamonds'), 0) as double precision)`,
    })
    .from(purchases);

  return {
    accounts: number(accountRow?.total),
    admins: number(accountRow?.admins),
    banned: number(accountRow?.banned),
    accountsToday: number(accountRow?.today),
    accountsWeek: number(accountRow?.week),
    diamonds: number(accountRow?.diamonds),
    characters: number(characterRow?.total),
    charactersToday: number(characterRow?.today),
    gold: number(characterRow?.gold),
    kills: number(characterRow?.kills),
    topLevel: number(characterRow?.topLevel),
    purchases: number(purchaseRow?.total),
    spentGold: number(purchaseRow?.gold),
    spentDiamonds: number(purchaseRow?.diamonds),
    online,
  };
}

/** Contas e personagens criados por dia, do mais antigo para o mais novo. */
export async function adminDays(days: number): Promise<AdminDay[]> {
  const since = new Date(Date.now() - (days - 1) * 86_400_000);
  since.setHours(0, 0, 0, 0);

  const [accountRows, characterRows] = await Promise.all([
    db()
      .select({ day: sql<string>`to_char(${accounts.createdAt}, 'YYYY-MM-DD')`, total: int })
      .from(accounts)
      .where(gte(accounts.createdAt, since))
      .groupBy(sql`1`),
    db()
      .select({ day: sql<string>`to_char(${characters.createdAt}, 'YYYY-MM-DD')`, total: int })
      .from(characters)
      .where(gte(characters.createdAt, since))
      .groupBy(sql`1`),
  ]);

  const byDay = new Map<string, AdminDay>();
  for (let i = 0; i < days; i++) {
    const date = new Date(since.getTime() + i * 86_400_000);
    const day = date.toISOString().slice(0, 10);
    byDay.set(day, { day, accounts: 0, characters: 0 });
  }
  for (const row of accountRows) {
    const entry = byDay.get(row.day);
    if (entry) entry.accounts = number(row.total);
  }
  for (const row of characterRows) {
    const entry = byDay.get(row.day);
    if (entry) entry.characters = number(row.total);
  }
  return [...byDay.values()];
}

// ---------------------------------------------------------------- histórico

export async function logAdminAction(entry: {
  accountId: number;
  action: string;
  detail: unknown;
  targetAccountId?: number | null;
  targetCharacterId?: number | null;
}) {
  await db()
    .insert(adminActions)
    .values({
      accountId: entry.accountId,
      action: entry.action,
      detail: typeof entry.detail === "string" ? entry.detail : JSON.stringify(entry.detail ?? {}),
      targetAccountId: entry.targetAccountId ?? null,
      targetCharacterId: entry.targetCharacterId ?? null,
    });
}

function logQuery() {
  return db()
    .select({
      id: adminActions.id,
      action: adminActions.action,
      detail: adminActions.detail,
      at: adminActions.createdAt,
      admin: accounts.username,
      targetName: characters.name,
      targetAccount: adminActions.targetAccountId,
    })
    .from(adminActions)
    .leftJoin(accounts, eq(accounts.id, adminActions.accountId))
    .leftJoin(characters, eq(characters.id, adminActions.targetCharacterId));
}

type LogRow = Awaited<ReturnType<ReturnType<typeof logQuery>["execute"]>>[number];

function toLogRow(row: LogRow): AdminLogRow {
  return {
    id: row.id,
    admin: row.admin ?? "?",
    action: row.action,
    detail: row.detail,
    target: row.targetName ?? (row.targetAccount ? `conta ${row.targetAccount}` : "—"),
    at: row.at.toISOString(),
  };
}

export async function listAdminActions(limit: number, query = ""): Promise<AdminLogRow[]> {
  const term = `%${query.trim()}%`;
  const filter = query.trim()
    ? or(ilike(accounts.username, term), ilike(characters.name, term), ilike(adminActions.action, term))
    : undefined;
  const rows = await logQuery().where(filter).orderBy(desc(adminActions.id)).limit(limit);
  return rows.map(toLogRow);
}

export async function adminActionsForAccount(accountId: number, limit: number): Promise<AdminLogRow[]> {
  const rows = await logQuery().where(eq(adminActions.targetAccountId, accountId)).orderBy(desc(adminActions.id)).limit(limit);
  return rows.map(toLogRow);
}
