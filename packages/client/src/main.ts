import "@fontsource/lilita-one/400.css";
import "@fontsource/permanent-marker/400.css";
import "@fontsource-variable/montserrat/wght.css";
import Phaser from "phaser";
import { Client, type Room } from "@colyseus/sdk";
import { ROOM_NAME, applyCatalogOverrides, setGearCatalog, type JoinOptions, type WorldsResponse } from "@zuna/shared";
import { apiRequest, wsEndpoint } from "./api.ts";
import { loadLayerIndex } from "./layers.ts";
import { Menu } from "./menu.ts";
import { WorldScene } from "./WorldScene.ts";

const scene = new WorldScene();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#070a1f",
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  // O teclado é tratado pelo DOM (keyboard.ts); o do Phaser bloquearia o Enter dos formulários.
  input: { keyboard: false },
  scene,
});

if (import.meta.env.DEV) Object.assign(window, { game, scene });

// Quais roupas têm camadas (para o equipamento aparecer no personagem).
void loadLayerIndex();

// Mapas dos mundos abertos e preços em vigor. Sem isso o jogo desenha o mundo original,
// que é o mesmo que o servidor gera pela semente.
try {
  const response = await apiRequest<WorldsResponse>("/api/worlds");
  scene.setWorlds(response.worlds);
  applyCatalogOverrides(response.catalog);
  if (response.gear?.length) setGearCatalog(response.gear);
} catch {
  // Servidor fora do ar: o menu já avisa quando o login falhar.
}

const menu = new Menu(async (token, characterId) => {
  // Os nomes e números do jogo são desenhados uma vez só: a fonte precisa estar pronta antes.
  await document.fonts.load('700 12px "Montserrat Variable"').catch(() => undefined);
  const client = new Client(wsEndpoint());
  const options: JoinOptions = { token, characterId };
  const room: Room = await client.joinOrCreate(ROOM_NAME, options);
  menu.hide();
  scene.attachRoom(room, token);
});
void menu.start();
