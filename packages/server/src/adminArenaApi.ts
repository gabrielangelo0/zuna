import { createEndpoint } from "colyseus";
import {
  ARENA_NAME_MAX,
  ARENA_TEXT_MAX,
  clampArena,
  clampArenaReward,
  clampDummy,
  slugify,
  type AdminArenaResponse,
  type ArenaDef,
  type ArenaDummy,
  type ArenaReward,
} from "@zuna/shared";
import { ADMIN_FORBIDDEN, adminFrom, readBody, text } from "./adminApi.ts";
import { logAdminAction } from "./adminRepository.ts";
import {
  arenaBoardAll,
  arenaById,
  arenaCounts,
  arenaDummiesAll,
  arenaList,
  arenaRewardsAll,
  arenaSeason,
  arenaSettings,
  removeArena,
  removeArenaReward,
  removeDummy,
  saveArena,
  saveArenaReward,
  saveArenaSettings,
  saveDummy,
} from "./arena.ts";
import { pushArena } from "./live.ts";

// Painel da arena: as praças, os manequins, os degraus do prêmio semanal e os ajustes da
// simulação. O que muda aqui vale na hora para quem está com a tela aberta.

/** Teto de praças e de manequins: a lista de adversários é lida a cada abertura de tela. */
const ARENA_LIMIT = 20;
const DUMMY_LIMIT = 200;
const REWARD_LIMIT = 50;

async function arenaResponse(): Promise<AdminArenaResponse> {
  const season = arenaSeason();
  const [counts, board] = await Promise.all([arenaCounts(season), arenaBoardAll(season)]);
  return {
    arenas: arenaList(),
    dummies: arenaDummiesAll(),
    rewards: arenaRewardsAll(),
    settings: arenaSettings(),
    season,
    board,
    ...counts,
  };
}

const adminArena = createEndpoint("/api/admin/arena", { method: "GET" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  return ctx.json(await arenaResponse());
});

const adminArenaSave = createEndpoint("/api/admin/arena/praca", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const id = slugify(String(body.id ?? ""));
  if (!id) throw ctx.error("BAD_REQUEST", { message: "Escolha um nome para a arena." });
  const atual = arenaById(id);

  if (atual && body.remove === true) {
    const recusa = await removeArena(id);
    if (recusa) throw ctx.error("BAD_REQUEST", { message: recusa });
    pushArena();
    await logAdminAction({ accountId: admin.id, action: "arena apagada", detail: atual });
    return ctx.json(await arenaResponse());
  }
  if (!atual && arenaList().length >= ARENA_LIMIT) {
    throw ctx.error("BAD_REQUEST", { message: `O limite é de ${ARENA_LIMIT} arenas.` });
  }

  const arena: ArenaDef = clampArena({
    id,
    name: text(body.name, ARENA_NAME_MAX) || atual?.name || "Arena",
    description: text(body.description, ARENA_TEXT_MAX) || atual?.description || "",
    minLevel: Number(body.minLevel ?? atual?.minLevel ?? 1),
    maxLevel: Number(body.maxLevel ?? atual?.maxLevel ?? 0),
    freeEntries: Number(body.freeEntries ?? atual?.freeEntries ?? 5),
    entryPrice: Number(body.entryPrice ?? atual?.entryPrice ?? 0),
    rewardGold: Number(body.rewardGold ?? atual?.rewardGold ?? 0),
    rewardXp: Number(body.rewardXp ?? atual?.rewardXp ?? 0),
    enabled: typeof body.enabled === "boolean" ? body.enabled : (atual?.enabled ?? true),
    sort: Number(body.sort ?? atual?.sort ?? arenaList().length + 1),
  });
  await saveArena(arena);
  pushArena();
  await logAdminAction({ accountId: admin.id, action: atual ? "arena alterada" : "arena criada", detail: arena });
  return ctx.json(await arenaResponse());
});

