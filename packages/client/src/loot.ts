import Phaser from "phaser";
import { LOOT, RARITY, frameKey, gearItem, lootSpriteId, type LootData, type LootRarity } from "@zuna/shared";
import { ITEM_TEXTURE, ensureItemTexture } from "./itemIcons.ts";
import { tileToScreen } from "./iso.ts";
import type { SpriteTextures } from "./sprites.ts";

// Drops no chão: moedas, baús, cristais e equipamentos, com brilho e balanço por raridade.

/** Tamanho do ícone de equipamento no chão (o atlas tem 112 px por ícone). */
const ITEM_SCALE = 0.44;

/** Os drops ficam por baixo de quem anda por cima deles. */
const DEPTH_OFFSET = -24;

interface Piece {
  data: LootData;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image | null;
  /** Fase do balanço, para os drops não subirem e descerem todos juntos. */
  phase: number;
  baseY: number;
  /** Quanto balança e a cor no minimapa. */
  rarity: LootRarity;
  color: number;
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
    if (data.kind === "item") return this.createItem(id, data);
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

    this.pieces.set(id, { data, sprite, glow, phase: Math.random() * Math.PI * 2, baseY: screen.y, rarity: def.rarity, color: def.color });
    // Cai no chão com um pulinho.
    sprite.setScale(0.4);
    this.scene.tweens.add({ targets: sprite, scale: 1, duration: 260, ease: "Back.easeOut" });
  }

  /** Equipamento: o ícone do item em pé no chão, com o brilho da cor da raridade. */
  private async createItem(id: string, data: LootData) {
    const item = gearItem(data.item);
    if (!item || !(await ensureItemTexture(this.scene)) || this.cancelled.has(id)) return;
    const rarity = RARITY[item.rarity];
    const screen = tileToScreen(data.x, data.y);
    const baseY = screen.y - 8;
    const glow = this.scene.add
      .image(screen.x, baseY, "spark")
      .setTint(rarity.color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(item.rarity === "lendario" ? 5 : item.rarity === "comum" ? 2.6 : 3.6)
      .setAlpha(0.5)
      .setDepth(screen.y + DEPTH_OFFSET - 1);
    const sprite = this.scene.add
      .image(screen.x, baseY, ITEM_TEXTURE, item.icon)
      .setOrigin(0.5, 0.62)
      .setDepth(screen.y + DEPTH_OFFSET);
    const bob: LootRarity = item.rarity === "lendario" || item.rarity === "epico" ? "lendario" : "raro";
    this.pieces.set(id, { data, sprite, glow, phase: Math.random() * Math.PI * 2, baseY, rarity: bob, color: rarity.color });
    sprite.setScale(ITEM_SCALE * 0.4);
    this.scene.tweens.add({ targets: sprite, scale: ITEM_SCALE, duration: 300, ease: "Back.easeOut" });
  }

  /** Tira tudo da tela de uma vez (troca de mundo). */
  clear() {
    for (const [id, piece] of this.pieces) {
      this.cancelled.add(id);
      piece.glow?.destroy();
      piece.sprite.destroy();
    }
    this.pieces.clear();
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
      color: piece.color,
      size: piece.rarity === "comum" ? 2 : 3,
    }));
  }

  update(time: number) {
    for (const piece of this.pieces.values()) {
      const wave = Math.sin(time / 420 + piece.phase);
      if (piece.rarity === "lendario") {
        piece.sprite.y = piece.baseY + wave * 3 - 4;
        piece.sprite.rotation = wave * 0.06;
      } else if (piece.rarity === "raro") {
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
