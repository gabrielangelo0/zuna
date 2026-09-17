import { Ground, Obj, TEMPLE_X, TEMPLE_Y, TOWN_RADIUS, type GameMap } from "@zuna/shared";
import { rgba } from "./canvas.ts";

// Minimapa no canto: o mapa inteiro é desenhado uma vez num canvas de 1 px por tile
// e depois aparece com a mesma inclinação do jogo (x − y na horizontal, x + y na vertical).

const GROUND_COLOR: Record<number, string> = {
  [Ground.Grass]: "#39662f",
  [Ground.GrassDark]: "#2d5527",
  [Ground.Dirt]: "#6b5334",
  [Ground.Sand]: "#b3a06a",
  [Ground.Water]: "#1f4b7a",
  [Ground.Stone]: "#5c6270",
};

const OBJECT_COLOR: Record<number, string> = {
  [Obj.Tree]: "#1f4a24",
  [Obj.Pine]: "#1b4030",
  [Obj.Rock]: "#4a4f5c",
  [Obj.Bush]: "#2c5a2c",
  [Obj.Pillar]: "#8a5a3c",
  [Obj.Flowers]: "#4d7a3a",
};

export interface Blip {
  x: number;
  y: number;
  color: number;
  /** Raio em pixels do minimapa (2 por padrão). */
  size?: number;
}

const MIN_SCALE = 1.6;
const MAX_SCALE = 6;

export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly world: HTMLCanvasElement;
  private readonly map: GameMap;
  private scale = 3;
  private center = { x: TEMPLE_X, y: TEMPLE_Y };

  constructor(canvas: HTMLCanvasElement, map: GameMap) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.map = map;
    this.world = document.createElement("canvas");
    this.world.width = map.width;
    this.world.height = map.height;
    this.paintWorld();
  }

  /** O mapa inteiro, um pixel por tile. */
  private paintWorld() {
    const { width, height, ground, objects } = this.map;
    const ctx = this.world.getContext("2d")!;
    const image = ctx.createImageData(width, height);
    for (let i = 0; i < width * height; i++) {
      const object = objects[i];
      const color = (object !== Obj.None ? OBJECT_COLOR[object] : undefined) ?? GROUND_COLOR[ground[i]] ?? "#000000";
      image.data[i * 4] = parseInt(color.slice(1, 3), 16);
      image.data[i * 4 + 1] = parseInt(color.slice(3, 5), 16);
      image.data[i * 4 + 2] = parseInt(color.slice(5, 7), 16);
      image.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }

  follow(x: number, y: number) {
    this.center.x = x;
    this.center.y = y;
  }

  zoom(factor: number) {
    this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor));
  }

  /** Mantém o canvas na resolução da tela (o elemento muda de tamanho ao expandir o mapa). */
  private resize(): { width: number; height: number } {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = this.canvas.clientWidth || 180;
    const height = this.canvas.clientHeight || 180;
    if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
      this.canvas.width = Math.round(width * ratio);
      this.canvas.height = Math.round(height * ratio);
    }
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { width, height };
  }

  /** Tile → pixel do minimapa, com a mesma inclinação da tela do jogo. */
  private project(x: number, y: number, width: number, height: number): { x: number; y: number } {
    const s = this.scale;
    return {
      x: width / 2 + (x - this.center.x - (y - this.center.y)) * s,
      y: height / 2 + (x - this.center.x + (y - this.center.y)) * (s / 2),
    };
  }

  draw(blips: Blip[]) {
    const { width, height } = this.resize();
    const { ctx } = this;
    const s = this.scale;
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // Mesma matriz da projeção isométrica: cada pixel do mapa vira um losango.
    ctx.translate(width / 2, height / 2);
    ctx.transform(s, s / 2, -s, s / 2, 0, 0);
    ctx.translate(-this.center.x, -this.center.y);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(this.world, 0, 0);
    ctx.restore();

    // Cidade: um anel claro em volta do templo.
    const temple = this.project(TEMPLE_X, TEMPLE_Y, width, height);
    ctx.save();
    ctx.strokeStyle = "rgba(255, 235, 170, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(temple.x, temple.y, TOWN_RADIUS * s * 1.6, TOWN_RADIUS * s * 0.8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    for (const blip of blips) {
      const point = this.project(blip.x, blip.y, width, height);
      if (point.x < -8 || point.y < -8 || point.x > width + 8 || point.y > height + 8) continue;
      const radius = blip.size ?? 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = rgba(blip.color, 0.95);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
      ctx.stroke();
    }

    // O jogador fica sempre no centro.
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(4, 4);
    ctx.lineTo(0, 2);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
