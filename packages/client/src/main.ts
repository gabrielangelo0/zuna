import Phaser from "phaser";
import { Client, type Room } from "@colyseus/sdk";
import { ROOM_NAME, type JoinOptions } from "@game/shared";
import { wsEndpoint } from "./api.ts";
import { Menu } from "./menu.ts";
import { WorldScene } from "./WorldScene.ts";

const scene = new WorldScene();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0b0d12",
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  // O teclado é tratado pelo DOM (keyboard.ts); o do Phaser bloquearia o Enter dos formulários.
  input: { keyboard: false },
  scene,
});

if (import.meta.env.DEV) Object.assign(window, { game, scene });

const menu = new Menu(async (token, characterId) => {
  const client = new Client(wsEndpoint());
  const options: JoinOptions = { token, characterId };
  const room: Room = await client.joinOrCreate(ROOM_NAME, options);
  menu.hide();
  scene.attachRoom(room);
});
void menu.start();
