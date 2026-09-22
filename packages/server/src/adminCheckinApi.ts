import { createEndpoint } from "colyseus";
import { CHECKIN_MAX_DAYS, CHECKIN_MAX_OFFSET, gearItem, type AdminCheckinResponse, type CheckinDay } from "@zuna/shared";
import { ADMIN_FORBIDDEN, adminFrom, clamp, readBody } from "./adminApi.ts";
import { logAdminAction } from "./adminRepository.ts";
import {
  checkinCounts,
  checkinDaysAll,
  checkinSettings,
  removeCheckinDay,
  saveCheckinDay,
  saveCheckinSettings,
} from "./checkin.ts";
import { pushCheckin } from "./live.ts";

// Painel: o ciclo do presente diário. O que muda aqui vale na hora para quem está jogando.

async function checkinResponse(): Promise<AdminCheckinResponse> {
  const counts = await checkinCounts();
  return { days: checkinDaysAll(), settings: checkinSettings(), today: counts.today, active: counts.active };
}

const adminCheckin = createEndpoint("/api/admin/checkin", { method: "GET" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  return ctx.json(await checkinResponse());
});

const adminCheckinSave = createEndpoint("/api/admin/checkin/day", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const id = Number(body.id) || 0;
  const current = id > 0 ? checkinDaysAll().find((day) => day.id === id) : undefined;
  if (id > 0 && !current) throw ctx.error("NOT_FOUND", { message: "Dia não encontrado." });

  if (current && body.remove === true) {
    await removeCheckinDay(current.id);
    pushCheckin();
    await logAdminAction({ accountId: admin.id, action: "dia do check-in apagado", detail: current });
    return ctx.json(await checkinResponse());
  }

  const rewardItem = String(body.rewardItem ?? current?.rewardItem ?? "");
  if (rewardItem && !gearItem(rewardItem)) throw ctx.error("BAD_REQUEST", { message: "Item de recompensa não existe." });

  const day: CheckinDay = {
    id,
    day: clamp(body.day ?? current?.day ?? 1, 1, CHECKIN_MAX_DAYS) ?? 1,
    rewardGold: clamp(body.rewardGold ?? current?.rewardGold ?? 0, 0, 1_000_000_000) ?? 0,
    rewardDiamonds: clamp(body.rewardDiamonds ?? current?.rewardDiamonds ?? 0, 0, 1_000_000) ?? 0,
    rewardXp: Math.max(0, Number(body.rewardXp ?? current?.rewardXp ?? 0) || 0),
    rewardItem,
    rewardItemCount: clamp(body.rewardItemCount ?? current?.rewardItemCount ?? 1, 1, 1000) ?? 1,
    highlight: typeof body.highlight === "boolean" ? body.highlight : (current?.highlight ?? false),
    enabled: typeof body.enabled === "boolean" ? body.enabled : (current?.enabled ?? true),
  };
  await saveCheckinDay(day);
  pushCheckin();
  await logAdminAction({ accountId: admin.id, action: current ? "dia do check-in alterado" : "dia do check-in criado", detail: day });
  return ctx.json(await checkinResponse());
});

const adminCheckinSettings = createEndpoint("/api/admin/checkin/settings", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const settings = {
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    resetOnMiss: typeof body.resetOnMiss === "boolean" ? body.resetOnMiss : undefined,
    offsetHours: clamp(body.offsetHours, -CHECKIN_MAX_OFFSET, CHECKIN_MAX_OFFSET),
  };
  await saveCheckinSettings(settings);
  pushCheckin();
  await logAdminAction({ accountId: admin.id, action: "regras do check-in", detail: checkinSettings() });
  return ctx.json(await checkinResponse());
});

export const adminCheckinRoutes = { adminCheckin, adminCheckinSave, adminCheckinSettings };
