import { asc, count, eq, sql } from "drizzle-orm";
import {
  CHECKIN_MAX_DAYS,
  CHECKIN_MAX_OFFSET,
  DEFAULT_CHECKIN_SETTINGS,
  checkinDayAt,
  checkinDayKey,
  checkinNextTurn,
  checkinPreviousKey,
  type CheckinDay,
  type CheckinSettings,
  type CheckinState,
} from "@zuna/shared";
import { db } from "./db/index.ts";
import { accountCheckin, checkinDays, serverMeta } from "./db/schema.ts";

// Check-in diário no banco: o ciclo de dias (editado no painel) fica em memória e a
// sequência de cada conta é gravada quando ela abre o presente.

const SEED_KEY = "checkin";
const SETTINGS_KEY = "checkin-config";

type DayRow = typeof checkinDays.$inferSelect;

function toDay(row: DayRow): CheckinDay {
  return {
    id: row.id,
    day: Math.max(1, row.day),
    rewardGold: row.rewardGold,
    rewardDiamonds: row.rewardDiamonds,
    rewardXp: row.rewardXp,
    rewardItem: row.rewardItem,
    rewardItemCount: Math.max(1, row.rewardItemCount),
    highlight: row.highlight,
    enabled: row.enabled,
  };
}

/** Ciclo de fábrica: sete dias, subindo, com o presente bom no sétimo. */
const FACTORY_DAYS: Omit<CheckinDay, "id">[] = [
  { day: 1, rewardGold: 500, rewardDiamonds: 0, rewardXp: 0, rewardItem: "pocao-vida", rewardItemCount: 5, highlight: false, enabled: true },
  { day: 2, rewardGold: 1200, rewardDiamonds: 0, rewardXp: 800, rewardItem: "", rewardItemCount: 1, highlight: false, enabled: true },
  { day: 3, rewardGold: 0, rewardDiamonds: 5, rewardXp: 0, rewardItem: "", rewardItemCount: 1, highlight: false, enabled: true },
  { day: 4, rewardGold: 2500, rewardDiamonds: 0, rewardXp: 2500, rewardItem: "pocao-mana", rewardItemCount: 5, highlight: false, enabled: true },
  { day: 5, rewardGold: 4000, rewardDiamonds: 0, rewardXp: 5000, rewardItem: "", rewardItemCount: 1, highlight: false, enabled: true },
  { day: 6, rewardGold: 0, rewardDiamonds: 15, rewardXp: 8000, rewardItem: "", rewardItemCount: 1, highlight: false, enabled: true },
  { day: 7, rewardGold: 10000, rewardDiamonds: 40, rewardXp: 20000, rewardItem: "pocao-vida-forte", rewardItemCount: 10, highlight: true, enabled: true },
];

let catalog: CheckinDay[] = [];
let settings: CheckinSettings = { ...DEFAULT_CHECKIN_SETTINGS };

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

function clampSettings(change: Partial<CheckinSettings>): CheckinSettings {
  const offset = Number(change.offsetHours ?? settings.offsetHours);
  return {
    enabled: change.enabled ?? settings.enabled,
    resetOnMiss: change.resetOnMiss ?? settings.resetOnMiss,
    offsetHours: Number.isFinite(offset) ? Math.min(CHECKIN_MAX_OFFSET, Math.max(-CHECKIN_MAX_OFFSET, Math.round(offset))) : -3,
  };
}

export async function reloadCheckin() {
  const rows = await db().select().from(checkinDays).orderBy(asc(checkinDays.day), asc(checkinDays.id));
  catalog = rows.map(toDay);
  const raw = await metaValue(SETTINGS_KEY);
  try {
    settings = raw ? clampSettings(JSON.parse(raw) as Partial<CheckinSettings>) : { ...DEFAULT_CHECKIN_SETTINGS };
  } catch {
    settings = { ...DEFAULT_CHECKIN_SETTINGS };
  }
}

/** Primeiro arranque: grava o ciclo de fábrica. Depois disso, quem manda é o painel. */
export async function ensureCheckinSeed() {
  if ((await metaValue(SEED_KEY)) !== "fabrica-v1") {
    await db().insert(checkinDays).values(FACTORY_DAYS.map((day) => ({ ...day })));
    await setMeta(SEED_KEY, "fabrica-v1");
  }
  await reloadCheckin();
}

export function checkinDaysAll(): CheckinDay[] {
  return catalog;
}

export function checkinSettings(): CheckinSettings {
  return settings;
}

