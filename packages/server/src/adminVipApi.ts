import { createEndpoint } from "colyseus";
import {
  VIP_PASS_LIMIT,
  VIP_TIER_LIMIT,
  clampVipPass,
  clampVipTier,
  gearItem,
  slugify,
  type AdminVipResponse,
  type VipPass,
  type VipTier,
} from "@zuna/shared";
import { ADMIN_FORBIDDEN, adminFrom, readBody, text } from "./adminApi.ts";
import { logAdminAction } from "./adminRepository.ts";
import { pushVip } from "./live.ts";
import {
  accountsOnTier,
  removeVipPass,
  removeVipTier,
  saveVipPass,
  saveVipTier,
  vipPassesAll,
  vipStats,
  vipTier,
  vipTiersAll,
} from "./vip.ts";

// Painel: os degraus do VIP e os passes à venda. O que muda aqui vale na hora para quem está
// jogando — inclusive para pior, porque o benefício é sempre lido da linha.

async function vipResponse(): Promise<AdminVipResponse> {
  const stats = await vipStats();
  return { tiers: vipTiersAll(), passes: vipPassesAll(), ...stats };
}

const adminVip = createEndpoint("/api/admin/vip", { method: "GET" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  return ctx.json(await vipResponse());
});

const adminVipTier = createEndpoint("/api/admin/vip/tier", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const id = slugify(String(body.id ?? ""));
  if (!id) throw ctx.error("BAD_REQUEST", { message: "Escolha um nome para o degrau." });
  const atual = vipTier(id);

  if (atual && body.remove === true) {
    // Duas recusas, e as duas protegem quem já pagou: apagar um degrau que contas ainda têm
    // deixaria accounts.vip_tier apontando para o vazio, e o VIP sumiria sem aviso.
    const vendendo = vipPassesAll().filter((pass) => pass.tier === id);
    if (vendendo.length > 0) {
      throw ctx.error("BAD_REQUEST", {
        message: `${vendendo.length} passe(s) ainda vendem este degrau. Apague os passes primeiro.`,
      });
    }
    const contas = await accountsOnTier(id);
    if (contas > 0) {
      throw ctx.error("BAD_REQUEST", {
        message: `${contas} conta(s) ainda têm este degrau. Desligue-o em vez de apagar: quem pagou continua até vencer.`,
      });
    }
    await removeVipTier(id);
    pushVip();
    await logAdminAction({ accountId: admin.id, action: "degrau de VIP apagado", detail: atual });
    return ctx.json(await vipResponse());
  }

  if (!atual && vipTiersAll().length >= VIP_TIER_LIMIT) {
    throw ctx.error("BAD_REQUEST", { message: `O limite é de ${VIP_TIER_LIMIT} degraus.` });
  }
  const chestItem = String(body.chestItem ?? atual?.chestItem ?? "");
  if (chestItem && !gearItem(chestItem)) throw ctx.error("BAD_REQUEST", { message: "Item do baú não existe." });

  const tier: VipTier = clampVipTier({
    id,
    name: text(body.name, 40) || atual?.name || "VIP",
    description: text(body.description, 160) || atual?.description || "",
    rank: Number(body.rank ?? atual?.rank ?? 1),
    diamondsPerDay: Number(body.diamondsPerDay ?? atual?.diamondsPerDay ?? 9),
    bonusXp: Number(body.bonusXp ?? atual?.bonusXp ?? 0),
    bonusGold: Number(body.bonusGold ?? atual?.bonusGold ?? 0),
    deathXpFactor: Number(body.deathXpFactor ?? atual?.deathXpFactor ?? 1),
    bagSlots: Number(body.bagSlots ?? atual?.bagSlots ?? 0),
    color: text(body.color, 9) || atual?.color || "#e8b13a",
    title: text(body.title, 24) ?? atual?.title ?? "",
    chestGold: Number(body.chestGold ?? atual?.chestGold ?? 0),
    chestDiamonds: Number(body.chestDiamonds ?? atual?.chestDiamonds ?? 0),
    chestXp: Number(body.chestXp ?? atual?.chestXp ?? 0),
    chestItem,
    chestItemCount: Number(body.chestItemCount ?? atual?.chestItemCount ?? 1),
    enabled: typeof body.enabled === "boolean" ? body.enabled : (atual?.enabled ?? true),
  });
  await saveVipTier(tier);
  pushVip();
  await logAdminAction({ accountId: admin.id, action: atual ? "degrau de VIP alterado" : "degrau de VIP criado", detail: tier });
  return ctx.json(await vipResponse());
});

const adminVipPass = createEndpoint("/api/admin/vip/pass", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const id = slugify(String(body.id ?? ""));
  if (!id) throw ctx.error("BAD_REQUEST", { message: "Escolha um nome para o passe." });
  const atual = vipPassesAll().find((pass) => pass.id === id);

  if (atual && body.remove === true) {
    await removeVipPass(id);
    pushVip();
    await logAdminAction({ accountId: admin.id, action: "passe de VIP apagado", detail: atual });
    return ctx.json(await vipResponse());
  }
  if (!atual && vipPassesAll().length >= VIP_PASS_LIMIT) {
    throw ctx.error("BAD_REQUEST", { message: `O limite é de ${VIP_PASS_LIMIT} passes.` });
  }
  const tier = String(body.tier ?? atual?.tier ?? "");
  if (!vipTier(tier)) throw ctx.error("BAD_REQUEST", { message: "Escolha o degrau que este passe dá." });

  const pass: VipPass = clampVipPass({
    id,
    tier,
    days: Number(body.days ?? atual?.days ?? 30),
    priceDiamonds: Number(body.priceDiamonds ?? atual?.priceDiamonds ?? 275),
    tag: text(body.tag, 24) ?? atual?.tag ?? "",
    enabled: typeof body.enabled === "boolean" ? body.enabled : (atual?.enabled ?? true),
    sort: Number(body.sort ?? atual?.sort ?? vipPassesAll().length),
  });
  await saveVipPass(pass);
  pushVip();
  await logAdminAction({ accountId: admin.id, action: atual ? "passe de VIP alterado" : "passe de VIP criado", detail: pass });
  return ctx.json(await vipResponse());
});

export const adminVipRoutes = { adminVip, adminVipTier, adminVipPass };
