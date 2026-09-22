import Phaser from "phaser";
import { ellipse, rgba, type Ctx } from "./canvas.ts";

// Efeitos visuais dos poderes. Cada poder é montado em camadas: algo no chão (círculo,
// rachadura, mancha), o golpe em si (projétil, lâmina, raio) e o que sobra no ar
// (faíscas, fumaça, brilho). Tudo com texturas desenhadas aqui mesmo, em canvas.

type Point = { x: number; y: number };

export interface FxDepths {
  /** Por cima do chão e dos decalques, por baixo de quem anda. */
  ground: number;
  /** Por cima de tudo, menos dos números flutuantes. */
  air: number;
}

// ---------------------------------------------------------------- texturas

function canvasTexture(scene: Phaser.Scene, key: string, width: number, height: number, draw: (ctx: Ctx) => void) {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) throw new Error(`Não foi possível criar a textura ${key}`);
  draw(texture.context);
  texture.refresh();
}

// ---------------------------------------------------------------- explosões por casa

export type BurstElement = "fire" | "ice" | "energy" | "earth" | "death" | "holy";

/** Cores de cada explosão: miolo, meio, borda e fundo (do mais claro ao mais escuro). */
const BURST_PALETTE: Record<BurstElement, [number, number, number, number]> = {
  fire: [0xffe9a0, 0xffb22e, 0xf2560f, 0xa8160a],
  ice: [0xffffff, 0xc9f6ff, 0x55c8ff, 0x1c5fd0],
  energy: [0xffffff, 0xf5c8ff, 0xc060ff, 0x5d1fc9],
  earth: [0xfff6dc, 0xffcf7a, 0xc7792c, 0x6b3a18],
  death: [0xf4fff0, 0xc6ff9a, 0x5fd35a, 0x1d5b3a],
  holy: [0xffffff, 0xfff4c2, 0xffd24a, 0xc9901a],
};

/** Tom do clarão de cada elemento. */
export const BURST_TINT: Record<BurstElement, number> = {
  fire: 0xff8a2c,
  ice: 0x8fe0ff,
  energy: 0xc57bff,
  earth: 0xffc36a,
  death: 0x7ce06a,
  holy: 0xfff1a8,
};

export const BURST_W = 96;
export const BURST_H = 116;
/** Onde fica o centro da casa na célula da explosão. */
export const BURST_ANCHOR_Y = 94;
export const BURST_FRAMES = 12;

