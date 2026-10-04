import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineRoom, defineServer } from "colyseus";
import express from "express";
import { ROOM_NAME, SERVER_PORT } from "@zuna/shared";
import { applyCatalogOverrides } from "@zuna/shared";
import { apiRouter } from "./api.ts";
import { connectDatabase, disconnectDatabase } from "./db/index.ts";
import { ensureAdmins } from "./adminRepository.ts";
import { ensureContent } from "./content.ts";
import { ensureGearSeed } from "./gear.ts";
import { reloadQuests } from "./quests.ts";
import { ensureCheckinSeed } from "./checkin.ts";
import { ensureProgressSeed } from "./progress.ts";
import { reloadPvp } from "./pvp.ts";
import { ensureVocationSeed } from "./vocations.ts";
import { ensurePaymentSeed } from "./paymentCatalog.ts";
import { startPaymentReconciler } from "./payments.ts";
import { ensureWorldSeed, listItemOverrides } from "./worldRepository.ts";
import { WorldRoom, waitForPendingWrites } from "./WorldRoom.ts";

const production = process.env.NODE_ENV === "production";
// GAME_PORT, e não PORT: ferramentas de dev costumam definir PORT para o servidor web do cliente.
// Em produção vale o PORT que a hospedagem define.
const port = Number(process.env.GAME_PORT) || (production ? Number(process.env.PORT) : 0) || SERVER_PORT;

/** Cliente compilado (npm run build -w @zuna/client). Em produção, o próprio servidor entrega o jogo. */
const CLIENT_DIST = fileURLToPath(new URL("../../client/dist", import.meta.url));

function serveClient(app: express.Application) {
  // /admin é atalho para a página do painel.
  app.get("/admin", (_req, res) => res.redirect(301, "/admin.html"));
  // assets/ tem hash no nome e nunca muda; o resto (index.html, sprites) é revalidado a cada visita.
  app.use("/assets", express.static(`${CLIENT_DIST}/assets`, { immutable: true, maxAge: "1y" }));
  app.use(express.static(CLIENT_DIST, { cacheControl: false, setHeaders: (res) => res.setHeader("Cache-Control", "no-cache") }));
}

await connectDatabase();

// Primeiro arranque: cria o mundo original e os eventos clássicos. Depois disso,
// tudo o que o painel mudou (mapas, eventos, preços da loja) já sai do banco.
await ensureWorldSeed();
await ensureContent();
await ensurePaymentSeed();
await ensureGearSeed();
await reloadQuests();
await ensureCheckinSeed();
await ensureProgressSeed();
await ensureVocationSeed();
await reloadPvp();
applyCatalogOverrides(await listItemOverrides());

// ADMIN_USERS=gabriel,outro marca essas contas como administradoras ao subir o servidor.
const admins = (process.env.ADMIN_USERS ?? "")
  .split(",")
  .map((name) => name.trim())
  .filter((name) => name.length > 0);
if (admins.length > 0) {
  const promoted = await ensureAdmins(admins);
  if (promoted.length > 0) console.log(`Painel: acesso liberado para ${promoted.join(", ")}`);
}

const server = defineServer({
  rooms: {
    [ROOM_NAME]: defineRoom(WorldRoom),
  },
  routes: apiRouter,
  ...(production && existsSync(CLIENT_DIST) ? { express: serveClient } : {}),
});

// O Colyseus fecha as salas (e cada jogador é salvo ao sair) antes de chamar isto.
server.onShutdown(async () => {
  await waitForPendingWrites();
  await disconnectDatabase();
});

await server.listen(port);
startPaymentReconciler();
console.log(production ? `Servidor do jogo rodando na porta ${port}` : `Servidor do jogo rodando em ws://localhost:${port}`);
