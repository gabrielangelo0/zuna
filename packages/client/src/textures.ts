import Phaser from "phaser";
import { TILE_H, TILE_W } from "@zuna/shared";
import { ellipse, rgba, type Ctx } from "./canvas.ts";
import { createWaterTextures } from "./water.ts";

// Texturas desenhadas no próprio cliente: chão, efeitos e marcadores. A água mora em water.ts.
// Personagens, monstros e cenário vêm dos sprites gerados pelo baker (sprites.ts).

/** Célula do atlas de chão: 1 px a mais de cada lado para os losangos se sobreporem sem frestas. */
export const TILE_CELL_W = TILE_W + 2;
export const TILE_CELL_H = TILE_H + 2;

export const GROUND_FRAMES = { grass: 4, grassDark: 3, dirt: 3, sand: 3, stone: 3, snow: 3, cave: 3, ash: 3, mud: 3 } as const;
export type GroundFrameName = keyof typeof GROUND_FRAMES;

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function makeCanvas(scene: Phaser.Scene, key: string, width: number, height: number, draw: (ctx: Ctx) => void) {
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) throw new Error(`Não foi possível criar a textura ${key}`);
  draw(texture.context);
  texture.refresh();
  return texture;
}

function diamondPath(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w, y + h / 2);
  ctx.lineTo(x + w / 2, y + h);
  ctx.lineTo(x, y + h / 2);
  ctx.closePath();
}

// ---------------------------------------------------------------- chão

interface GroundStyle {
  base: number;
  detail: readonly number[];
  count: number;
  kind: "blade" | "pebble" | "dot" | "brick";
}

const GROUND_STYLES: Record<GroundFrameName, GroundStyle> = {
  grass: { base: 0x5c9e3f, detail: [0x6fb34d, 0x4d8a34, 0x7cc05a], count: 28, kind: "blade" },
  grassDark: { base: 0x447f37, detail: [0x3a6f2f, 0x52913f, 0x335f29], count: 28, kind: "blade" },
  dirt: { base: 0x9a7650, detail: [0x876642, 0xab8660, 0x7a5a3a], count: 14, kind: "pebble" },
  sand: { base: 0xd9c48f, detail: [0xc9b47d, 0xe6d4a3, 0xbfa870], count: 26, kind: "dot" },
  stone: { base: 0xb2aca0, detail: [0xa39d91, 0xbdb7ab, 0x9c968a], count: 4, kind: "brick" },
  snow: { base: 0xdfe9f0, detail: [0xcbdae6, 0xf4f8fb, 0xbfd0de], count: 18, kind: "pebble" },
  cave: { base: 0x3c3a46, detail: [0x322f3b, 0x46434f, 0x2b2932], count: 4, kind: "brick" },
  ash: { base: 0x4e4444, detail: [0x3f3636, 0x5d5353, 0x7a3a24], count: 16, kind: "pebble" },
  mud: { base: 0x5c5432, detail: [0x4b4428, 0x6b6139, 0x413b22], count: 16, kind: "pebble" },
};

