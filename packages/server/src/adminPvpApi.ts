import { createEndpoint } from "colyseus";
import type { AdminPvpResponse, PvpSettings } from "@zuna/shared";
import { ADMIN_FORBIDDEN, adminFrom, readBody } from "./adminApi.ts";
import { logAdminAction } from "./adminRepository.ts";
import { pushPvp } from "./live.ts";
import { pvpSettings, recentPvpKills, savePvpSettings } from "./pvp.ts";

// Painel: as regras do combate entre jogadores e as últimas mortes.
//
// A lista de mortes não é enfeite: com queda de item a disputa chega ("me mataram em zona
// segura", "perdi um item que comprei", "aquele só mata novato"), e sem registro a resposta é
// adivinhação.

async function pvpResponse(): Promise<AdminPvpResponse> {
  return { settings: pvpSettings(), kills: await recentPvpKills(100) };
}

const adminPvp = createEndpoint("/api/admin/pvp", { method: "GET" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  return ctx.json(await pvpResponse());
});

const adminPvpSave = createEndpoint("/api/admin/pvp/settings", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("FORBIDDEN", { message: ADMIN_FORBIDDEN });
  const body = readBody(ctx.body);
  const change: Partial<PvpSettings> = {
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    minLevel: body.minLevel === undefined ? undefined : Number(body.minLevel),
    levelRatio: body.levelRatio === undefined ? undefined : Number(body.levelRatio),
    markMinutes: body.markMinutes === undefined ? undefined : Number(body.markMinutes),
    retaliationMinutes: body.retaliationMinutes === undefined ? undefined : Number(body.retaliationMinutes),
    dropSlots: body.dropSlots === undefined ? undefined : Number(body.dropSlots),
  };
  await savePvpSettings(change);
  // Quem está jogando precisa saber na hora: a tela avisa antes de o jogador tentar bater.
  pushPvp();
  await logAdminAction({ accountId: admin.id, action: "regras do PvP", detail: pvpSettings() });
  return ctx.json(await pvpResponse());
});

export const adminPvpRoutes = { adminPvp, adminPvpSave };
