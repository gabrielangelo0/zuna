import Phaser from "phaser";
import {
  CORPSE_MS,
  DIRS,
  MONSTERS,
  appearanceOf,
  bakedDirFor,
  chebyshev,
  frameKey,
  frontKey,
  type AnimName,
  type Appearance,
  type MonsterData,
  type PlayerData,
  type SpriteFrameMeta,
} from "@zuna/shared";
import { Bubble } from "./bubble.ts";
import { GAME_FONT } from "./canvas.ts";
import { tileToScreen } from "./iso.ts";
import { animDuration, appearanceKey, frameAt, type SpriteTexture, type SpriteTextures } from "./sprites.ts";

export const DEPTH_OVERLAY = 900_000;

const TEXT_RESOLUTION = Math.min(2, window.devicePixelRatio || 1);
/** Depois do último passo, continua "andando" um pouco: evita piscar parado entre dois passos. */
const MOVE_GRACE_MS = 90;
const SPAWN_FADE_MS = 250;
const CORPSE_FADE_MS = 1200;

/** Direções da tela de cada índice de DIRS, para virar o mascote para onde ele anda. */
const SCREEN_DIRS = DIRS.map((dir) => {
  const screen = tileToScreen(dir.x, dir.y);
  const length = Math.hypot(screen.x, screen.y);
  return { x: screen.x / length, y: screen.y / length };
});

function screenDirIndex(dx: number, dy: number): number {
  let best = 0;
  let bestDot = -Infinity;
  SCREEN_DIRS.forEach((dir, index) => {
    const dot = dir.x * dx + dir.y * dy;
    if (dot > bestDot) {
      bestDot = dot;
      best = index;
    }
  });
  return best;
}

/** Um sprite do Phaser ligado a uma folha que pode ser trocada (visual, montaria, mascote). */
class Layer {
  sprite: Phaser.GameObjects.Sprite | null = null;
  texture: SpriteTexture | null = null;
  private wanted = "";
  private owned = false;
  private destroyed = false;
  private lastFrame: SpriteFrameMeta | null = null;
  private lastFlip = false;
  private readonly scene: Phaser.Scene;
  private readonly textures: SpriteTextures;

  constructor(scene: Phaser.Scene, textures: SpriteTextures) {
    this.scene = scene;
    this.textures = textures;
  }

  /** Troca a folha (carrega em segundo plano; até lá, mostra a anterior). `id` vazio remove. */
  set(id: string, appearance?: Appearance) {
    const signature = id ? `${id}|${appearance ? appearanceKey(appearance) : ""}` : "";
    if (signature === this.wanted) return;
    this.wanted = signature;
    if (!id) {
      this.use(null, false);
      return;
    }
    this.textures
      .acquire(id, appearance)
      .then((texture) => {
        if (this.destroyed || this.wanted !== signature) {
          this.textures.release(texture.key);
          return;
        }
        this.use(texture, true);
      })
      .catch((error: unknown) => console.error(error));
  }

  /** Usa a folha de outra camada (a frente da montaria desenha com a folha da montaria). */
  share(texture: SpriteTexture | null) {
    if (texture?.key !== this.texture?.key) this.use(texture, false);
  }

  private use(texture: SpriteTexture | null, owned: boolean) {
    if (this.texture && this.owned) this.textures.release(this.texture.key);
    this.texture = texture;
    this.owned = owned;
    this.lastFrame = null;
    if (!texture) {
      this.sprite?.destroy();
      this.sprite = null;
      return;
    }
    const first = Object.keys(texture.meta.frames)[0];
    if (this.sprite) this.sprite.setTexture(texture.key, first);
    else this.sprite = this.scene.add.sprite(0, 0, texture.key, first).setVisible(false);
    this.sprite.setOrigin(texture.meta.anchorX / texture.meta.cellW, texture.meta.anchorY / texture.meta.cellH);
  }

  /** Mostra um quadro com o pé em (x, y). Devolve o quadro (com o ponto de encaixe, se houver). */
  show(key: string, x: number, y: number, depth: number, flip: boolean, alpha: number): SpriteFrameMeta | undefined {
    const sprite = this.sprite;
    const frame = this.texture?.meta.frames[key];
    if (!sprite || !frame) {
      sprite?.setVisible(false);
      return undefined;
    }
    if (sprite.frame.name !== key) sprite.setFrame(key);
    sprite.setPosition(x, y).setDepth(depth).setFlipX(flip).setAlpha(alpha).setVisible(true);
    this.lastFrame = frame;
    this.lastFlip = flip;
    return frame;
  }

