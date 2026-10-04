import { asc, eq } from "drizzle-orm";
import {
  FACTORY_VIP_PASSES,
  FACTORY_VIP_TIERS,
  clampVipPass,
  clampVipTier,
  tierById,
  vipRank,
  type VipPass,
  type VipTier,
} from "@zuna/shared";
import { db } from "./db/index.ts";
import { serverMeta, vipPasses, vipTiers } from "./db/schema.ts";

// Degraus e passes do VIP: ficam em memória, o painel edita e vale na hora.
// O código só semeia o padrão de fábrica uma vez; depois disso quem manda é o painel.

const SEED_KEY = "vip";

let tiers: VipTier[] = [];
let passes: VipPass[] = [];

async function metaValue(key: string): Promise<string | null> {
  const [row] = await db().select().from(serverMeta).where(eq(serverMeta.key, key)).limit(1);
  return row?.value ?? null;
}

export async function reloadVip() {
  const rows = await db().select().from(vipTiers).orderBy(asc(vipTiers.rank), asc(vipTiers.id));
  tiers = rows.map((row) => clampVipTier(row as VipTier));
  const passRows = await db().select().from(vipPasses).orderBy(asc(vipPasses.sort), asc(vipPasses.id));
  passes = passRows.map((row) => clampVipPass(row as VipPass));
}

export async function ensureVipSeed() {
  if ((await metaValue(SEED_KEY)) !== "fabrica-v1") {
    await db().insert(vipTiers).values(FACTORY_VIP_TIERS.map((tier) => ({ ...tier })));
    await db().insert(vipPasses).values(FACTORY_VIP_PASSES.map((pass) => ({ ...pass })));
    await db()
      .insert(serverMeta)
      .values({ key: SEED_KEY, value: "fabrica-v1" })
      .onConflictDoUpdate({ target: serverMeta.key, set: { value: "fabrica-v1", updatedAt: new Date() } });
  }
  await reloadVip();
}

export function vipTiersAll(): VipTier[] {
  return tiers;
}

export function vipPassesAll(): VipPass[] {
  return passes;
}

/** Só o que o jogador vê na vitrine: passe ligado de degrau ligado. */
export function vipPassesOnSale(): VipPass[] {
  return passes.filter((pass) => pass.enabled && tierById(tiers, pass.tier)?.enabled === true);
}

export function vipTier(id: string): VipTier | undefined {
  return tierById(tiers, id);
}

export function vipPass(id: string): VipPass | undefined {
  return passes.find((pass) => pass.id === id);
}

/** Degrau ativo de uma conta agora (0 = não é VIP). */
export function rankOf(tierId: string, untilMs: number, agora = Date.now()): number {
  return vipRank(vipTier(tierId), untilMs, agora);
}

export async function saveVipTier(tier: VipTier) {
  const limpo = clampVipTier(tier);
  await db()
    .insert(vipTiers)
    .values(limpo)
    .onConflictDoUpdate({ target: vipTiers.id, set: { ...limpo } });
  await reloadVip();
}

/** Recusa guardada aqui, e não só na tela: apagar degrau que alguém tem some com o VIP pago. */
export async function removeVipTier(id: string) {
  await db().delete(vipTiers).where(eq(vipTiers.id, id));
  await reloadVip();
}

export async function saveVipPass(pass: VipPass) {
  const limpo = clampVipPass(pass);
  await db()
    .insert(vipPasses)
    .values(limpo)
    .onConflictDoUpdate({ target: vipPasses.id, set: { ...limpo } });
  await reloadVip();
}

export async function removeVipPass(id: string) {
  await db().delete(vipPasses).where(eq(vipPasses.id, id));
  await reloadVip();
}
