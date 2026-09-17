import Phaser from "phaser";
import { LOOT, frameKey, lootSpriteId, type LootData } from "@zuna/shared";
import { tileToScreen } from "./iso.ts";
import type { SpriteTextures } from "./sprites.ts";

// Drops no chão: moedas, baús e cristais, com brilho e balanço por raridade.

/** Os drops ficam por baixo de quem anda por cima deles. */
const DEPTH_OFFSET = -24;

interface Piece {
  data: LootData;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image | null;
  /** Fase do balanço, para os drops não subirem e descerem todos juntos. */
  phase: number;
  baseY: number;
}

export class LootLayer {
  private readonly scene: Phaser.Scene;
  private readonly textures: SpriteTextures;
  private readonly pieces = new Map<string, Piece>();
  /** Ids que sumiram antes de o sprite terminar de carregar. */
  private readonly cancelled = new Set<string>();

  constructor(scene: Phaser.Scene, textures: SpriteTextures) {
    this.scene = scene;
    this.textures = textures;
  }

  add(id: string, data: LootData) {
    if (this.pieces.has(id)) return;
    this.cancelled.delete(id);
    void this.create(id, data);
  }

  private async create(id: string, data: LootData) {
    const def = LOOT[data.kind];
    const texture = await this.textures.acquire(lootSpriteId(data.kind)).catch(() => null);
    if (!texture || this.cancelled.has(id)) return;
    const { meta } = texture;

    const screen = tileToScreen(data.x, data.y);
    // Moedas têm variações: quanto mais ouro, maior a pilha.
    const variants = meta.anims.idle?.frames ?? 1;
    const size = data.gold >= 60 ? 2 : data.gold >= 20 ? 1 : 0;
    const variant = variants >= 6 ? Math.min(variants - 1, size * 2 + ((data.x + data.y) % 2)) : 0;

    const sprite = this.scene.add
      .image(screen.x, screen.y, texture.key, frameKey("idle", "S", variant))
      .setOrigin(meta.anchorX / meta.cellW, meta.anchorY / meta.cellH)
      .setDepth(screen.y + DEPTH_OFFSET);

    let glow: Phaser.GameObjects.Image | null = null;
    if (def.rarity !== "comum") {
      glow = this.scene.add
        .image(screen.x, screen.y - 6, "spark")
        .setTint(def.color)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(def.rarity === "lendario" ? 4.5 : 3.2)
        .setAlpha(0.5)
        .setDepth(screen.y + DEPTH_OFFSET - 1);
    }

    this.pieces.set(id, { data, sprite, glow, phase: Math.random() * Math.PI * 2, baseY: screen.y });
    // Cai no chão com um pulinho.
    sprite.setScale(0.4);
    this.scene.tweens.add({ targets: sprite, scale: 1, duration: 260, ease: "Back.easeOut" });
  }

  remove(id: string) {
    this.cancelled.add(id);
    const piece = this.pieces.get(id);
    if (!piece) return;
    this.pieces.delete(id);
    piece.glow?.destroy();
    this.scene.tweens.add({
      targets: piece.sprite,
      alpha: 0,
      y: piece.baseY - 14,
      scale: 0.6,
      duration: 220,
      onComplete: () => piece.sprite.destroy(),
    });
  }

  /** Pontos para o minimapa. */
  blips(): { x: number; y: number; color: number; size: number }[] {
    return [...this.pieces.values()].map((piece) => ({
      x: piece.data.x,
      y: piece.data.y,
      color: LOOT[piece.data.kind].color,
      size: LOOT[piece.data.kind].rarity === "comum" ? 2 : 3,
    }));
  }

  update(time: number) {
    for (const piece of this.pieces.values()) {
      const def = LOOT[piece.data.kind];
      const wave = Math.sin(time / 420 + piece.phase);
      if (def.rarity === "lendario") {
        piece.sprite.y = piece.baseY + wave * 3 - 4;
        piece.sprite.rotation = wave * 0.06;
      } else if (def.rarity === "raro") {
        piece.sprite.y = piece.baseY + wave * 1.5;
      }
      if (piece.glow) {
        piece.glow.setAlpha(0.35 + (wave + 1) * 0.12);
        piece.glow.y = piece.sprite.y - 6;
      }
    }
  }

  destroy() {
    for (const piece of this.pieces.values()) {
      piece.sprite.destroy();
      piece.glow?.destroy();
    }
    this.pieces.clear();
  }
}