  hide() {
    this.sprite?.setVisible(false);
  }

  /** Retângulo do desenho visível (o recorte do quadro, não a célula inteira). */
  bounds(): Phaser.Geom.Rectangle | null {
    const sprite = this.sprite;
    const meta = this.texture?.meta;
    const frame = this.lastFrame;
    if (!sprite?.visible || !meta || !frame) return null;
    // O espelho do Phaser é em torno do centro da célula, que é onde fica o pé.
    const left = this.lastFlip ? sprite.x + meta.anchorX - frame.dx - frame.w : sprite.x - meta.anchorX + frame.dx;
    return new Phaser.Geom.Rectangle(left, sprite.y - meta.anchorY + frame.dy, frame.w, frame.h);
  }

  flash(on: boolean) {
    if (!this.sprite) return;
    if (on) this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else this.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
  }

  destroy() {
    this.destroyed = true;
    this.use(null, false);
  }
}

interface Action {
  anim: AnimName;
  start: number;
  until: number;
}

/** Um personagem ou monstro no mundo: sprites animados, nome, vida e mascote. */
export class Actor {
  readonly id: string;
  readonly isPlayer: boolean;
  readonly data: PlayerData | MonsterData;
  /** Topo da cabeça na tela (para textos e efeitos). */
  headY = 0;
  private bubble: Bubble | null = null;
  dead = false;

  private readonly scene: Phaser.Scene;
  private readonly body: Layer;
  private readonly mount: Layer;
  private readonly front: Layer;
  private readonly pet: Layer;
  private readonly label: Phaser.GameObjects.Text;
  private readonly hpBar: Phaser.GameObjects.Graphics;
  private readonly phase = Math.random() * 2000;
  private readonly spawnedAt: number;

  tileX: number;
  tileY: number;
  private fromX: number;
  private fromY: number;
  private toX: number;
  private toY: number;
  private moveStart = 0;
  private moveDuration = 0;
  private action: Action | null = null;
  private deathStart = 0;
  private corpseSince: number | null = null;
  private hitAt = -Infinity;
  private lastHp = -1;
  private lastMaxHp = -1;

  private petX = 0;
  private petY = 0;
  private petDir = 1;
  private petPlaced = false;

