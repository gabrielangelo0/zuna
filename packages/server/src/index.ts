import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineRoom, defineServer } from "colyseus";
import express from "express";
import { ROOM_NAME, SERVER_PORT } from "@game/shared";
import { apiRouter } from "./api.ts";
import { connectDatabase, disconnectDatabase } from "./db/index.ts";
import { WorldRoom, waitForPendingWrites } from "./WorldRoom.ts";

const production = process.env.NODE_ENV === "production";
// GAME_PORT, e não PORT: ferramentas de dev costumam definir PORT para o servidor web do cliente.
// Em produção vale o PORT que a hospedagem define.
const port = Number(process.env.GAME_PORT) || (production ? Number(process.env.PORT) : 0) || SERVER_PORT;

/** Cliente compilado (npm run build -w @game/client). Em produção, o próprio servidor entrega o jogo. */
const CLIENT_DIST = fileURLToPath(new URL("../../client/dist", import.meta.url));

function serveClient(app: express.Application) {
  // assets/ tem hash no nome e nunca muda; o resto (index.html, sprites) é revalidado a cada visita.
  app.use("/assets", express.static(`${CLIENT_DIST}/assets`, { immutable: true, maxAge: "1y" }));
  app.use(express.static(CLIENT_DIST, { cacheControl: false, setHeaders: (res) => res.setHeader("Cache-Control", "no-cache") }));
}

await connectDatabase();

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
console.log(production ? `Servidor do jogo rodando na porta ${port}` : `Servidor do jogo rodando em ws://localhost:${port}`);