export async function saveCheckinSettings(change: Partial<CheckinSettings>) {
  settings = clampSettings(change);
  await setMeta(SETTINGS_KEY, JSON.stringify(settings));
}

export async function saveCheckinDay(day: Omit<CheckinDay, "id"> & { id: number }): Promise<CheckinDay | undefined> {
  const { id, ...values } = day;
  values.day = Math.min(CHECKIN_MAX_DAYS, Math.max(1, values.day));
  if (id > 0) await db().update(checkinDays).set(values).where(eq(checkinDays.id, id));
  else await db().insert(checkinDays).values(values);
  await reloadCheckin();
  return id > 0 ? catalog.find((entry) => entry.id === id) : catalog[catalog.length - 1];
}

export async function removeCheckinDay(id: number) {
  await db().delete(checkinDays).where(eq(checkinDays.id, id));
  await reloadCheckin();
}

// ---------------------------------------------------------------- sequência de cada conta

type CheckinRow = typeof accountCheckin.$inferSelect;

const EMPTY: Omit<CheckinRow, "accountId" | "updatedAt"> = { day: 0, lastDay: "", streak: 0, total: 0 };

async function rowFor(accountId: number): Promise<Omit<CheckinRow, "accountId" | "updatedAt">> {
  const [row] = await db().select().from(accountCheckin).where(eq(accountCheckin.accountId, accountId)).limit(1);
  return row ?? EMPTY;
}

/** Monta a situação mostrada ao jogador a partir da linha gravada. */
function stateOf(row: Omit<CheckinRow, "accountId" | "updatedAt">, now = Date.now()): CheckinState {
  const today = checkinDayKey(now, settings.offsetHours);
  const claimedToday = row.lastDay === today;
  // Faltou um dia: a sequência recomeça (se o painel pedir isso).
  const continues = row.lastDay === checkinPreviousKey(today) || row.lastDay === today;
  const broke = settings.resetOnMiss && row.lastDay !== "" && !continues;
  const streak = broke ? 0 : row.streak;
  const day = claimedToday ? row.day : broke || row.lastDay === "" ? 1 : row.day + 1;
  return {
    day: Math.max(1, day),
    claimedToday,
    streak,
    total: row.total,
    nextAt: new Date(checkinNextTurn(now, settings.offsetHours)).toISOString(),
  };
}

export async function checkinStateFor(accountId: number): Promise<CheckinState> {
  return stateOf(await rowFor(accountId));
}

export type CheckinClaim =
  | { ok: true; day: CheckinDay; state: CheckinState }
  | { ok: false; reason: "off" | "empty" | "already"; state: CheckinState };

/**
 * Abre o presente do dia. A gravação só passa quando a linha ainda está no dia anterior,
 * então dois cliques ao mesmo tempo (ou duas janelas) não pagam o prêmio duas vezes.
 */
export async function claimCheckin(accountId: number): Promise<CheckinClaim> {
  const row = await rowFor(accountId);
  const state = stateOf(row);
  if (!settings.enabled) return { ok: false, reason: "off", state };
  const day = checkinDayAt(catalog, state.day);
  if (!day) return { ok: false, reason: "empty", state };
  if (state.claimedToday) return { ok: false, reason: "already", state };

  const today = checkinDayKey(Date.now(), settings.offsetHours);
  const values = { day: state.day, lastDay: today, streak: state.streak + 1, total: row.total + 1, updatedAt: new Date() };
  const saved = await db()
    .insert(accountCheckin)
    .values({ accountId, ...values })
    .onConflictDoUpdate({
      target: accountCheckin.accountId,
      set: values,
      // Outra janela pode ter pego o presente no meio do caminho: aí esta gravação não passa.
      setWhere: sql`${accountCheckin.lastDay} <> ${today}`,
    })
    .returning({ accountId: accountCheckin.accountId });
  if (saved.length === 0) return { ok: false, reason: "already", state: { ...state, claimedToday: true } };
  return { ok: true, day, state: stateOf({ ...row, ...values }) };
}

/** Quantas contas pegaram hoje e quantas estão com sequência viva (para o painel). */
export async function checkinCounts(): Promise<{ today: number; active: number }> {
  const today = checkinDayKey(Date.now(), settings.offsetHours);
  const [row] = await db()
    .select({
      today: sql<number>`cast(count(*) filter (where ${accountCheckin.lastDay} = ${today}) as integer)`,
      active: count(),
    })
    .from(accountCheckin);
  return { today: Number(row?.today ?? 0), active: Number(row?.active ?? 0) };
}