  constructor(scene: Phaser.Scene, textures: SpriteTextures, id: string, data: PlayerData | MonsterData, isPlayer: boolean) {
    this.scene = scene;
    this.id = id;
    this.data = data;
    this.isPlayer = isPlayer;
    this.spawnedAt = scene.time.now;
    this.body = new Layer(scene, textures);
    this.mount = new Layer(scene, textures);
    this.front = new Layer(scene, textures);
    this.pet = new Layer(scene, textures);

    const { x, y } = tileToScreen(data.x, data.y);
    this.tileX = data.x;
    this.tileY = data.y;
    this.fromX = this.toX = x;
    this.fromY = this.toY = y;

    const name = isPlayer ? (data as PlayerData).name : MONSTERS[(data as MonsterData).kind].name;
    this.label = scene.add
      .text(x, y, name, {
        fontFamily: GAME_FONT,
        fontSize: "12px",
        fontStyle: "bold",
        color: "#4ade80",
        stroke: "#000000",
        strokeThickness: 3,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_OVERLAY);
    this.hpBar = scene.add.graphics().setDepth(DEPTH_OVERLAY);

    if (!isPlayer) this.body.set(`monster_${(data as MonsterData).kind}`);
    this.sync();
  }

  /** Mostra a fala do jogador acima da cabeça. */
  say(text: string, now: number) {
    this.bubble ??= new Bubble(this.scene, DEPTH_OVERLAY + 2);
    this.bubble.say(text, now);
  }

  get riding(): boolean {
    const player = this.data as PlayerData;
    return this.isPlayer && player.mounted && player.mount !== "";
  }

  /** Chamado quando o estado vindo do servidor muda. */
  sync() {
    const data = this.data;
    const now = this.scene.time.now;
    if (data.x !== this.tileX || data.y !== this.tileY) {
      const to = tileToScreen(data.x, data.y);
      const teleport = chebyshev(this.tileX, this.tileY, data.x, data.y) > 2;
      const from = teleport ? to : this.position(now);
      this.fromX = from.x;
      this.fromY = from.y;
      this.toX = to.x;
      this.toY = to.y;
      this.moveStart = now;
      this.moveDuration = teleport ? 0 : data.stepMs;
      this.tileX = data.x;
      this.tileY = data.y;
      if (teleport) this.petPlaced = false;
    }

    if (this.isPlayer) {
      const player = data as PlayerData;
      this.body.set(`outfit_${player.outfit}`, appearanceOf(player));
      this.mount.set(this.riding ? `mount_${player.mount}` : "");
      this.pet.set(player.pet ? `pet_${player.pet}` : "");
    }

    if (data.hp !== this.lastHp || data.maxHp !== this.lastMaxHp) {
      this.lastHp = data.hp;
      this.lastMaxHp = data.maxHp;
      this.drawHpBar();
    }
  }

  position(now: number): { x: number; y: number } {
    if (this.moveDuration <= 0) return { x: this.toX, y: this.toY };
    const t = Phaser.Math.Clamp((now - this.moveStart) / this.moveDuration, 0, 1);
    return { x: this.fromX + (this.toX - this.fromX) * t, y: this.fromY + (this.toY - this.fromY) * t };
  }

  /** Toca uma animação uma vez (golpe, magia, dano) e volta para andar/parado. */
  play(anim: AnimName, now: number) {
    const meta = this.body.texture?.meta;
    if (this.dead || !meta?.anims[anim] || this.riding) return;
    // Levar dano não interrompe um golpe.
    if (anim === "hit" && this.action && this.action.anim !== "hit") return;
    this.action = { anim, start: now, until: now + animDuration(meta, anim) };
  }

  hurt(now: number) {
    this.hitAt = now;
    this.play("hit", now);
    for (const layer of [this.body, this.mount]) layer.flash(true);
    this.scene.time.delayedCall(70, () => {
      for (const layer of [this.body, this.mount]) layer.flash(false);
    });
  }

  die(now: number) {
    this.dead = true;
    this.deathStart = now;
    this.action = null;
    this.label.setVisible(false);
    this.hpBar.setVisible(false);
  }

  /** O monstro saiu do estado: o corpo fica no chão por um tempo e depois some. */
  becomeCorpse(now: number) {
    this.corpseSince = now;
    this.label.setVisible(false);
    this.hpBar.setVisible(false);
    this.pet.hide();
  }

  /** Corpo que já sumiu por completo. */
  finished(now: number): boolean {
    return this.corpseSince !== null && now > this.corpseSince + CORPSE_MS + CORPSE_FADE_MS;
  }

  bounds(): Phaser.Geom.Rectangle | null {
    return this.body.bounds();
  }

  update(time: number, delta: number) {
    const { x, y } = this.position(time);
    const moving = time < this.moveStart + this.moveDuration + MOVE_GRACE_MS;
    const facing = bakedDirFor(this.data.dir);
    const alpha = this.alpha(time);
    const shake = time - this.hitAt < 120 ? (Math.random() - 0.5) * 4 : 0;
    if (this.action && time >= this.action.until) this.action = null;

    const bodyMeta = this.body.texture?.meta;
    const mountMeta = this.mount.texture?.meta;
    let top = y - (bodyMeta?.headHeight ?? 80);

    if (this.riding && bodyMeta && mountMeta) {
      const mountKey = frameAt(mountMeta, moving ? "walk" : "idle", facing.dir, time + this.phase)!;
      const mountFrame = this.mount.show(mountKey, x + shake, y, y + 1, facing.flip, alpha);
      const riderKey = frameKey("ride", facing.dir, 0);
      const riderFrame = bodyMeta.frames[riderKey];
      if (mountFrame?.sx !== undefined && mountFrame.sy !== undefined && riderFrame?.sx !== undefined && riderFrame.sy !== undefined) {
        const sign = facing.flip ? -1 : 1;
        const riderX = x + shake + sign * (mountFrame.sx - riderFrame.sx);
        const riderY = y + mountFrame.sy - riderFrame.sy;
        this.body.show(riderKey, riderX, riderY, y + 1.5, facing.flip, alpha);
        top = Math.min(riderY - bodyMeta.headHeight + 14, y - mountMeta.headHeight);
      } else {
        this.body.hide();
      }
      this.front.share(this.mount.texture);
      const front = frontKey(mountKey);
      if (mountMeta.frames[front]) this.front.show(front, x + shake, y, y + 2, facing.flip, alpha);
      else this.front.hide();
    } else {
      this.mount.hide();
      this.front.hide();
      if (bodyMeta) {
        const anim: AnimName = this.dead ? "death" : this.action?.anim ?? (moving ? "walk" : "idle");
        const elapsed = this.dead ? time - this.deathStart : this.action ? time - this.action.start : time + this.phase;
        const key = frameAt(bodyMeta, anim, facing.dir, elapsed) ?? frameAt(bodyMeta, "idle", facing.dir, time);
        // Corpos ficam por baixo de quem está vivo.
        if (key) this.body.show(key, x + shake, y, this.dead ? y - 30 : y + 1, facing.flip, alpha);
      }
    }

    this.headY = top;
    this.bubble?.update(x, top - 21, time, alpha);
    this.label.setPosition(x, top - 7).setAlpha(alpha);
    this.hpBar.setPosition(x, top - 5).setAlpha(alpha);
    if (this.isPlayer) this.updatePet(x, y, time, delta, alpha);
  }

  destroy() {
    for (const layer of [this.body, this.mount, this.front, this.pet]) layer.destroy();
    this.label.destroy();
    this.hpBar.destroy();
    this.bubble?.destroy();
  }

  private alpha(time: number): number {
    if (this.corpseSince !== null) {
      const fading = time - (this.corpseSince + CORPSE_MS);
      return fading <= 0 ? 1 : Math.max(0, 1 - fading / CORPSE_FADE_MS);
    }
    return Math.min(1, (time - this.spawnedAt) / SPAWN_FADE_MS);
  }

  /**
   * O mascote segue o dono com atraso, ao lado dele e um pouco mais "para dentro" da tela,
   * para nunca ficar entre o dono e a câmera. Fica do lado oposto ao que o dono olha.
   */
  private updatePet(x: number, y: number, time: number, delta: number, alpha: number) {
    const player = this.data as PlayerData;
    const meta = this.pet.texture?.meta;
    if (!player.pet || !meta) {
      this.pet.hide();
      return;
    }
    const facing = DIRS[player.dir] ?? DIRS[1];
    const side = tileToScreen(facing.x, facing.y).x > 0 ? -1 : 1;
    const targetX = x + side * (this.riding ? 50 : 32);
    const targetY = y - (this.riding ? 14 : 10);
    if (!this.petPlaced || Math.hypot(targetX - this.petX, targetY - this.petY) > 240) {
      this.petX = targetX;
      this.petY = targetY;
      this.petPlaced = true;
    }

    const follow = 1 - Math.exp(-delta / 150);
    const dx = (targetX - this.petX) * follow;
    const dy = (targetY - this.petY) * follow;
    this.petX += dx;
    this.petY += dy;
    const speed = (Math.hypot(dx, dy) / Math.max(1, delta)) * 1000;
    const moving = speed > 12;
    if (moving) this.petDir = screenDirIndex(dx, dy);
    const petFacing = bakedDirFor(this.petDir);
    const key = frameAt(meta, moving ? "walk" : "idle", petFacing.dir, time + this.phase);
    if (key) this.pet.show(key, this.petX, this.petY, this.petY + 1, petFacing.flip, alpha);
  }

  private drawHpBar() {
    const ratio = this.lastMaxHp > 0 ? Phaser.Math.Clamp(this.lastHp / this.lastMaxHp, 0, 1) : 0;
    const color = ratio > 0.6 ? 0x4ade80 : ratio > 0.3 ? 0xfacc15 : 0xef4444;
    const width = 30;
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.75);
    this.hpBar.fillRect(-width / 2 - 1, -1, width + 2, 6);
    this.hpBar.fillStyle(color, 1);
    this.hpBar.fillRect(-width / 2, 0, Math.max(1, width * ratio), 4);
    this.label.setColor(`#${color.toString(16).padStart(6, "0")}`);
  }
}
