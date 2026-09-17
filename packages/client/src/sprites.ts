import Phaser from "phaser";
import {
  appearanceColors,
  frameKey,
  type AnimName,
  type Appearance,
  type BakedDir,
  type SpriteFrameMeta,
  type SpriteSheetMeta,
} from "@game/shared";

// Sprites gerados pelo baker (packages/baker): carregamento, tingimento por visual e desenho.

const SPRITE_URL = `${import.meta.env.BASE_URL}sprites/`;

export interface SpriteSheet {
  meta: SpriteSheetMeta;
  image: HTMLImageElement;
}

interface TintSource {
  pixels: Uint8ClampedArray;
  ids: Uint8ClampedArray;
}

const sheets = new Map<string, Promise<SpriteSheet>>();
/** Pixels crus das folhas tingíveis (~16 MB cada): só as últimas ficam na memória. */
const tintSources = new Map<string, Promise<TintSource>>();
const TINT_SOURCE_LIMIT = 3;

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  return image;
}

export function loadSheet(id: string): Promise<SpriteSheet> {
  let pending = sheets.get(id);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(`${SPRITE_URL}${id}.json`);
      if (!response.ok) throw new Error(`Sprite "${id}" não encontrado (${response.status}).`);
      const meta = (await response.json()) as SpriteSheetMeta;
      return { meta, image: await loadImage(`${SPRITE_URL}${meta.image}`) };
    })();
    sheets.set(id, pending);
    // Se falhar (rede), a próxima tentativa carrega de novo.
    pending.catch(() => sheets.delete(id));
  }
  return pending;
}

