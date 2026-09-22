import { createEndpoint } from "colyseus";
import { LEVEL_REWARD_MAX_LEVEL, XP_RATE_MAX, gearItem, type AdminProgressResponse, type LevelReward } from "@zuna/shared";
import { ADMIN_FORBIDDEN, adminFrom, clamp, readBody, text } from "./adminApi.ts";
import { logAdminAction } from "./adminRepository.ts";
import { pushMilestones } from "./live.ts";
import {
  levelRewardsAll,
  levelRewardsGiven,
  progressSettings,
  removeLevelReward,
  saveLevelReward,
  saveProgressSettings,
} from "./progress.ts";

// Painel: a taxa de XP do servidor e os baús de marco. Vale na hora para quem está jogando.

async function progressResponse(): Promise<AdminProgressResponse> {
  return { rewards: levelRewardsAll(), settings: progressSettings(), given: await levelRewardsGiven() };
}

const adminProgress = createEndpoint("/api/admin/progress", { method: "GET" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  return ctx.json(await progressResponse());
});

const adminProgressSave = createEndpoint("/api/admin/progress/reward", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const id = Number(body.id) || 0;
  const current = id > 0 ? levelRewardsAll().find((reward) => reward.id === id) : undefined;
  if (id > 0 && !current) throw ctx.error("NOT_FOUND", { message: "Marco não encontrado." });

  if (current && body.remove === true) {
    await removeLevelReward(current.id);
    pushMilestones();
    await logAdminAction({ accountId: admin.id, action: "marco apagado", detail: current });
    return ctx.json(await progressResponse());
  }

  const rewardItem = String(body.rewardItem ?? current?.rewardItem ?? "");
  if (rewardItem && !gearItem(rewardItem)) throw ctx.error("BAD_REQUEST", { message: "Item de recompensa não existe." });
  const level = clamp(body.level ?? current?.level ?? 10, 2, LEVEL_REWARD_MAX_LEVEL) ?? 10;
  // Dois baús no mesmo nível: só um seria entregue (a marca é o nível), então avisa aqui.
  const clash = levelRewardsAll().find((reward) => reward.level === level && reward.id !== id);
  if (clash) throw ctx.error("BAD_REQUEST", { message: `Já existe um baú no nível ${level}.` });

  const reward: LevelReward = {
    id,
    level,
    name: text(body.name ?? current?.name, 40),
    rewardGold: clamp(body.rewardGold ?? current?.rewardGold ?? 0, 0, 1_000_000_000) ?? 0,
    rewardDiamonds: clamp(body.rewardDiamonds ?? current?.rewardDiamonds ?? 0, 0, 1_000_000) ?? 0,
    rewardItem,
    rewardItemCount: clamp(body.rewardItemCount ?? current?.rewardItemCount ?? 1, 1, 1000) ?? 1,
    enabled: typeof body.enabled === "boolean" ? body.enabled : (current?.enabled ?? true),
  };
  await saveLevelReward(reward);
  pushMilestones();
  await logAdminAction({ accountId: admin.id, action: current ? "marco alterado" : "marco criado", detail: reward });
  return ctx.json(await progressResponse());
});

const adminProgressSettings = createEndpoint("/api/admin/progress/settings", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const xpRate = Math.min(XP_RATE_MAX, Math.max(0, Number(body.xpRate) || 0));
  await saveProgressSettings({ xpRate });
  await logAdminAction({ accountId: admin.id, action: "taxa de XP", detail: progressSettings() });
  return ctx.json(await progressResponse());
});

export const adminProgressRoutes = { adminProgress, adminProgressSave, adminProgressSettings };
