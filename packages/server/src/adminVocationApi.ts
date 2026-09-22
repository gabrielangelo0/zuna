import { createEndpoint } from "colyseus";
import {
  SPELL_FAMILIES,
  VOCATION_NAME_MAX,
  VOCATION_TEXT_MAX,
  catalogItem,
  vocationById,
  type AdminVocationsResponse,
  type VocationDef,
} from "@zuna/shared";
import { ADMIN_FORBIDDEN, adminFrom, clamp, readBody, text } from "./adminApi.ts";
import { logAdminAction } from "./adminRepository.ts";
import { pushVocations } from "./live.ts";
import {
  removeVocation,
  saveVocation,
  saveVocationSettings,
  vocationCounts,
  vocationList,
  vocationSettings,
} from "./vocations.ts";

// Painel: as classes do jogo. O que muda aqui vale na hora para quem está jogando.

function factor(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(5, Math.max(0.1, Math.round(number * 100) / 100)) : fallback;
}

async function vocationsResponse(): Promise<AdminVocationsResponse> {
  const counts = await vocationCounts();
  return {
    vocations: vocationList().map((vocation) => ({ vocation, players: counts.players.get(vocation.id) ?? 0 })),
    settings: vocationSettings(),
    without: counts.without,
  };
}

const adminVocations = createEndpoint("/api/admin/vocations", { method: "GET" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  return ctx.json(await vocationsResponse());
});

const adminVocationSave = createEndpoint("/api/admin/vocation", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const id = String(body.id ?? "")
    .trim()
    .toLowerCase();
  const current = id ? vocationById(id) : undefined;

  if (current && body.remove === true) {
    await removeVocation(current.id);
    pushVocations();
    await logAdminAction({ accountId: admin.id, action: "classe apagada", detail: current });
    return ctx.json(await vocationsResponse());
  }

  if (!/^[a-z][a-z0-9-]{1,23}$/.test(id)) {
    throw ctx.error("BAD_REQUEST", { message: "A chave da classe usa letras minúsculas, números e hífen." });
  }
  const name = text(body.name ?? current?.name, VOCATION_NAME_MAX);
  if (name.length < 2) throw ctx.error("BAD_REQUEST", { message: "Dê um nome à classe." });
  const outfit = String(body.outfit ?? current?.outfit ?? "");
  if (outfit && catalogItem(outfit)?.kind !== "outfit") throw ctx.error("BAD_REQUEST", { message: "Essa roupa não existe." });

  const known = new Set(SPELL_FAMILIES.map((family) => family.family));
  const families = (Array.isArray(body.families) ? body.families.map(String) : (current?.families ?? [])).filter((family) =>
    known.has(family),
  );

  const vocation: VocationDef = {
    id,
    name,
    description: text(body.description ?? current?.description, VOCATION_TEXT_MAX),
    hpBase: clamp(body.hpBase ?? current?.hpBase ?? 150, 1, 100_000) ?? 150,
    hpPerLevel: factor(body.hpPerLevel ?? current?.hpPerLevel ?? 15, 15),
    manaBase: clamp(body.manaBase ?? current?.manaBase ?? 50, 0, 100_000) ?? 50,
    manaPerLevel: factor(body.manaPerLevel ?? current?.manaPerLevel ?? 10, 10),
    attackFactor: factor(body.attackFactor ?? current?.attackFactor ?? 1, 1),
    magicFactor: factor(body.magicFactor ?? current?.magicFactor ?? 1, 1),
    armorFactor: factor(body.armorFactor ?? current?.armorFactor ?? 1, 1),
    families,
    outfit,
    enabled: typeof body.enabled === "boolean" ? body.enabled : (current?.enabled ?? true),
    sort: clamp(body.sort ?? current?.sort ?? 0, 0, 999) ?? 0,
  };
  await saveVocation(vocation, !current);
  pushVocations();
  await logAdminAction({ accountId: admin.id, action: current ? "classe alterada" : "classe criada", detail: vocation });
  return ctx.json(await vocationsResponse());
});

const adminVocationSettings = createEndpoint("/api/admin/vocation/settings", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  await saveVocationSettings({ changePrice: clamp(body.changePrice, 0, 1_000_000) ?? 0 });
  pushVocations();
  await logAdminAction({ accountId: admin.id, action: "preço da troca de classe", detail: vocationSettings() });
  return ctx.json(await vocationsResponse());
});

export const adminVocationRoutes = { adminVocations, adminVocationSave, adminVocationSettings };
