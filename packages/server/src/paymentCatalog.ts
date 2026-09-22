import { asc, eq } from "drizzle-orm";
import { DEFAULT_PAYMENT_SETTINGS, DIAMOND_PACKS, PACK_MAX_MULTIPLIER, type DiamondPack, type PaymentSettings } from "@zuna/shared";
import { db } from "./db/index.ts";
import { diamondPacks, serverMeta } from "./db/schema.ts";

// Pacotes de diamantes e configuração da loja, mudados pelo painel. Ficam em memória
// (a loja é aberta a toda hora) e são relidos do banco a cada mudança.

const SEED_KEY = "pacotes";
const SETTINGS_KEY = "pagamentos";

let packs: DiamondPack[] = [];
let settings: PaymentSettings = { ...DEFAULT_PAYMENT_SETTINGS };

function toPack(row: typeof diamondPacks.$inferSelect): DiamondPack {
  return {
    id: row.id,
    priceCents: row.priceCents,
    diamonds: row.diamonds,
    bonusPercent: row.bonusPercent,
    tag: row.tag,
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

/** Relê pacotes e configuração do banco. */
export async function reloadPaymentCatalog() {
  const rows = await db().select().from(diamondPacks).orderBy(asc(diamondPacks.sort), asc(diamondPacks.priceCents));
  packs = rows.map(toPack);
  const raw = await metaValue(SETTINGS_KEY);
  let saved: Partial<PaymentSettings> = {};
  try {
    saved = raw ? (JSON.parse(raw) as Partial<PaymentSettings>) : {};
  } catch {
    saved = {};
  }
  settings = {
    open: saved.open ?? DEFAULT_PAYMENT_SETTINGS.open,
    firstMultiplier: clampMultiplier(saved.firstMultiplier ?? DEFAULT_PAYMENT_SETTINGS.firstMultiplier),
  };
}

function clampMultiplier(value: number): number {
  return Number.isFinite(value) ? Math.min(PACK_MAX_MULTIPLIER, Math.max(1, Math.round(value * 10) / 10)) : 1;
}

/** Primeiro arranque: grava os pacotes de fábrica. Depois disso, apagar todos no painel não os traz de volta. */
export async function ensurePaymentSeed() {
  if ((await metaValue(SEED_KEY)) === null) {
    const existing = await db().select({ id: diamondPacks.id }).from(diamondPacks).limit(1);
    if (existing.length === 0) {
      await db()
        .insert(diamondPacks)
        .values(DIAMOND_PACKS.map((pack, index) => ({ ...pack, sort: index })));
    }
    await setMeta(SEED_KEY, "fabrica-v1");
  }
  await reloadPaymentCatalog();
}

export function allPacks(): DiamondPack[] {
  return packs;
}

/** O que aparece na vitrine. */
export function packsOnSale(): DiamondPack[] {
  return packs.filter((pack) => pack.enabled);
}

export function packById(id: string): DiamondPack | undefined {
  return packs.find((pack) => pack.id === id);
}

export function paymentSettings(): PaymentSettings {
  return settings;
}

export async function saveSettings(change: Partial<PaymentSettings>) {
  const next: PaymentSettings = {
    open: change.open ?? settings.open,
    firstMultiplier: clampMultiplier(change.firstMultiplier ?? settings.firstMultiplier),
  };
  await setMeta(SETTINGS_KEY, JSON.stringify(next));
  await reloadPaymentCatalog();
}

export async function savePack(pack: DiamondPack, isNew: boolean) {
  const values = {
    priceCents: pack.priceCents,
    diamonds: pack.diamonds,
    bonusPercent: pack.bonusPercent,
    tag: pack.tag,
    enabled: pack.enabled,
  };
  if (isNew) await db().insert(diamondPacks).values({ id: pack.id, ...values, sort: packs.length });
  else await db().update(diamondPacks).set(values).where(eq(diamondPacks.id, pack.id));
  await reloadPaymentCatalog();
}

export async function removePack(id: string) {
  await db().delete(diamondPacks).where(eq(diamondPacks.id, id));
  await reloadPaymentCatalog();
}

/** Troca o pacote de lugar com o vizinho e regrava a ordem de todos. */
export async function movePack(id: string, step: number) {
  const order = [...packs];
  const from = order.findIndex((pack) => pack.id === id);
  const to = from + Math.sign(step);
  if (from < 0 || to < 0 || to >= order.length) return;
  [order[from], order[to]] = [order[to]!, order[from]!];
  await db().transaction(async (tx) => {
    for (const [index, pack] of order.entries()) {
      await tx.update(diamondPacks).set({ sort: index }).where(eq(diamondPacks.id, pack.id));
    }
  });
  await reloadPaymentCatalog();
}