/** Pixels exatos, sem correção de cor nem alfa pré-multiplicado (o mapa de grupos precisa dos valores crus). */
async function readPixels(url: string): Promise<Uint8ClampedArray> {
  const blob = await (await fetch(url)).blob();
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

function tintSource(sheet: SpriteSheet): Promise<TintSource> {
  const { id, image, idsImage } = sheet.meta;
  let pending = tintSources.get(id);
  if (pending) {
    // Reinsere para marcar como usada por último.
    tintSources.delete(id);
  } else {
    if (!idsImage) throw new Error(`Sprite "${id}" não é tingível.`);
    pending = Promise.all([readPixels(`${SPRITE_URL}${image}`), readPixels(`${SPRITE_URL}${idsImage}`)]).then(
      ([pixels, ids]) => ({ pixels, ids }),
    );
    pending.catch(() => tintSources.delete(id));
  }
  tintSources.set(id, pending);
  while (tintSources.size > TINT_SOURCE_LIMIT) tintSources.delete(tintSources.keys().next().value!);
  return pending;
}

/** Mesmo cálculo do baker: pixel × cor escolhida × ganho, só nos grupos tingíveis. */
function tintRegion(
  source: TintSource,
  sheetWidth: number,
  region: { x: number; y: number; w: number; h: number },
  colors: number[],
  gain: number,
): ImageData {
  const factors = colors.map((color) => [
    (((color >> 16) & 255) * gain) / 255,
    (((color >> 8) & 255) * gain) / 255,
    ((color & 255) * gain) / 255,
  ]);
  const out = new ImageData(region.w, region.h);
  for (let row = 0; row < region.h; row++) {
    let from = ((region.y + row) * sheetWidth + region.x) * 4;
    let to = row * region.w * 4;
    for (let col = 0; col < region.w; col++, from += 4, to += 4) {
      const r = source.pixels[from];
      const g = source.pixels[from + 1];
      const b = source.pixels[from + 2];
      out.data[to + 3] = source.pixels[from + 3];
      // Grupo = R / 40 (arredondado); 0 é a base, que não é tingida.
      const group = source.ids[from + 3] > 0 ? ((source.ids[from] + 20) / 40) | 0 : 0;
      const factor = group > 0 ? factors[group] : undefined;
      if (factor) {
        out.data[to] = r * factor[0];
        out.data[to + 1] = g * factor[1];
        out.data[to + 2] = b * factor[2];
      } else {
        out.data[to] = r;
        out.data[to + 1] = g;
        out.data[to + 2] = b;
      }
    }
  }
  return out;
}

function canvasFrom(image: ImageData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d")!.putImageData(image, 0, 0);
  return canvas;
}

/** Atlas inteiro tingido (usado no jogo). */
export async function composeSheet(sheet: SpriteSheet, colors: number[]): Promise<HTMLCanvasElement> {
  const source = await tintSource(sheet);
  const { width, height, tintGain } = sheet.meta;
  return canvasFrom(tintRegion(source, width, { x: 0, y: 0, w: width, h: height }, colors, tintGain));
}

/** Só um quadro tingido (usado nas prévias do menu e do guarda-roupa). */
export async function composeFrame(sheet: SpriteSheet, colors: number[], key: string): Promise<HTMLCanvasElement | null> {
  const frame = sheet.meta.frames[key];
  if (!frame) return null;
  const source = await tintSource(sheet);
  return canvasFrom(tintRegion(source, sheet.meta.width, frame, colors, sheet.meta.tintGain));
}

export function appearanceKey(appearance: Appearance): string {
  return appearanceColors(appearance).join("-");
}

// ---------------------------------------------------------------- animação

export function animDuration(meta: SpriteSheetMeta, anim: AnimName): number {
  const spec = meta.anims[anim];
  return spec && spec.fps > 0 ? (spec.frames / spec.fps) * 1000 : 0;
}

/** Quadro da animação após `elapsed` ms. Animações sem repetição param no último quadro. */
export function frameAt(meta: SpriteSheetMeta, anim: AnimName, dir: BakedDir, elapsed: number): string | null {
  const spec = meta.anims[anim];
  if (!spec) return null;
  const raw = Math.max(0, Math.floor((elapsed / 1000) * spec.fps));
  const index = spec.loop ? raw % spec.frames : Math.min(spec.frames - 1, raw);
  return frameKey(anim, dir, index);
}

// ---------------------------------------------------------------- Phaser

export interface SpriteTexture {
  key: string;
  meta: SpriteSheetMeta;
}

/** Texturas do Phaser a partir das folhas; as tingidas são contadas e liberadas quando ninguém mais usa. */
export class SpriteTextures {
  private readonly scene: Phaser.Scene;
  private readonly pending = new Map<string, Promise<SpriteTexture>>();
  private readonly refs = new Map<string, number>();
  private readonly releaseTimers = new Map<string, number>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  acquire(id: string, appearance?: Appearance): Promise<SpriteTexture> {
    const key = appearance ? `sprite:${id}:${appearanceKey(appearance)}` : `sprite:${id}`;
    this.refs.set(key, (this.refs.get(key) ?? 0) + 1);
    window.clearTimeout(this.releaseTimers.get(key));
    let pending = this.pending.get(key);
    if (!pending) {
      pending = this.create(key, id, appearance);
      this.pending.set(key, pending);
      pending.catch(() => this.pending.delete(key));
    }
    return pending;
  }

  release(key: string) {
    const count = (this.refs.get(key) ?? 1) - 1;
    this.refs.set(key, count);
    // As folhas sem tinta são poucas e reaproveitadas: só as tingidas saem da memória.
    if (count > 0 || !key.includes(":", "sprite:".length)) return;
    window.clearTimeout(this.releaseTimers.get(key));
    this.releaseTimers.set(
      key,
      window.setTimeout(() => {
        if ((this.refs.get(key) ?? 0) > 0) return;
        this.refs.delete(key);
        this.pending.delete(key);
        if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
      }, 30_000),
    );
  }

  private async create(key: string, id: string, appearance?: Appearance): Promise<SpriteTexture> {
    const sheet = await loadSheet(id);
    const { meta } = sheet;
    if (!this.scene.textures.exists(key)) {
      const texture =
        appearance && meta.tintable
          ? this.scene.textures.addCanvas(key, await composeSheet(sheet, appearanceColors(appearance)))
          : this.scene.textures.addImage(key, sheet.image);
      if (!texture) throw new Error(`Não foi possível criar a textura ${key}.`);
      for (const [name, frame] of Object.entries(meta.frames)) {
        texture.add(name, 0, frame.x, frame.y, frame.w, frame.h)?.setTrim(meta.cellW, meta.cellH, frame.dx, frame.dy, frame.w, frame.h);
      }
    }
    return { key, meta };
  }
}

// ---------------------------------------------------------------- prévias em canvas 2D

/** Desenha um quadro com o pé em (x, y). `source` é o atlas inteiro ou o próprio quadro já recortado. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  meta: SpriteSheetMeta,
  key: string,
  source: CanvasImageSource,
  x: number,
  y: number,
  options: { flip?: boolean; scale?: number; cropped?: boolean } = {},
): SpriteFrameMeta | undefined {
  const frame = meta.frames[key];
  if (!frame) return undefined;
  const scale = options.scale ?? 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(options.flip ? -scale : scale, scale);
  const sx = options.cropped ? 0 : frame.x;
  const sy = options.cropped ? 0 : frame.y;
  ctx.drawImage(source, sx, sy, frame.w, frame.h, frame.dx - meta.anchorX, frame.dy - meta.anchorY, frame.w, frame.h);
  ctx.restore();
  return frame;
}
