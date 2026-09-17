import {
  appearanceColors,
  frameKey,
  frontKey,
  itemSpriteId,
  type AnimName,
  type Appearance,
  type BakedDir,
  type CatalogItem,
  type SpriteSheetMeta,
} from "@zuna/shared";
import { composeFrame, drawFrame, frameAt, loadSheet, type SpriteSheet } from "./sprites.ts";

// Prévias em canvas 2D (menu e guarda-roupa), com os mesmos sprites do jogo.

export interface Look {
  appearance: Appearance;
  mount?: string;
  pet?: string;
}

const composed = new Map<string, Promise<HTMLCanvasElement | null>>();

/** Quadro tingido com as cores do visual, com cache (as prévias pedem os mesmos quadros o tempo todo). */
function tintedFrame(sheet: SpriteSheet, colors: number[], key: string): Promise<HTMLCanvasElement | null> {
  const cacheKey = `${sheet.meta.id}|${colors.join("-")}|${key}`;
  let pending = composed.get(cacheKey);
  if (!pending) {
    pending = composeFrame(sheet, colors, key);
    composed.set(cacheKey, pending);
    if (composed.size > 400) composed.delete(composed.keys().next().value!);
  }
  return pending;
}

function animFrames(meta: SpriteSheetMeta, anim: AnimName, dir: BakedDir): string[] {
  return Array.from({ length: meta.anims[anim]?.frames ?? 0 }, (_, i) => frameKey(anim, dir, i));
}

interface Ready {
  outfit: SpriteSheet;
  frames: Map<string, HTMLCanvasElement | null>;
  mount: SpriteSheet | null;
  pet: SpriteSheet | null;
  /** Quanto o desenho se estende a partir do pé, em pixels do sprite (para caber no canvas). */
  extent: Extent;
}

interface Extent {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Maior extensão dos quadros em cada lado do pé; `dx`/`dy` deslocam o pé (cavaleiro sobre a sela). */
function extentOf(meta: SpriteSheetMeta, keys: string[], dx = 0, dy = 0): Extent {
  const extent: Extent = { top: 0, bottom: 0, left: 0, right: 0 };
  for (const key of keys) {
    const frame = meta.frames[key];
    if (!frame) continue;
    extent.top = Math.max(extent.top, meta.anchorY - frame.dy - dy);
    extent.bottom = Math.max(extent.bottom, frame.dy + frame.h - meta.anchorY + dy);
    extent.left = Math.max(extent.left, meta.anchorX - frame.dx - dx);
    extent.right = Math.max(extent.right, frame.dx + frame.w - meta.anchorX + dx);
  }
  return extent;
}

function mergeExtents(a: Extent, b: Extent): Extent {
  return {
    top: Math.max(a.top, b.top),
    bottom: Math.max(a.bottom, b.bottom),
    left: Math.max(a.left, b.left),
    right: Math.max(a.right, b.right),
  };
}

export interface LookPreviewOptions {
  dir: BakedDir;
  /** Escala do personagem a pé (montado, fica menor para caber). */
  scale: number;
  /** Altura do chão no canvas, em pixels. */
  footY: number;
  animate: boolean;
}

/** Visual completo num canvas: montaria + cavaleiro + mascote, parado e animado. */
export class LookPreview {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly options: LookPreviewOptions;
  private signature = "";
  private version = 0;
  private ready: Ready | null = null;
  private frameRequest = 0;

  constructor(canvas: HTMLCanvasElement, options: LookPreviewOptions) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.options = options;
  }

  set(look: Look) {
    const signature = JSON.stringify(look);
    if (signature === this.signature) return;
    this.signature = signature;
    const version = ++this.version;
    this.prepare(look)
      .then((ready) => {
        if (version !== this.version) return;
        this.ready = ready;
        this.draw(performance.now());
        this.start();
      })
      .catch((error: unknown) => console.error(error));
  }

  /** Retoma a animação (ela para sozinha quando o canvas some da tela). */
  start() {
    if (!this.options.animate || this.frameRequest || !this.ready) return;
    const tick = (time: number) => {
      this.frameRequest = 0;
      // offsetParent é null quando o canvas (ou um ancestral) está escondido.
      if (!this.canvas.isConnected || this.canvas.offsetParent === null) return;
      this.draw(time);
      this.frameRequest = requestAnimationFrame(tick);
    };
    this.frameRequest = requestAnimationFrame(tick);
  }

  stop() {
    cancelAnimationFrame(this.frameRequest);
    this.frameRequest = 0;
  }