/** Números pseudoaleatórios repetíveis: cada explosão tem sempre o mesmo desenho. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/** Um quadro da explosão: línguas de fogo subindo, núcleo que ofusca, faíscas e fumaça no fim. */
function drawBurst(ctx: Ctx, ox: number, t: number, palette: readonly number[], seed: number) {
  const random = seeded(seed);
  const cx = ox + BURST_W / 2;
  const base = BURST_ANCHOR_Y;
  const grow = 1 - (1 - Math.min(1, t * 1.25)) ** 3;
  const life = Math.max(0, 1 - t);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // Mancha de luz no chão (achatada, em perspectiva).
  ctx.save();
  ctx.translate(cx, base);
  ctx.scale(1, 0.45);
  const floor = ctx.createRadialGradient(0, 0, 0, 0, 0, 16 + 26 * grow);
  floor.addColorStop(0, rgba(palette[1]!, 0.75 * life));
  floor.addColorStop(0.6, rgba(palette[2]!, 0.35 * life));
  floor.addColorStop(1, rgba(palette[3]!, 0));
  ctx.fillStyle = floor;
  ctx.beginPath();
  ctx.arc(0, 0, 16 + 26 * grow, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Línguas de fogo: sobem e se abrem, cada uma com o próprio tamanho.
  const tongues = 9;
  const rise = Math.sin(Math.PI * Math.min(1, t * 1.15));
  for (let i = 0; i < tongues; i++) {
    const spread = (i / (tongues - 1) - 0.5) * 2.5 + (random() - 0.5) * 0.35;
    const angle = -Math.PI / 2 + spread * 0.55;
    const length = (30 + random() * 34) * rise * (1 - Math.abs(spread) * 0.22);
    const width = 7 + random() * 7;
    if (length < 2) continue;
    const sx = cx + Math.cos(angle) * 5;
    const sy = base - 4;
    const tx = cx + Math.cos(angle) * length * 0.8;
    const ty = base + Math.sin(angle) * length * 1.15;
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    const gradient = ctx.createLinearGradient(sx, sy, tx, ty);
    gradient.addColorStop(0, rgba(palette[0]!, 0.7 * life));
    gradient.addColorStop(0.35, rgba(palette[1]!, 0.62 * life));
    gradient.addColorStop(0.75, rgba(palette[2]!, 0.45 * life));
    gradient.addColorStop(1, rgba(palette[3]!, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(sx + nx * width, sy + ny * width);
    ctx.quadraticCurveTo(sx + (tx - sx) * 0.55 + nx * width * 1.1, sy + (ty - sy) * 0.55 + ny * width * 1.1, tx, ty);
    ctx.quadraticCurveTo(sx + (tx - sx) * 0.55 - nx * width * 1.1, sy + (ty - sy) * 0.55 - ny * width * 1.1, sx - nx * width, sy - ny * width);
    ctx.closePath();
    ctx.fill();
  }

  // Núcleo que ofusca no começo.
  const coreR = 10 + 22 * grow;
  const core = ctx.createRadialGradient(cx, base - 16, 0, cx, base - 16, coreR);
  core.addColorStop(0, rgba(palette[0]!, 0.85 * life ** 1.5));
  core.addColorStop(0.45, rgba(palette[1]!, 0.5 * life ** 1.3));
  core.addColorStop(1, rgba(palette[2]!, 0));
  ctx.fillStyle = core;
  ctx.fillRect(cx - coreR, base - 16 - coreR, coreR * 2, coreR * 2);

  // Faíscas voando para fora e para cima.
  for (let i = 0; i < 14; i++) {
    const angle = -Math.PI / 2 + (random() - 0.5) * Math.PI * 1.5;
    const reach = (12 + random() * 44) * grow;
    const x = cx + Math.cos(angle) * reach;
    const y = base - 12 + Math.sin(angle) * reach * 1.1 + t * t * 18;
    const size = (1.2 + random() * 1.8) * (1 - t * 0.6);
    ctx.fillStyle = rgba(i % 3 === 0 ? palette[0]! : palette[1]!, life);
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }
  ctx.restore();

  // Fumaça subindo no fim (sem somar luz).
  if (t > 0.45) {
    const smoke = (t - 0.45) / 0.55;
    for (let i = 0; i < 4; i++) {
      const x = cx + (random() - 0.5) * 26;
      const y = base - 30 - smoke * 34 - random() * 12;
      const r = 8 + smoke * 12 + random() * 5;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, `rgba(40, 34, 44, ${0.35 * Math.sin(Math.PI * smoke)})`);
      gradient.addColorStop(1, "rgba(40, 34, 44, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
}

/** Uma folha de explosão por elemento (3 variações), com a animação registrada no Phaser. */
function createBurstTextures(scene: Phaser.Scene) {
  for (const [element, palette] of Object.entries(BURST_PALETTE) as [BurstElement, readonly number[]][]) {
    for (let variant = 0; variant < 3; variant++) {
      const key = `fxb_${element}_${variant}`;
      if (scene.textures.exists(key)) continue;
      const texture = scene.textures.createCanvas(key, BURST_W * BURST_FRAMES, BURST_H);
      if (!texture) continue;
      for (let frame = 0; frame < BURST_FRAMES; frame++) {
        drawBurst(texture.context, frame * BURST_W, frame / (BURST_FRAMES - 1), palette, 1000 * variant + element.length * 17 + 3);
        texture.add(String(frame), 0, frame * BURST_W, 0, BURST_W, BURST_H);
      }
      texture.refresh();
      scene.anims.create({
        key,
        frames: Array.from({ length: BURST_FRAMES }, (_, frame) => ({ key, frame: String(frame) })),
        frameRate: 30,
        hideOnComplete: true,
      });
    }
  }
}

export function createFxTextures(scene: Phaser.Scene) {
  createBurstTextures(scene);
  // Brilho redondo e macio: núcleo de bola de fogo, clarões e orbes.
  canvasTexture(scene, "fx_glow", 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.75)");
    g.addColorStop(0.6, "rgba(255,255,255,0.18)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });

  // Estrela de quatro pontas: faísca de impacto.
  canvasTexture(scene, "fx_flare", 64, 64, (ctx) => {
    for (const [w, h] of [[30, 2.2], [2.2, 30], [12, 12]] as const) {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, Math.max(w, h));
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ellipse(ctx, 32, 32, w, h, g);
    }
  });

  // Fumaça: bolhas cinzas sobrepostas, com a borda sumindo.
  canvasTexture(scene, "fx_smoke", 64, 64, (ctx) => {
    const blobs = [[32, 34, 20], [22, 30, 13], [42, 28, 14], [30, 22, 12], [40, 40, 12]];
    for (const [x, y, r] of blobs) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.55)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ellipse(ctx, x, y, r, r, g);
    }
  });

  // Lâmina em meia-lua, forte na ponta e sumindo no rastro.
  canvasTexture(scene, "fx_slash", 160, 160, (ctx) => {
    const steps = 48;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const angle = -Math.PI * 0.95 + t * Math.PI * 1.1;
      const radius = 62;
      const thickness = 2 + t * 12;
      ctx.beginPath();
      ctx.arc(80 + Math.cos(angle) * radius, 80 + Math.sin(angle) * radius, thickness / 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.05 + t * 0.9})`;
      ctx.fill();
    }
  });

  // Círculo mágico: anéis, hexagrama, marcas e runas. Fica achatado no chão (escala 0,5 em y).
  canvasTexture(scene, "fx_rune", 256, 256, (ctx) => {
    const c = 128;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(c, c, 118, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c, c, 104, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c, c, 62, 0, Math.PI * 2);
    ctx.stroke();
    // Hexagrama.
    for (const start of [-Math.PI / 2, Math.PI / 2]) {
      ctx.beginPath();
      for (let i = 0; i <= 3; i++) {
        const a = start + (i * Math.PI * 2) / 3;
        const x = c + Math.cos(a) * 104;
        const y = c + Math.sin(a) * 104;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Marcas entre os anéis de fora, como um relógio.
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const inner = i % 3 === 0 ? 106 : 110;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner);
      ctx.lineTo(c + Math.cos(a) * 116, c + Math.sin(a) * 116);
      ctx.stroke();
    }
    // Runas: pequenos traços no anel de dentro.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const x = c + Math.cos(a) * 82;
      const y = c + Math.sin(a) * 82;
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 6);
      ctx.lineTo(x + 5, y - 6);
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x, y + 6);
      ctx.moveTo(x - 4, y + 2);
      ctx.lineTo(x + 4, y + 6);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(c, c, 0, c, c, 62);
    g.addColorStop(0, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });

  // Pedrinha para os destroços do Tremor.
  canvasTexture(scene, "fx_rock", 12, 12, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(2, 5);
    ctx.lineTo(6, 1);
    ctx.lineTo(11, 4);
    ctx.lineTo(10, 10);
    ctx.lineTo(4, 11);
    ctx.closePath();
    ctx.fillStyle = rgba(0xffffff);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(5, 7, 5, 3);
  });

  // Mancha escura que fica no chão depois do fogo e do raio.
  canvasTexture(scene, "fx_scorch", 96, 48, (ctx) => {
    const g = ctx.createRadialGradient(48, 24, 0, 48, 24, 46);
    g.addColorStop(0, "rgba(20,12,8,0.75)");
    g.addColorStop(0.6, "rgba(30,18,10,0.35)");
    g.addColorStop(1, "rgba(30,18,10,0)");
    ctx.save();
    ctx.scale(1, 0.5);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(48, 48, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ---------------------------------------------------------------- efeitos

interface BurstSpec {
  texture?: string;
  tints: number[];
  count: number;
  speed: [number, number];
  angle?: [number, number];
  lifespan: [number, number];
  scale: [number, number];
  gravityY?: number;
  alpha?: [number, number];
  blend?: Phaser.BlendModes;
  rotate?: boolean;
  depth?: number;
}

export class SpellFx {
  private readonly scene: Phaser.Scene;
  private readonly depths: FxDepths;

  constructor(scene: Phaser.Scene, depths: FxDepths) {
    this.scene = scene;
    this.depths = depths;
  }

  // ---------------------------------------------------------------- peças

  /** Uma leva de partículas que explode de uma vez e some. */
  private burst(x: number, y: number, spec: BurstSpec) {
    const emitter = this.scene.add.particles(x, y, spec.texture ?? "fx_glow", {
      speed: { min: spec.speed[0], max: spec.speed[1] },
      angle: spec.angle ? { min: spec.angle[0], max: spec.angle[1] } : { min: 0, max: 360 },
      lifespan: { min: spec.lifespan[0], max: spec.lifespan[1] },
      scale: { start: spec.scale[0], end: spec.scale[1] },
      alpha: { start: spec.alpha?.[0] ?? 1, end: spec.alpha?.[1] ?? 0 },
      gravityY: spec.gravityY ?? 0,
      rotate: spec.rotate ? { min: 0, max: 360 } : 0,
      tint: spec.tints,
      blendMode: spec.blend ?? Phaser.BlendModes.ADD,
      emitting: false,
    });
    emitter.setDepth(spec.depth ?? this.depths.air);
    emitter.explode(spec.count);
    this.scene.time.delayedCall(spec.lifespan[1] + 150, () => emitter.destroy());
  }

  /** Clarão rápido: cresce e some. */
  private flash(x: number, y: number, tint: number, size: number, duration = 260, depth = this.depths.air) {
    const glow = this.scene.add
      .image(x, y, "fx_glow")
      .setTint(tint)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(depth)
      .setScale(size * 0.4);
    this.scene.tweens.add({
      targets: glow,
      scale: size,
      alpha: 0,
      duration,
      ease: "Cubic.easeOut",
      onComplete: () => glow.destroy(),
    });
  }

  /** Círculo mágico no chão, girando, que aparece e some. */
  private rune(x: number, y: number, tint: number, size: number, duration: number, spin = 1) {
    const rune = this.scene.add
      .image(x, y, "fx_rune")
      .setTint(tint)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(this.depths.ground)
      .setAlpha(0);
    const holder = { t: 0 };
    this.scene.tweens.add({
      targets: holder,
      t: 1,
      duration,
      onUpdate: () => {
        const t = holder.t;
        // Entra depressa, fica e sai devagar.
        const alpha = t < 0.15 ? t / 0.15 : t > 0.7 ? (1 - t) / 0.3 : 1;
        const grow = 0.75 + 0.25 * Math.min(1, t / 0.2);
        rune.setAlpha(alpha * 0.9);
        rune.setScale((size / 256) * grow, (size / 512) * grow);
        rune.setRotation(spin * t * Math.PI * 0.9);
      },
      onComplete: () => rune.destroy(),
    });
  }

  /** Anel que se espalha no chão, em perspectiva. */
  private shockwave(x: number, y: number, from: number, to: number, color: number, duration: number, width = 6) {
    const ring = this.scene.add.graphics({ x, y }).setDepth(this.depths.ground + 1).setBlendMode(Phaser.BlendModes.ADD);
    const holder = { t: 0 };
    this.scene.tweens.add({
      targets: holder,
      t: 1,
      duration,
      ease: "Cubic.easeOut",
      onUpdate: () => {
        const size = from + holder.t * (to - from);
        ring.clear();
        ring.lineStyle(width * (1 - holder.t) + 1, color, 1 - holder.t);
        ring.strokeEllipse(0, 0, size, size / 2);
        ring.lineStyle((width * (1 - holder.t)) / 2 + 1, 0xffffff, (1 - holder.t) * 0.6);
        ring.strokeEllipse(0, 0, size * 0.96, size * 0.48);
      },
      onComplete: () => ring.destroy(),
    });
  }

  /** Mancha no chão que vai sumindo. */
  private scorch(x: number, y: number, scale = 1) {
    const mark = this.scene.add.image(x, y, "fx_scorch").setDepth(this.depths.ground - 1).setScale(scale).setAlpha(0.9);
    this.scene.tweens.add({ targets: mark, alpha: 0, delay: 900, duration: 1400, onComplete: () => mark.destroy() });
  }

  /** Coluna de luz subindo do chão. */
  private column(x: number, y: number, tint: number, height: number, duration: number) {
    const beam = this.scene.add
      .image(x, y, "beam")
      .setOrigin(0.5, 1)
      .setTint(tint)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(this.depths.air)
      .setScale(1.1, 0.1)
      .setAlpha(0.9);
    this.scene.tweens.add({ targets: beam, scaleY: height / 200, duration: duration * 0.35, ease: "Cubic.easeOut" });
    this.scene.tweens.add({
      targets: beam,
      alpha: 0,
      scaleX: 0.3,
      delay: duration * 0.35,
      duration: duration * 0.65,
      onComplete: () => beam.destroy(),
    });
  }

  /** Raio em zigue-zague, com brilho largo e miolo branco. */
  private lightning(x1: number, y1: number, x2: number, y2: number, tint: number, duration = 180) {
    const points: Point[] = [{ x: x1, y: y1 }];
    const segments = 9;
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const jitter = 26 * Math.sin(Math.PI * t);
      points.push({ x: x1 + (x2 - x1) * t + (Math.random() - 0.5) * jitter * 2, y: y1 + (y2 - y1) * t });
    }
    points.push({ x: x2, y: y2 });

    const bolt = this.scene.add.graphics().setDepth(this.depths.air).setBlendMode(Phaser.BlendModes.ADD);
    const draw = (alpha: number) => {
      bolt.clear();
      for (const [width, color, strength] of [[12, tint, 0.35], [5, tint, 0.8], [2, 0xffffff, 1]] as const) {
        bolt.lineStyle(width, color, alpha * strength);
        bolt.beginPath();
        bolt.moveTo(points[0].x, points[0].y);
        for (const point of points.slice(1)) bolt.lineTo(point.x, point.y);
        bolt.strokePath();
      }
      // Um galho saindo do meio, para parecer raio de verdade.
      const mid = points[Math.floor(segments / 2)];
      bolt.lineStyle(2, 0xffffff, alpha * 0.7);
      bolt.beginPath();
      bolt.moveTo(mid.x, mid.y);
      bolt.lineTo(mid.x + (Math.random() - 0.5) * 60, mid.y + 30 + Math.random() * 30);
      bolt.strokePath();
    };
    draw(1);
    const holder = { a: 1 };
    this.scene.tweens.add({
      targets: holder,
      a: 0,
      duration,
      ease: "Quad.easeIn",
      onUpdate: () => draw(holder.a),
      onComplete: () => bolt.destroy(),
    });
  }

  /** Curva de Bézier quadrática: o caminho das almas do Drenar. */
  private static curve(from: Point, via: Point, to: Point, t: number): Point {
    const u = 1 - t;
    return { x: u * u * from.x + 2 * u * t * via.x + t * t * to.x, y: u * u * from.y + 2 * u * t * via.y + t * t * to.y };
  }

  // ---------------------------------------------------------------- poderes

  /** Cura: círculo verde no chão, coluna de luz e brilhos subindo em espiral. */
  heal(at: Point) {
    this.rune(at.x, at.y, 0x5dff9e, 150, 1100);
    this.column(at.x, at.y, 0x7dffb0, 150, 900);
    this.flash(at.x, at.y - 30, 0x9dffc4, 2.2, 420);
    this.burst(at.x, at.y - 10, {
      texture: "fx_flare",
      tints: [0x7dff9b, 0xc8ffd4, 0xffffff],
      count: 18,
      speed: [20, 60],
      angle: [240, 300],
      lifespan: [700, 1200],
      scale: [0.45, 0],
      gravityY: -160,
    });
    this.burst(at.x, at.y - 20, {
      tints: [0x34d399, 0xa7f3d0],
      count: 24,
      speed: [30, 110],
      lifespan: [500, 900],
      scale: [0.35, 0],
      gravityY: -90,
    });
  }

  /** Golpe Giratório: duas lâminas dão a volta no herói, com poeira e faíscas. */
  whirl(at: Point) {
    for (const [index, tint] of [0xfff3c4, 0xffd166].entries()) {
      const slash = this.scene.add
        .image(at.x, at.y - 18, "fx_slash")
        .setTint(tint)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(this.depths.air)
        .setScale(0.9, 0.45)
        .setRotation(index * Math.PI);
      this.scene.tweens.add({
        targets: slash,
        rotation: slash.rotation + Math.PI * 2.2,
        scaleX: 1.15,
        scaleY: 0.58,
        alpha: 0,
        duration: 420,
        ease: "Cubic.easeOut",
        onComplete: () => slash.destroy(),
      });
    }
    this.shockwave(at.x, at.y, 30, 200, 0xffe8a3, 420, 5);
    this.burst(at.x, at.y - 14, {
      texture: "fx_flare",
      tints: [0xffffff, 0xffe08a],
      count: 16,
      speed: [180, 320],
      lifespan: [220, 380],
      scale: [0.35, 0],
    });
    this.burst(at.x, at.y, {
      texture: "fx_smoke",
      tints: [0xcbb89a, 0xa89878],
      count: 10,
      speed: [60, 120],
      lifespan: [500, 800],
      scale: [0.5, 1.1],
      alpha: [0.5, 0],
      blend: Phaser.BlendModes.NORMAL,
      depth: this.depths.ground + 2,
    });
  }

  /**
   * Uma explosão em cada casa atingida, em onda a partir de `origin` (as mais perto primeiro).
   * `speed` é em pixels por milissegundo; `scale` aumenta tudo (Inferno).
   */
  tileBursts(points: Point[], origin: Point, element: BurstElement, options: { speed?: number; scale?: number; jitter?: number } = {}) {
    const speed = options.speed ?? 0.9;
    const scale = options.scale ?? 1;
    for (const point of points) {
      const distance = Math.hypot(point.x - origin.x, (point.y - origin.y) * 2);
      const delay = distance / speed + Math.random() * (options.jitter ?? 60);
      this.scene.time.delayedCall(delay, () => this.tileBurst(point, element, scale));
    }
  }

  private tileBurst(at: Point, element: BurstElement, scale: number) {
    const key = `fxb_${element}_${Math.floor(Math.random() * 3)}`;
    const sprite = this.scene.add
      .sprite(at.x, at.y, key, "0")
      .setOrigin(0.5, BURST_ANCHOR_Y / BURST_H)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(at.y + 40)
      .setScale(scale * (0.95 + Math.random() * 0.3))
      .setAlpha(0.85)
      .setFlipX(Math.random() < 0.5);
    sprite.play(key);
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());
  }

  /** Onda de Fogo: clarão na mão e o leque de chamas se espalhando. */
  wave(caster: Point, points: Point[], element: BurstElement) {
    this.flash(caster.x, caster.y - 30, BURST_TINT[element], 1.6, 240);
    this.tileBursts(points, caster, element, { speed: 1.4, jitter: 30 });
  }

  /** Chuva de Gelo: um orbe voa até o alvo e a área explode em estilhaços. */
  frost(from: Point, to: Point, points: Point[]) {
    const start = { x: from.x, y: from.y - 34 };
    const orb = this.scene.add.image(start.x, start.y, "fx_glow").setTint(0x9fe8ff).setBlendMode(Phaser.BlendModes.ADD).setScale(1.2);
    const heart = this.scene.add.image(start.x, start.y, "fx_flare").setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setScale(0.7);
    for (const part of [orb, heart]) part.setDepth(this.depths.air);
    const distance = Math.hypot(to.x - start.x, to.y - start.y);
    this.scene.tweens.add({
      targets: [orb, heart],
      x: to.x,
      y: to.y - 20,
      duration: Math.min(360, 100 + distance * 0.8),
      ease: "Sine.easeIn",
      onUpdate: () => heart.setRotation(heart.rotation + 0.3),
      onComplete: () => {
        orb.destroy();
        heart.destroy();
        this.flash(to.x, to.y - 18, 0xc9f6ff, 2.6, 300);
        this.shockwave(to.x, to.y, 20, 200, 0x7fd8ff, 480, 5);
        this.tileBursts(points, to, "ice", { speed: 1.1, jitter: 50 });
        this.burst(to.x, to.y - 20, {
          texture: "fx_rock",
          tints: [0xe8fbff, 0x9fe8ff, 0x55c8ff],
          count: 22,
          speed: [140, 320],
          lifespan: [500, 900],
          scale: [0.45, 0.15],
          gravityY: 520,
          rotate: true,
          blend: Phaser.BlendModes.NORMAL,
          angle: [200, 340],
        });
      },
    });
  }

  /** Inferno: clarão que cega, a terra treme, anéis de choque e duas ondas de explosões. */
  inferno(caster: Point, points: Point[], shake: boolean) {
    this.rune(caster.x, caster.y, 0xff7a1a, 520, 1300, -1);
    this.flash(caster.x, caster.y - 30, 0xfff1c1, 5, 420);
    this.flash(caster.x, caster.y - 20, 0xff5a1f, 8, 700, this.depths.ground + 2);
    for (const [delay, size] of [[0, 820], [160, 620], [320, 420]] as const) {
      this.scene.time.delayedCall(delay, () => this.shockwave(caster.x, caster.y, 30, size, 0xff8a2c, 700, 9));
    }
    if (shake) {
      this.scene.cameras.main.shake(520, 0.012);
      this.scene.cameras.main.flash(180, 255, 180, 90, false);
    }
    this.tileBursts(points, caster, "fire", { speed: 0.75, scale: 1.2, jitter: 120 });
    // Segunda onda: menos casas, depois da primeira.
    const second = points.filter(() => Math.random() < 0.45);
    this.scene.time.delayedCall(520, () => this.tileBursts(second, caster, "fire", { speed: 1.2, scale: 0.9, jitter: 200 }));
  }

  /** Disparo de besta: um virote rápido com um risco de luz atrás. */
  arrow(from: Point, to: Point) {
    const start = { x: from.x, y: from.y - 30 };
    const end = { x: to.x, y: to.y - 24 };
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const shaft = this.scene.add.rectangle(start.x, start.y, 20, 3, 0xe8d8b8).setRotation(angle).setDepth(this.depths.air);
    const tip = this.scene.add.image(start.x, start.y, "fx_glow").setTint(0xfff1c1).setBlendMode(Phaser.BlendModes.ADD).setScale(0.35);
    tip.setDepth(this.depths.air);
    this.scene.tweens.add({
      targets: [shaft, tip],
      x: end.x,
      y: end.y,
      duration: Math.min(260, 60 + distance * 0.55),
      ease: "Linear",
      onComplete: () => {
        shaft.destroy();
        tip.destroy();
        this.burst(end.x, end.y, { tints: [0xfff1c1, 0xd8c8a8], count: 8, speed: [60, 140], lifespan: [120, 260], scale: [0.3, 0] });
      },
    });
  }

  /** Raio Flamejante: bola de fogo com rastro que voa até o alvo e explode. */
  fireball(from: Point, to: Point, onImpact?: () => void) {
    const start = { x: from.x, y: from.y - 34 };
    const end = { x: to.x, y: to.y - 22 };
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const duration = Math.min(420, 120 + distance * 0.9);

    // Três camadas: halo laranja largo, núcleo quente e uma estrela branca girando no meio.
    const halo = this.scene.add.image(start.x, start.y, "fx_glow").setTint(0xff5a1f).setBlendMode(Phaser.BlendModes.ADD).setScale(1.9).setAlpha(0.55);
    const core = this.scene.add.image(start.x, start.y, "fx_glow").setTint(0xffb347).setBlendMode(Phaser.BlendModes.ADD).setScale(1.05);
    const heart = this.scene.add.image(start.x, start.y, "fx_flare").setTint(0xfff1c1).setBlendMode(Phaser.BlendModes.ADD).setScale(0.8);
    for (const part of [halo, core, heart]) part.setDepth(this.depths.air);
    const trail = this.scene.add.particles(0, 0, "fx_glow", {
      speed: { min: 5, max: 40 },
      lifespan: { min: 260, max: 520 },
      scale: { start: 0.65, end: 0 },
      alpha: { start: 0.95, end: 0 },
      tint: [0xff7b2c, 0xffd166, 0xff4d1a],
      blendMode: Phaser.BlendModes.ADD,
      frequency: 8,
      quantity: 3,
    });
    trail.setDepth(this.depths.air - 1);
    trail.startFollow(core);

    this.flash(start.x, start.y, 0xffa53c, 1.2, 200);
    this.scene.tweens.add({
      targets: [halo, core, heart],
      x: end.x,
      y: end.y,
      duration,
      ease: "Sine.easeIn",
      onUpdate: () => heart.setRotation(heart.rotation + 0.35),
      onComplete: () => {
        halo.destroy();
        core.destroy();
        heart.destroy();
        trail.stop();
        this.scene.time.delayedCall(450, () => trail.destroy());
        this.explosion(end.x, end.y, to);
        onImpact?.();
      },
    });
  }

  private explosion(x: number, y: number, ground: Point) {
    this.flash(x, y, 0xffd27a, 3, 320);
    this.flash(x, y, 0xffffff, 1.4, 160);
    this.shockwave(ground.x, ground.y, 20, 130, 0xff9a3c, 420, 5);
    this.scorch(ground.x, ground.y, 0.9);
    this.burst(x, y, {
      tints: [0xffd166, 0xff7b2c, 0xff4d1a, 0xffffff],
      count: 34,
      speed: [80, 260],
      lifespan: [350, 700],
      scale: [0.5, 0],
      gravityY: -60,
    });
    this.burst(x, y, {
      texture: "fx_flare",
      tints: [0xffffff, 0xffe08a],
      count: 8,
      speed: [150, 300],
      lifespan: [200, 360],
      scale: [0.4, 0],
    });
    this.burst(x, y - 10, {
      texture: "fx_smoke",
      tints: [0x5a4a44, 0x3a302c, 0x7a6a60],
      count: 10,
      speed: [20, 70],
      angle: [200, 340],
      lifespan: [700, 1200],
      scale: [0.4, 1.2],
      alpha: [0.55, 0],
      gravityY: -40,
      blend: Phaser.BlendModes.NORMAL,
    });
  }

  /** Drenar Vida: vórtice roxo no alvo e almas voando em curva até o herói. */
  drain(caster: Point, target: Point) {
    this.rune(target.x, target.y, 0xa78bfa, 110, 1000, -1.4);
    this.flash(target.x, target.y - 24, 0x7c3aed, 1.8, 500);
    const start = { x: target.x, y: target.y - 26 };
    const end = { x: caster.x, y: caster.y - 30 };

    for (let i = 0; i < 7; i++) {
      const side = (i % 2 === 0 ? 1 : -1) * (40 + Math.random() * 60);
      const via = { x: (start.x + end.x) / 2 + side, y: Math.min(start.y, end.y) - 40 - Math.random() * 60 };
      const orb = this.scene.add
        .image(start.x, start.y, "fx_glow")
        .setTint(i % 3 === 0 ? 0xe9d5ff : 0xa78bfa)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(this.depths.air)
        .setScale(0.35);
      const holder = { t: 0 };
      this.scene.tweens.add({
        targets: holder,
        t: 1,
        delay: i * 70,
        duration: 520,
        ease: "Sine.easeInOut",
        onUpdate: () => {
          const point = SpellFx.curve(start, via, end, holder.t);
          orb.setPosition(point.x, point.y);
          orb.setScale(0.25 + 0.2 * Math.sin(Math.PI * holder.t));
        },
        onComplete: () => orb.destroy(),
      });
    }

    this.scene.time.delayedCall(520, () => {
      this.flash(end.x, end.y, 0xc4b5fd, 2, 380);
      this.burst(end.x, end.y, {
        tints: [0xa78bfa, 0x86efac, 0xffffff],
        count: 18,
        speed: [30, 90],
        lifespan: [400, 700],
        scale: [0.3, 0],
        gravityY: -120,
      });
    });
  }

  /** Tremor: o chão racha, levanta pedra e poeira, e duas ondas se espalham. */
  quake(at: Point, shake: boolean) {
    const cracks = this.scene.add.graphics({ x: at.x, y: at.y }).setDepth(this.depths.ground + 1);
    const branches: Point[][] = [];
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
      const path: Point[] = [{ x: 0, y: 0 }];
      let length = 0;
      const reach = 70 + Math.random() * 70;
      while (length < reach) {
        length += 12 + Math.random() * 10;
        const wobble = angle + (Math.random() - 0.5) * 0.6;
        path.push({ x: Math.cos(wobble) * length, y: Math.sin(wobble) * length * 0.5 });
      }
      branches.push(path);
    }
    const holder = { t: 0 };
    this.scene.tweens.add({
      targets: holder,
      t: 1,
      duration: 1500,
      onUpdate: () => {
        // As rachaduras correm para fora no começo e depois esfriam e somem.
        const grow = Math.min(1, holder.t / 0.18);
        const fade = holder.t < 0.55 ? 1 : 1 - (holder.t - 0.55) / 0.45;
        cracks.clear();
        for (const path of branches) {
          const visible = Math.max(2, Math.ceil(path.length * grow));
          for (const [width, color, strength] of [[5, 0x2a1a10, 0.85], [2, 0xff9a3c, 0.9 * (1 - holder.t)]] as const) {
            cracks.lineStyle(width, color, strength * fade);
            cracks.beginPath();
            cracks.moveTo(path[0].x, path[0].y);
            for (const point of path.slice(1, visible)) cracks.lineTo(point.x, point.y);
            cracks.strokePath();
          }
        }
      },
      onComplete: () => cracks.destroy(),
    });

    this.shockwave(at.x, at.y, 40, 380, 0xffb057, 650, 8);
    this.scene.time.delayedCall(140, () => this.shockwave(at.x, at.y, 30, 260, 0xffe3b0, 520, 5));
    this.burst(at.x, at.y, {
      texture: "fx_rock",
      tints: [0x8a6a4a, 0x6a5038, 0xa89070],
      count: 36,
      speed: [140, 300],
      angle: [200, 340],
      lifespan: [700, 1000],
      scale: [1.2, 0.6],
      alpha: [1, 0.8],
      gravityY: 620,
      rotate: true,
      blend: Phaser.BlendModes.NORMAL,
    });
    this.burst(at.x, at.y, {
      texture: "fx_smoke",
      tints: [0xb99a72, 0x8a7458, 0xd9c7a8],
      count: 18,
      speed: [60, 160],
      lifespan: [800, 1300],
      scale: [0.6, 1.8],
      alpha: [0.6, 0],
      blend: Phaser.BlendModes.NORMAL,
      depth: this.depths.ground + 2,
    });
    if (shake) this.scene.cameras.main.shake(380, 0.009);
  }

  /** Tempestade: o céu escurece, nuvens juntam e raios caem em volta. */
  storm(at: Point, radius: number, shake: boolean) {
    const camera = this.scene.cameras.main;
    const dark = this.scene.add
      .rectangle(0, 0, camera.width, camera.height, 0x0a1030)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(this.depths.air - 2)
      .setAlpha(0);
    this.scene.tweens.add({ targets: dark, alpha: 0.32, duration: 200, yoyo: true, hold: 700, onComplete: () => dark.destroy() });

    this.rune(at.x, at.y, 0x8ec5ff, radius * 2.4, 1200, 0.6);
    this.burst(at.x, at.y - 230, {
      texture: "fx_smoke",
      tints: [0x2a2f45, 0x3c4260, 0x1e2233],
      count: 14,
      speed: [10, 50],
      lifespan: [900, 1300],
      scale: [1.2, 2.2],
      alpha: [0.8, 0],
      blend: Phaser.BlendModes.NORMAL,
    });

    const strikes = 7;
    for (let i = 0; i < strikes; i++) {
      this.scene.time.delayedCall(120 + i * 95, () => {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.sqrt(Math.random()) * radius;
        const hit = { x: at.x + Math.cos(angle) * distance, y: at.y + Math.sin(angle) * distance * 0.5 };
        this.lightning(hit.x + (Math.random() - 0.5) * 40, hit.y - 320, hit.x, hit.y, 0x9fd0ff);
        this.flash(hit.x, hit.y - 6, 0xbfe0ff, 1.6, 220);
        this.scorch(hit.x, hit.y, 0.6);
        this.burst(hit.x, hit.y, {
          texture: "fx_flare",
          tints: [0xffffff, 0x8ec5ff],
          count: 8,
          speed: [80, 220],
          lifespan: [180, 360],
          scale: [0.35, 0],
        });
        if (i === 0 || i === strikes - 1) this.flashScreen();
      });
    }
    if (shake) camera.shake(700, 0.006);
  }

  /** Clarão branco na tela inteira, bem rápido. */
  private flashScreen() {
    const camera = this.scene.cameras.main;
    const light = this.scene.add
      .rectangle(0, 0, camera.width, camera.height, 0xdfeaff)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(this.depths.air + 1)
      .setAlpha(0.35);
    this.scene.tweens.add({ targets: light, alpha: 0, duration: 140, onComplete: () => light.destroy() });
  }
}