function paintGround(ctx: Ctx, ox: number, style: GroundStyle) {
  const w = TILE_CELL_W;
  const h = TILE_CELL_H;
  ctx.save();
  diamondPath(ctx, ox, 0, w, h);
  ctx.clip();
  ctx.fillStyle = rgba(style.base);
  ctx.fillRect(ox, 0, w, h);

  switch (style.kind) {
    case "blade":
      for (let i = 0; i < style.count; i++) {
        ctx.fillStyle = rgba(pick(style.detail));
        ctx.fillRect(ox + Math.random() * w, Math.random() * h, 1, 2 + Math.random() * 2);
      }
      break;
    case "pebble":
      for (let i = 0; i < style.count; i++) {
        ellipse(ctx, ox + Math.random() * w, Math.random() * h, 1 + Math.random() * 1.8, 0.8 + Math.random(), rgba(pick(style.detail)));
      }
      break;
    case "dot":
      for (let i = 0; i < style.count; i++) {
        ctx.fillStyle = rgba(pick(style.detail));
        ctx.fillRect(ox + Math.random() * w, Math.random() * h, 1, 1);
      }
      break;
    case "brick": {
      // Quatro lajotas por tile, cada uma com um tom levemente diferente.
      const quads: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];
      for (const [qx, qy] of quads) {
        const cx = ox + w / 4 + (qx - qy) * (w / 4) + w / 4;
        const cy = h / 4 + (qx + qy) * (h / 4);
        diamondPath(ctx, cx - w / 4, cy - h / 4, w / 2, h / 2);
        ctx.fillStyle = rgba(pick(style.detail));
        ctx.fill();
        ctx.strokeStyle = "rgba(70, 62, 50, 0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();

  // Sombra suave nas bordas inferiores: dá volume sem desenhar uma grade.
  ctx.beginPath();
  ctx.moveTo(ox + 1, h / 2);
  ctx.lineTo(ox + w / 2, h - 1);
  ctx.lineTo(ox + w - 1, h / 2);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.07)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function createGroundAtlas(scene: Phaser.Scene) {
  const names = Object.keys(GROUND_FRAMES) as GroundFrameName[];
  const total = names.reduce((sum, name) => sum + GROUND_FRAMES[name], 0);
  const texture = scene.textures.createCanvas("ground", total * TILE_CELL_W, TILE_CELL_H);
  if (!texture) throw new Error("Não foi possível criar o atlas de chão");
  let column = 0;
  for (const name of names) {
    for (let frame = 0; frame < GROUND_FRAMES[name]; frame++) {
      const ox = column * TILE_CELL_W;
      paintGround(texture.context, ox, GROUND_STYLES[name]);
      texture.add(`${name}_${frame}`, 0, ox, 0, TILE_CELL_W, TILE_CELL_H);
      column++;
    }
  }
  texture.refresh();
}

// ---------------------------------------------------------------- efeitos e marcadores

function createEffectTextures(scene: Phaser.Scene) {
  makeCanvas(scene, "spark", 16, 16, (ctx) => {
    const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, "rgba(255, 255, 255, 1)");
    g.addColorStop(0.4, "rgba(255, 255, 255, 0.7)");
    g.addColorStop(1, "rgba(255, 255, 255, 0)");
    ellipse(ctx, 8, 8, 8, 8, g);
  });

  makeCanvas(scene, "beam", 40, 200, (ctx) => {
    const vertical = ctx.createLinearGradient(0, 0, 0, 200);
    vertical.addColorStop(0, "rgba(255, 220, 120, 0)");
    vertical.addColorStop(0.7, "rgba(255, 214, 102, 0.75)");
    vertical.addColorStop(1, "rgba(255, 244, 200, 0.95)");
    ctx.fillStyle = vertical;
    ctx.fillRect(0, 0, 40, 200);
    const horizontal = ctx.createLinearGradient(0, 0, 40, 0);
    horizontal.addColorStop(0, "rgba(0, 0, 0, 0)");
    horizontal.addColorStop(0.5, "rgba(0, 0, 0, 1)");
    horizontal.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = horizontal;
    ctx.fillRect(0, 0, 40, 200);
  });

  const marker = (key: string, stroke: string, fill: string) =>
    makeCanvas(scene, key, TILE_W + 4, TILE_H + 4, (ctx) => {
      diamondPath(ctx, 2, 2, TILE_W, TILE_H);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  marker("marker_target", "rgba(255, 70, 60, 0.95)", "rgba(255, 60, 50, 0.16)");
  marker("marker_hover", "rgba(255, 255, 255, 0.45)", "rgba(255, 255, 255, 0.05)");
  marker("marker_goto", "rgba(255, 230, 140, 0.8)", "rgba(255, 230, 140, 0.1)");
}

export function createTextures(scene: Phaser.Scene) {
  createGroundAtlas(scene);
  createWaterTextures(scene);
  createEffectTextures(scene);
}