const adminArenaDummy = createEndpoint("/api/admin/arena/manequim", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const id = Math.max(0, Math.round(Number(body.id ?? 0)));
  const atual = arenaDummiesAll().find((dummy) => dummy.id === id);

  if (atual && body.remove === true) {
    await removeDummy(id);
    pushArena();
    await logAdminAction({ accountId: admin.id, action: "manequim apagado", detail: atual });
    return ctx.json(await arenaResponse());
  }
  const arena = String(body.arena ?? atual?.arena ?? "");
  if (!arenaById(arena)) throw ctx.error("BAD_REQUEST", { message: "Escolha a arena do manequim." });
  if (!atual && arenaDummiesAll().length >= DUMMY_LIMIT) {
    throw ctx.error("BAD_REQUEST", { message: `O limite é de ${DUMMY_LIMIT} manequins.` });
  }

  const dummy: ArenaDummy = clampDummy({
    id,
    arena,
    name: text(body.name, ARENA_NAME_MAX) || atual?.name || "Manequim",
    level: Number(body.level ?? atual?.level ?? 1),
    vocation: text(body.vocation, 24) ?? atual?.vocation ?? "",
    power: Number(body.power ?? atual?.power ?? 1),
    skin: Number(body.skin ?? atual?.skin ?? 0),
    hairColor: Number(body.hairColor ?? atual?.hairColor ?? 0),
    outfit: text(body.outfit, 32) || atual?.outfit || "aventureiro",
    colorPrimary: Number(body.colorPrimary ?? atual?.colorPrimary ?? 0),
    colorSecondary: Number(body.colorSecondary ?? atual?.colorSecondary ?? 0),
    colorDetail: Number(body.colorDetail ?? atual?.colorDetail ?? 0),
    enabled: typeof body.enabled === "boolean" ? body.enabled : (atual?.enabled ?? true),
  });
  const novoId = await saveDummy(dummy);
  pushArena();
  await logAdminAction({
    accountId: admin.id,
    action: atual ? "manequim alterado" : "manequim criado",
    detail: { ...dummy, id: novoId },
  });
  return ctx.json(await arenaResponse());
});

const adminArenaReward = createEndpoint("/api/admin/arena/premio", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const id = Math.max(0, Math.round(Number(body.id ?? 0)));
  const atual = arenaRewardsAll().find((reward) => reward.id === id);

  if (atual && body.remove === true) {
    await removeArenaReward(id);
    pushArena();
    await logAdminAction({ accountId: admin.id, action: "prêmio de arena apagado", detail: atual });
    return ctx.json(await arenaResponse());
  }
  if (!atual && arenaRewardsAll().length >= REWARD_LIMIT) {
    throw ctx.error("BAD_REQUEST", { message: `O limite é de ${REWARD_LIMIT} degraus de prêmio.` });
  }
  const arena = text(body.arena, 32) ?? atual?.arena ?? "";
  // Arena vazia vale em todas; arena escrita tem que existir.
  if (arena && !arenaById(arena)) throw ctx.error("BAD_REQUEST", { message: "Essa arena não existe." });

  const reward: ArenaReward = clampArenaReward({
    id,
    arena,
    fromRank: Number(body.fromRank ?? atual?.fromRank ?? 1),
    toRank: Number(body.toRank ?? atual?.toRank ?? 1),
    gold: Number(body.gold ?? atual?.gold ?? 0),
    diamonds: Number(body.diamonds ?? atual?.diamonds ?? 0),
    enabled: typeof body.enabled === "boolean" ? body.enabled : (atual?.enabled ?? true),
  });
  const novoId = await saveArenaReward(reward);
  pushArena();
  await logAdminAction({
    accountId: admin.id,
    action: atual ? "prêmio de arena alterado" : "prêmio de arena criado",
    detail: { ...reward, id: novoId },
  });
  return ctx.json(await arenaResponse());
});

const adminArenaSettings = createEndpoint("/api/admin/arena/ajustes", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  await saveArenaSettings({
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    startRating: body.startRating === undefined ? undefined : Number(body.startRating),
    kFactor: body.kFactor === undefined ? undefined : Number(body.kFactor),
    maxRounds: body.maxRounds === undefined ? undefined : Number(body.maxRounds),
    healAt: body.healAt === undefined ? undefined : Number(body.healAt),
    healManaPct: body.healManaPct === undefined ? undefined : Number(body.healManaPct),
    healFactor: body.healFactor === undefined ? undefined : Number(body.healFactor),
    maxHeals: body.maxHeals === undefined ? undefined : Number(body.maxHeals),
    spellFactor: body.spellFactor === undefined ? undefined : Number(body.spellFactor),
    vipEntries: body.vipEntries === undefined ? undefined : Number(body.vipEntries),
    offsetHours: body.offsetHours === undefined ? undefined : Number(body.offsetHours),
  });
  pushArena();
  await logAdminAction({ accountId: admin.id, action: "ajustes da arena alterados", detail: arenaSettings() });
  return ctx.json(await arenaResponse());
});

export const adminArenaRoutes = { adminArena, adminArenaSave, adminArenaDummy, adminArenaReward, adminArenaSettings };