  private async prepare(look: Look): Promise<Ready> {
    const dir = this.options.dir;
    const [outfit, mount, pet] = await Promise.all([
      loadSheet(`outfit_${look.appearance.outfit}`),
      look.mount ? loadSheet(`mount_${look.mount}`) : null,
      look.pet ? loadSheet(`pet_${look.pet}`) : null,
    ]);
    const colors = appearanceColors(look.appearance);
    const keys = mount ? [frameKey("ride", dir, 0)] : animFrames(outfit.meta, "idle", dir);
    const frames = new Map(await Promise.all(keys.map(async (key) => [key, await tintedFrame(outfit, colors, key)] as const)));

    let extent = extentOf(outfit.meta, keys);
    if (mount) {
      const mountKeys = animFrames(mount.meta, "idle", dir);
      const seat = mount.meta.frames[mountKeys[0]];
      const riderSeat = outfit.meta.frames[keys[0]];
      // O pé do cavaleiro vai para onde a sela manda.
      const hasSeat = seat?.sx !== undefined && seat.sy !== undefined && riderSeat?.sx !== undefined && riderSeat.sy !== undefined;
      const dx = hasSeat ? seat.sx! - riderSeat.sx! : 0;
      const dy = hasSeat ? seat.sy! - riderSeat.sy! : 0;
      extent = mergeExtents(extentOf(mount.meta, mountKeys), extentOf(outfit.meta, keys, dx, dy));
    }
    return { outfit, frames, mount, pet, extent };
  }

  private draw(time: number) {
    const ready = this.ready;
    if (!ready) return;
    const { ctx, canvas } = this;
    const { dir, footY } = this.options;
    const preferred = ready.mount ? this.options.scale * 0.68 : this.options.scale;
    const x = canvas.width / 2 - (ready.pet ? 22 * preferred : 0);
    // Chapéus altos, cajados e montarias grandes: reduz o que for preciso para caber inteiro.
    const { top, bottom, left, right } = ready.extent;
    const scale = Math.min(
      preferred,
      (footY - 4) / Math.max(1, top),
      (canvas.height - footY - 2) / Math.max(1, bottom),
      (x - 2) / Math.max(1, left),
      (canvas.width - x - 2) / Math.max(1, right),
    );
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // O mascote fica um pouco atrás e ao lado, então é desenhado primeiro, na mesma escala do dono.
    if (ready.pet) {
      const key = frameAt(ready.pet.meta, "idle", dir, time);
      if (key) drawFrame(ctx, ready.pet.meta, key, ready.pet.image, x + 58 * scale, footY - 12 * scale, { scale });
    }

    const { outfit } = ready;
    if (ready.mount) {
      const mount = ready.mount;
      const mountKey = frameAt(mount.meta, "idle", dir, time)!;
      const mountFrame = drawFrame(ctx, mount.meta, mountKey, mount.image, x, footY, { scale });
      const riderKey = frameKey("ride", dir, 0);
      const riderFrame = outfit.meta.frames[riderKey];
      const rider = ready.frames.get(riderKey);
      if (rider && mountFrame?.sx !== undefined && mountFrame.sy !== undefined && riderFrame?.sx !== undefined && riderFrame.sy !== undefined) {
        const riderX = x + (mountFrame.sx - riderFrame.sx) * scale;
        const riderY = footY + (mountFrame.sy - riderFrame.sy) * scale;
        drawFrame(ctx, outfit.meta, riderKey, rider, riderX, riderY, { scale, cropped: true });
      }
      const front = frontKey(mountKey);
      if (mount.meta.frames[front]) drawFrame(ctx, mount.meta, front, mount.image, x, footY, { scale });
      return;
    }

    const key = frameAt(outfit.meta, "idle", dir, time);
    const source = key ? ready.frames.get(key) : null;
    if (key && source) drawFrame(ctx, outfit.meta, key, source, x, footY, { scale, cropped: true });
  }
}

/** Desenha um item da loja num card: roupa nas cores do jogador, mascote ou montaria. */
export async function paintItem(canvas: HTMLCanvasElement, item: CatalogItem, appearance: Appearance) {
  const sheet = await loadSheet(itemSpriteId(item));
  const { meta } = sheet;
  const key = frameKey("idle", "SE", 0);
  const frame = meta.frames[key];
  if (!frame) return;
  const tinted = item.kind === "outfit";
  const source = tinted ? await tintedFrame(sheet, appearanceColors({ ...appearance, outfit: item.id }), key) : sheet.image;
  if (!source) return;

  const margin = 10;
  const scale = Math.min(
    item.kind === "pet" ? 2.2 : 1.6,
    (canvas.height - margin * 2) / meta.headHeight,
    (canvas.width - margin * 2) / frame.w,
  );
  // Centraliza o que é visível (o recorte), e não a célula inteira.
  const offset = frame.dx + frame.w / 2 - meta.anchorX;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawFrame(ctx, meta, key, source, canvas.width / 2 - offset * scale, canvas.height - margin, { scale, cropped: tinted });
}
