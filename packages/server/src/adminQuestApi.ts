import { createEndpoint } from "colyseus";
import {
  MONSTERS,
  QUEST_MAX_AMOUNT,
  QUEST_MAX_PLAYERS,
  gearItem,
  type AdminQuestsResponse,
  type MonsterKind,
  type QuestDef,
} from "@zuna/shared";
import { ADMIN_FORBIDDEN, adminFrom, clamp, readBody, text } from "./adminApi.ts";
import { logAdminAction } from "./adminRepository.ts";
import { pushQuests } from "./live.ts";
import { allQuests, questById, questCounts, removeQuest, saveQuest } from "./quests.ts";

// Painel: caçadas e desafios de chefe. O que muda aqui vale na hora para quem está jogando.

async function questsResponse(): Promise<AdminQuestsResponse> {
  const counts = await questCounts();
  return {
    quests: allQuests().map((quest) => ({
      quest,
      finished: counts.get(quest.id)?.finished ?? 0,
      doing: counts.get(quest.id)?.doing ?? 0,
    })),
  };
}

const adminQuests = createEndpoint("/api/admin/quests", { method: "GET" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  return ctx.json(await questsResponse());
});

const adminQuestSave = createEndpoint("/api/admin/quest", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const id = Number(body.id) || 0;
  const current = id > 0 ? questById(id) : undefined;
  if (id > 0 && !current) throw ctx.error("NOT_FOUND", { message: "Missão não encontrada." });

  if (current && body.remove === true) {
    await removeQuest(current.id);
    pushQuests();
    await logAdminAction({ accountId: admin.id, action: "missão apagada", detail: current });
    return ctx.json(await questsResponse());
  }

  const name = text(body.name ?? current?.name, 60);
  if (name.length < 2) throw ctx.error("BAD_REQUEST", { message: "Dê um nome à missão." });
  const monster = String(body.monster ?? current?.monster ?? "") as MonsterKind;
  if (!MONSTERS[monster]) throw ctx.error("BAD_REQUEST", { message: "Monstro desconhecido." });
  const rewardItem = String(body.rewardItem ?? current?.rewardItem ?? "");
  if (rewardItem && !gearItem(rewardItem)) throw ctx.error("BAD_REQUEST", { message: "Item de recompensa não existe." });

  const quest: QuestDef = {
    id,
    name,
    description: text(body.description ?? current?.description, 200),
    kind: String(body.kind ?? current?.kind ?? "kill") === "boss" ? "boss" : "kill",
    monster,
    amount: clamp(body.amount ?? current?.amount ?? 1, 1, QUEST_MAX_AMOUNT) ?? 1,
    worldId: clamp(body.worldId ?? current?.worldId ?? 0, 0, 100_000) ?? 0,
    minLevel: clamp(body.minLevel ?? current?.minLevel ?? 1, 1, 9999) ?? 1,
    players: clamp(body.players ?? current?.players ?? 1, 1, QUEST_MAX_PLAYERS) ?? 1,
    x: clamp(body.x ?? current?.x ?? 0, 0, 1000) ?? 0,
    y: clamp(body.y ?? current?.y ?? 0, 0, 1000) ?? 0,
    bossScale: Math.min(20, Math.max(0.1, Number(body.bossScale ?? current?.bossScale ?? 1) || 1)),
    repeatMinutes: clamp(body.repeatMinutes ?? current?.repeatMinutes ?? 0, 0, 100_000) ?? 0,
    rewardXp: Math.max(0, Number(body.rewardXp ?? current?.rewardXp ?? 0) || 0),
    rewardGold: clamp(body.rewardGold ?? current?.rewardGold ?? 0, 0, 1_000_000_000) ?? 0,
    rewardItem,
    rewardItemCount: clamp(body.rewardItemCount ?? current?.rewardItemCount ?? 1, 1, 1000) ?? 1,
    enabled: typeof body.enabled === "boolean" ? body.enabled : (current?.enabled ?? true),
    sort: clamp(body.sort ?? current?.sort ?? 0, 0, 999) ?? 0,
  };
  await saveQuest(quest);
  pushQuests();
  await logAdminAction({ accountId: admin.id, action: current ? "missão alterada" : "missão criada", detail: quest });
  return ctx.json(await questsResponse());
});

export const adminQuestRoutes = { adminQuests, adminQuestSave };
