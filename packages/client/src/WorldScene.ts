import Phaser from "phaser";
import { Callbacks, type Room } from "@colyseus/sdk";
import {
  ClientMsg,
  Ground,
  LOOT,
  MONSTERS,
  Obj,
  SPELLS,
  ServerMsg,
  spellUnlocked,
  spellsUnlockedAt,
  TEMPLE_X,
  TEMPLE_Y,
  catalogItem,
  chebyshev,
  frameKey,
  generateMap,
  type AnnounceEvent,
  type ChatEvent,
  type HitEvent,
  type LevelUpEvent,
  type LootData,
  type LootEvent,
  type MonsterData,
  type MonsterDeathEvent,
  type MonsterKind,
  type PlayerData,
  type PlayerDeathEvent,
  type ProfileEvent,
  type PurchaseEvent,
  type SpellEffectEvent,
  type SpellId,
  type XpEvent,
} from "@zuna/shared";
import { Actor } from "./actors.ts";
import { GAME_FONT } from "./canvas.ts";
import { element } from "./dom.ts";
import { Hud } from "./hud.ts";
import { screenToTile, tileToScreen } from "./iso.ts";
import { LootLayer } from "./loot.ts";
import { Minimap } from "./minimap.ts";
import { Ranking } from "./ranking.ts";
import { KeyboardInput } from "./keyboard.ts";
import { SpriteTextures, loadSheet } from "./sprites.ts";
import { GROUND_FRAMES, TILE_CELL_H, TILE_CELL_W, createTextures, type GroundFrameName } from "./textures.ts";
import { Wardrobe } from "./wardrobe.ts";

// Profundidade: chão < decalques (flores, marcadores) < cenário e personagens (ordenados por Y) < nomes < textos.
const DEPTH_GROUND = -1_000_000;
const DEPTH_DECAL = -900_000;
const DEPTH_FLOATING = 950_000;

/** Código de saída enviado pelo servidor quando o mesmo personagem entra em outra janela. */
const CLOSE_REPLACED = 4001;

const TEXT_RESOLUTION = Math.min(2, window.devicePixelRatio || 1);

const GROUND_FRAME: Record<Ground, GroundFrameName> = {
  [Ground.Grass]: "grass",
  [Ground.GrassDark]: "grassDark",
  [Ground.Dirt]: "dirt",
  [Ground.Sand]: "sand",
  [Ground.Water]: "water",
  [Ground.Stone]: "stone",
};

/** Sprite de cenário para cada objeto do mapa. As flores ficam rentes ao chão, por baixo de tudo. */
const OBJECT_PROPS: Partial<Record<Obj, { id: string; decal?: boolean; flip?: boolean }>> = {
  [Obj.Tree]: { id: "prop_tree", flip: true },
  [Obj.Pine]: { id: "prop_pine", flip: true },
  [Obj.Rock]: { id: "prop_rock", flip: true },
  [Obj.Bush]: { id: "prop_bush", flip: true },
  [Obj.Pillar]: { id: "prop_banner" },
  [Obj.Flowers]: { id: "prop_flowers", decal: true, flip: true },
};

const MONSTER_KINDS = Object.keys(MONSTERS) as MonsterKind[];

interface BurstOptions {
  tints: number[];
  count: number;
  speed: number;
  gravityY?: number;
  lifespan?: number;
  angle?: { min: number; max: number };
}

function tileHash(x: number, y: number): number {
  return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
}

export class WorldScene extends Phaser.Scene {
  private readonly worldMap = generateMap();
  private readonly hud = new Hud();
  private readonly wardrobe = new Wardrobe({
    appearance: (message) => this.room?.send(ClientMsg.Appearance, message),
    equip: (kind, id) => this.room?.send(ClientMsg.Equip, { kind, id }),
    buy: (id) => this.room?.send(ClientMsg.Buy, { id }),
  });
  private spriteTextures!: SpriteTextures;
  private room: Room | null = null;
  private localId = "";
  private readonly actors = new Map<string, Actor>();
  private readonly monsterIds = new Set<string>();
  private lootLayer!: LootLayer;
  private minimap!: Minimap;
  private readonly ranking = new Ranking();
  private nextMinimapAt = 0;
  private corpses: Actor[] = [];
  private readonly waterBobs: { bob: Phaser.GameObjects.Bob; offset: number }[] = [];
  private waterFrame = 0;
  private readonly cameraAnchor = { x: 0, y: 0 };
  private targetMarker!: Phaser.GameObjects.Image;
  private hoverMarker!: Phaser.GameObjects.Image;
  private keyboard: KeyboardInput | null = null;

  constructor() {
    super("world");
  }

  create() {
    this.spriteTextures = new SpriteTextures(this);
    this.lootLayer = new LootLayer(this, this.spriteTextures);
    this.minimap = new Minimap(element<HTMLCanvasElement>("#minimap-canvas"), this.worldMap);
    element("#minimap-in").addEventListener("click", () => this.minimap.zoom(1.35));
    element("#minimap-out").addEventListener("click", () => this.minimap.zoom(1 / 1.35));
    element("#minimap-expand").addEventListener("click", () => this.toggleMap());
    element("#minimap-canvas").addEventListener("click", () => this.toggleMap());
    createTextures(this);
    this.drawGround();
    void this.drawObjects();
    // Os monstros aparecem logo ao entrar: carregar antes evita que surjam "atrasados".
    for (const kind of MONSTER_KINDS) void loadSheet(`monster_${kind}`).catch(() => undefined);

    this.hoverMarker = this.add.image(0, 0, "marker_hover").setDepth(DEPTH_DECAL + 1).setVisible(false);
    this.targetMarker = this.add.image(0, 0, "marker_target").setDepth(DEPTH_DECAL + 2).setVisible(false);

    const temple = tileToScreen(TEMPLE_X, TEMPLE_Y);
    this.cameraAnchor.x = temple.x;
    this.cameraAnchor.y = temple.y;
    const camera = this.cameras.main;
    camera.centerOn(temple.x, temple.y);
    camera.startFollow(this.cameraAnchor, true, 0.15, 0.15);

    this.input.mouse?.disableContextMenu();
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer));
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.onPointerDown(pointer));
    this.input.on("wheel", (_pointer: unknown, _objects: unknown, _dx: number, dy: number) => {
      camera.setZoom(Phaser.Math.Clamp(camera.zoom * (dy > 0 ? 0.9 : 1.1), 0.6, 1.6));
    });
    this.time.addEvent({ delay: 420, loop: true, callback: () => this.animateWater() });
  }

  attachRoom(room: Room) {
    this.room = room;
    this.localId = room.sessionId;
    const state = room.state as { players: { size: number }; eventName: string; eventEndsAt: number };
    const callbacks = Callbacks.get(room as Room<any, any>);

    callbacks.onAdd("players", (value, key) => {
      const player = value as PlayerData;
      const actor = this.addActor(String(key), player, true);
      callbacks.onChange(player, () => this.syncActor(actor));
      this.hud.setOnline(state.players.size);
    });
    callbacks.onRemove("players", (_value, key) => {
      this.removeActor(String(key));
      this.hud.setOnline(state.players.size);
    });
    callbacks.onAdd("monsters", (value, key) => {
      const monster = value as MonsterData;
      const id = String(key);
      const actor = this.addActor(id, monster, false);
      this.monsterIds.add(id);
      callbacks.onChange(monster, () => this.syncActor(actor));
    });
    callbacks.onRemove("monsters", (_value, key) => {
      const id = String(key);
      this.monsterIds.delete(id);
      this.removeActor(id);
    });
    callbacks.onAdd("loot", (value, key) => this.lootLayer.add(String(key), value as LootData));
    callbacks.onRemove("loot", (_value, key) => this.lootLayer.remove(String(key)));
    const updateEvent = () => this.hud.setEvent(state.eventName, state.eventEndsAt);
    callbacks.listen("eventName", updateEvent);
    callbacks.listen("eventEndsAt", updateEvent);

    room.onMessage(ServerMsg.Hit, (event: HitEvent) => this.onHit(event));
    room.onMessage(ServerMsg.Xp, (event: XpEvent) => this.onXp(event));
    room.onMessage(ServerMsg.LevelUp, (event: LevelUpEvent) => this.onLevelUp(event));
    room.onMessage(ServerMsg.MonsterDeath, (event: MonsterDeathEvent) => this.onMonsterDeath(event));
    room.onMessage(ServerMsg.Loot, (event: LootEvent) => this.onLoot(event));
    room.onMessage(ServerMsg.PlayerDeath, (event: PlayerDeathEvent) => this.onPlayerDeath(event));
    room.onMessage(ServerMsg.SpellEffect, (event: SpellEffectEvent) => this.onSpellEffect(event));
    room.onMessage(ServerMsg.Chat, (event: ChatEvent) => {
      this.hud.addChat(event);
      if (event.id) this.actors.get(event.id)?.say(event.text, this.time.now);
    });
    room.onMessage(ServerMsg.Announce, (event: AnnounceEvent) => this.hud.showBanner(event.text));
    room.onMessage(ServerMsg.Profile, (event: ProfileEvent) => {
      this.hud.setDiamonds(event.diamonds);
      this.wardrobe.setProfile(event);
    });
    room.onMessage(ServerMsg.Purchase, (event: PurchaseEvent) => this.onPurchase(event));
    room.onLeave((code) => {
      this.wardrobe.close();
      this.hud.showDisconnected(code === CLOSE_REPLACED ? "Seu personagem entrou em outra janela." : undefined);
    });

    this.hud.show();
    this.hud.onChat((text) => room.send(ClientMsg.Chat, { text }));
    this.hud.onSpell((id) => this.castSpell(id));
    this.hud.onWardrobe(() => this.wardrobe.toggle());
    this.hud.onRanking(() => this.ranking.toggle());
    this.hud.onMount(() => room.send(ClientMsg.ToggleMount));
    this.keyboard = new KeyboardInput({
      move: (dx, dy) => room.send(ClientMsg.Move, { dx, dy }),
      spell: (key) => {
        const spell = Object.values(SPELLS).find((s) => s.key === key);
        if (spell) this.castSpell(spell.id);
      },
      targetNearest: () => this.targetNearest(),
      escape: () => {
        if (this.ranking.isOpen) this.ranking.close();
        else if (this.wardrobe.isOpen) this.wardrobe.close();
        else if (element("#minimap").classList.contains("expanded")) this.toggleMap();
        else room.send(ClientMsg.Target, { id: "" });
      },
      focusChat: () => {
        this.keyboard?.release();
        this.hud.focusChat();
      },
      toggleWardrobe: () => this.wardrobe.toggle(),
      toggleMount: () => room.send(ClientMsg.ToggleMount),
      toggleRanking: () => this.ranking.toggle(),
      toggleMap: () => this.toggleMap(),
    });
  }

  update(time: number, delta: number) {
    for (const actor of this.actors.values()) actor.update(time, delta);
    this.lootLayer.update(time);
    if (this.corpses.length > 0) {
      for (const corpse of this.corpses) corpse.update(time, delta);
      this.corpses = this.corpses.filter((corpse) => {
        if (!corpse.finished(time)) return true;
        corpse.destroy();
        return false;
      });
    }

    const local = this.actors.get(this.localId);
    if (local) {
      const position = local.position(time);
      this.cameraAnchor.x = position.x;
      this.cameraAnchor.y = position.y - 24;
    } else if (!this.room) {
      // Antes de entrar: a câmera passeia devagar pela cidade, atrás do menu.
      const temple = tileToScreen(TEMPLE_X, TEMPLE_Y);
      this.cameraAnchor.x = temple.x + Math.cos(time / 7000) * 280;
      this.cameraAnchor.y = temple.y + Math.sin(time / 7000) * 140;
    }

    this.updateTarget();
    this.updateMinimap(time);
  }

  /** O mapa grande é o mesmo minimapa, só que maior e com mais zoom. */
  private toggleMap() {
    const map = element("#minimap");
    const expanded = map.classList.toggle("expanded");
    this.minimap.zoom(expanded ? 1.8 : 1 / 1.8);
  }

  private updateMinimap(time: number) {
    const local = this.actors.get(this.localId);
    if (!local || time < this.nextMinimapAt) return;
    this.nextMinimapAt = time + 66;

    this.minimap.follow(local.tileX, local.tileY);
    const blips = this.lootLayer.blips();
    for (const [id, actor] of this.actors) {
      if (id === this.localId || actor.dead) continue;
      const monster = this.monsterIds.has(id);
      blips.push({ x: actor.tileX, y: actor.tileY, color: monster ? 0xe0483d : 0x5ef08f, size: monster ? 2 : 3 });
    }
    this.minimap.draw(blips);
    element("#minimap-where").textContent = `${local.tileX}, ${local.tileY}`;
  }

  // ------------------------------------------------------------ mapa

  private drawGround() {
    const { width, height, ground } = this.worldMap;
    const blitter = this.add.blitter(0, 0, "ground").setDepth(DEPTH_GROUND);
    // Por diagonais (x + y) para os losangos de baixo sobreporem os de cima.
    for (let sum = 0; sum <= width + height - 2; sum++) {
      for (let x = Math.max(0, sum - height + 1); x <= Math.min(sum, width - 1); x++) {
        const y = sum - x;
        const type = ground[y * width + x] as Ground;
        const frame = GROUND_FRAME[type];
        const variant = tileHash(x, y) % GROUND_FRAMES[frame];
        const screen = tileToScreen(x, y);
        const bob = blitter.create(screen.x - TILE_CELL_W / 2, screen.y - TILE_CELL_H / 2, `${frame}_${variant}`);
        if (type === Ground.Water) this.waterBobs.push({ bob, offset: variant });
      }
    }
  }

  private async drawObjects() {
    const ids = [...new Set(Object.values(OBJECT_PROPS).map((prop) => prop!.id))];
    const textures = new Map((await Promise.all(ids.map((id) => this.spriteTextures.acquire(id)))).map((t) => [t.meta.id, t]));
    const { width, height, objects } = this.worldMap;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const prop = OBJECT_PROPS[objects[y * width + x] as Obj];
        const texture = prop ? textures.get(prop.id) : undefined;
        if (!prop || !texture) continue;
        const { meta } = texture;
        const hash = tileHash(x, y);
        const variant = (hash >>> 3) % (meta.anims.idle?.frames ?? 1);
        const screen = tileToScreen(x, y);
        this.add
          .image(screen.x, screen.y, texture.key, frameKey("idle", "S", variant))
          .setOrigin(meta.anchorX / meta.cellW, meta.anchorY / meta.cellH)
          .setFlipX(prop.flip === true && (hash & 1) === 1)
          .setDepth(prop.decal ? DEPTH_DECAL : screen.y);
      }
    }
  }

  private animateWater() {
    this.waterFrame = (this.waterFrame + 1) % GROUND_FRAMES.water;
    for (const { bob, offset } of this.waterBobs) {
      bob.setFrame(`water_${(offset + this.waterFrame) % GROUND_FRAMES.water}`);
    }
  }

  // ------------------------------------------------------------ personagens e monstros

  private addActor(id: string, data: PlayerData | MonsterData, isPlayer: boolean): Actor {
    this.actors.get(id)?.destroy();
    const actor = new Actor(this, this.spriteTextures, id, data, isPlayer);
    this.actors.set(id, actor);
    this.syncActor(actor);
    return actor;
  }

  private syncActor(actor: Actor) {
    actor.sync();
    if (actor.id !== this.localId) return;
    this.hud.updatePlayer(actor.data as PlayerData);
    this.wardrobe.setPlayer(actor.data as PlayerData);
    this.ranking.setMyName((actor.data as PlayerData).name);
  }

  private removeActor(id: string) {
    const actor = this.actors.get(id);
    if (!actor) return;
    this.actors.delete(id);
    if (actor.dead) {
      actor.becomeCorpse(this.time.now);
      this.corpses.push(actor);
    } else {
      actor.destroy();
    }
  }

  private updateTarget() {
    const local = this.actors.get(this.localId);
    const targetId = local ? (local.data as PlayerData).target : "";
    const target = targetId ? this.actors.get(targetId) : undefined;
    if (!target || target.dead) {
      this.targetMarker.setVisible(false);
      this.hud.setTarget(null);
      return;
    }
    const position = target.position(this.time.now);
    this.targetMarker.setVisible(true).setPosition(position.x, position.y);
    const monster = target.data as MonsterData;
    this.hud.setTarget({ name: MONSTERS[monster.kind].name, hp: monster.hp, maxHp: monster.maxHp });
  }

  // ------------------------------------------------------------ entrada

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    const tile = screenToTile(pointer.worldX, pointer.worldY);
    const inside = tile.x >= 0 && tile.y >= 0 && tile.x < this.worldMap.width && tile.y < this.worldMap.height;
    this.hoverMarker.setVisible(inside && this.room !== null);
    if (inside) {
      const screen = tileToScreen(tile.x, tile.y);
      this.hoverMarker.setPosition(screen.x, screen.y);
    }
    this.game.canvas.style.cursor = this.monsterUnder(pointer.worldX, pointer.worldY) ? "crosshair" : "default";
  }

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    if (!this.room) return;
    const monster = this.monsterUnder(pointer.worldX, pointer.worldY);
    if (monster) {
      this.room.send(ClientMsg.Target, { id: monster.id });
      return;
    }
    if (pointer.rightButtonDown()) return;

    const tile = screenToTile(pointer.worldX, pointer.worldY);
    this.room.send(ClientMsg.Goto, tile);
    const screen = tileToScreen(tile.x, tile.y);
    const marker = this.add.image(screen.x, screen.y, "marker_goto").setDepth(DEPTH_DECAL + 3);
    this.tweens.add({ targets: marker, alpha: 0, scale: 0.6, duration: 450, onComplete: () => marker.destroy() });
  }

  /** Monstro sob o cursor, pelo desenho visível e com uma folga para facilitar o clique nos pequenos. */
  private monsterUnder(worldX: number, worldY: number): Actor | null {
    let best: Actor | null = null;
    let bestY = -Infinity;
    for (const id of this.monsterIds) {
      const actor = this.actors.get(id);
      const bounds = actor && !actor.dead ? actor.bounds() : null;
      if (!actor || !bounds) continue;
      const hit =
        worldX >= bounds.x - 8 && worldX <= bounds.right + 8 && worldY >= bounds.y - 8 && worldY <= bounds.bottom + 6;
      const y = actor.position(this.time.now).y;
      if (hit && y > bestY) {
        best = actor;
        bestY = y;
      }
    }
    return best;
  }

  private targetNearest() {
    const local = this.actors.get(this.localId);
    if (!local || !this.room) return;
    const current = (local.data as PlayerData).target;
    const candidates = [...this.monsterIds]
      .map((id) => this.actors.get(id))
      .filter((actor): actor is Actor => actor !== undefined && !actor.dead)
      .map((actor) => ({ actor, distance: chebyshev(actor.tileX, actor.tileY, local.tileX, local.tileY) }))
      .filter((candidate) => candidate.distance <= 8)
      .sort((a, b) => a.distance - b.distance);
    if (candidates.length === 0) return;
    const index = candidates.findIndex((candidate) => candidate.actor.id === current);
    this.room.send(ClientMsg.Target, { id: candidates[(index + 1) % candidates.length].actor.id });
  }

  private castSpell(id: SpellId) {
    const local = this.actors.get(this.localId);
    if (!this.room || !local || this.hud.isOnCooldown(id)) return;
    const spell = SPELLS[id];
    const player = local.data as PlayerData;
    this.room.send(ClientMsg.Spell, { id });

    // O tempo de recarga só começa quando o lançamento tinha tudo para dar certo.
    const monstersInRange = (range: number) =>
      [...this.monsterIds].some((monsterId) => {
        const actor = this.actors.get(monsterId);
        return actor !== undefined && !actor.dead && chebyshev(actor.tileX, actor.tileY, local.tileX, local.tileY) <= range;
      });
    const target = player.target ? this.actors.get(player.target) : undefined;
    const aimed =
      target !== undefined && !target.dead && chebyshev(target.tileX, target.tileY, local.tileX, local.tileY) <= spell.range;
    const hasTargets =
      id === "whirl" || id === "quake" ? monstersInRange(spell.range) : id === "bolt" || id === "drain" ? aimed : true;

    if (spellUnlocked(spell, player.level) && player.mana >= spell.mana && hasTargets) {
      this.hud.startCooldown(id, spell.cooldownMs);
    }
  }

  // ------------------------------------------------------------ efeitos

  private onHit(event: HitEvent) {
    const now = this.time.now;
    const target = this.actors.get(event.target);
    const attacker = this.actors.get(event.attacker);
    if (attacker && event.kind !== "heal") attacker.play("attack", now);
    if (!target) return;
    const { x, y } = target.position(now);
    const top = target.headY + 4;
    const middle = (y + target.headY) / 2;

    if (event.kind === "heal") {
      if (event.amount > 0) this.floatingText(x, top, `+${event.amount}`, "#5ee07a", 15);
      return;
    }
    if (event.kind === "block") {
      this.floatingText(x, top, "bloqueou", "#b8c0cc", 11, 22);
      this.burst(x, middle, { tints: [0xd6dde6], count: 5, speed: 70 });
      return;
    }

    const isLocal = event.target === this.localId;
    this.floatingText(x, top, String(event.amount), isLocal ? "#ff5a4f" : "#ffe27a", 17);
    target.hurt(now);
    this.burst(x, middle, { tints: [0xff4d4d, 0xb91c1c, 0xffd1a1], count: 8, speed: 130 });
    if (isLocal) this.cameras.main.shake(90, 0.003);
  }

  private onXp(event: XpEvent) {
    const actor = this.actors.get(event.id);
    if (!actor) return;
    const { x } = actor.position(this.time.now);
    const local = event.id === this.localId;
    this.floatingText(
      x,
      actor.headY - 18,
      `+${event.amount.toLocaleString("pt-BR")} XP`,
      local ? "#ffffff" : "#d4d4d4",
      local ? 14 : 11,
      42,
      1400,
    );
  }

  private onLevelUp(event: LevelUpEvent) {
    const actor = this.actors.get(event.id);
    if (!actor) return;
    const { x, y } = actor.position(this.time.now);

    const beam = this.add
      .image(x, y + 6, "beam")
      .setOrigin(0.5, 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(y + 3)
      .setScale(1.5, 0);
    this.tweens.add({ targets: beam, scaleY: 1.1, duration: 280, ease: "Back.easeOut" });
    this.tweens.add({ targets: beam, alpha: 0, delay: 800, duration: 700, onComplete: () => beam.destroy() });

    this.burst(x, y - 20, {
      tints: [0xffe08a, 0xffc94d, 0xffffff],
      count: 45,
      speed: 260,
      gravityY: 120,
      lifespan: 1100,
      angle: { min: 230, max: 310 },
    });
    this.floatingText(x, actor.headY - 34, `NÍVEL ${event.level}!`, "#ffd35c", 22, 56, 2000);

    if (event.id !== this.localId) return;
    for (const spell of spellsUnlockedAt(event.level)) {
      this.hud.showBanner(`Novo poder: ${spell.name} · tecla ${spell.key}`);
      this.floatingText(x, actor.headY - 64, `NOVO PODER: ${spell.name.toUpperCase()}`, "#5ef08f", 16, 70, 2600);
      this.burst(x, y - 30, { tints: [0x5ef08f, 0xffffff, 0x7dd3fc], count: 40, speed: 200, gravityY: -60, lifespan: 1200 });
    }
  }

  private onPurchase(event: PurchaseEvent) {
    this.wardrobe.showStatus(event.message, event.ok);
    const local = this.actors.get(this.localId);
    if (!event.ok || !local) return;
    const { x, y } = local.position(this.time.now);
    this.burst(x, y - 40, {
      tints: [0xffe08a, 0x7dd3fc, 0xffffff],
      count: 40,
      speed: 240,
      gravityY: 160,
      lifespan: 1000,
      angle: { min: 220, max: 320 },
    });
    const item = catalogItem(event.id);
    if (item) this.floatingText(x, local.headY - 20, item.name, "#7dd3fc", 16, 50, 1800);
  }

  private onMonsterDeath(event: MonsterDeathEvent) {
    const actor = this.actors.get(event.id);
    if (!actor) return;
    const now = this.time.now;
    actor.die(now);
    const { x, y } = actor.position(now);
    this.burst(x, (y + actor.headY) / 2, { tints: [0x9f1d1d, 0x5c0f0f, 0xd9d9d9], count: 18, speed: 180 });
  }

  /** Alguém pegou um drop: brilho no chão e o valor subindo. */
  private onLoot(event: LootEvent) {
    const def = LOOT[event.kind];
    const screen = tileToScreen(event.x, event.y);
    const color = `#${def.color.toString(16).padStart(6, "0")}`;
    this.burst(screen.x, screen.y - 10, {
      tints: [def.color, 0xffffff],
      count: def.rarity === "comum" ? 10 : 26,
      speed: def.rarity === "comum" ? 90 : 190,
      gravityY: 220,
      lifespan: 700,
      angle: { min: 200, max: 340 },
    });

    const mine = event.id === this.localId;
    const parts: string[] = [];
    if (event.gold > 0) parts.push(`+${event.gold.toLocaleString("pt-BR")} ouro`);
    if (event.diamonds > 0) parts.push(`+${event.diamonds} 💎`);
    if (parts.length === 0) return;
    this.floatingText(screen.x, screen.y - 26, parts.join("  "), color, mine ? 16 : 12, 40, mine ? 1200 : 800);
  }

  private onPlayerDeath(event: PlayerDeathEvent) {
    const { x, y } = tileToScreen(event.x, event.y);
    this.burst(x, y - 40, { tints: [0xff3b3b, 0x7f1d1d, 0xffffff], count: 30, speed: 220 });
    if (event.id === this.localId) {
      this.cameras.main.shake(250, 0.008);
      this.hud.showDeath(event.xpLost);
    }
  }

  private onSpellEffect(event: SpellEffectEvent) {
    const now = this.time.now;
    const caster = this.actors.get(event.caster);
    caster?.play(event.spell === "heal" ? "cast" : "attack", now);
    const from = caster ? caster.position(now) : tileToScreen(event.x, event.y);
    const at = tileToScreen(event.x, event.y);
    const local = event.caster === this.localId;

    switch (event.spell) {
      case "heal":
        this.burst(from.x, from.y - 30, { tints: [0x7dff9b, 0xc8ffd4, 0x34d399], count: 26, speed: 70, gravityY: -140, lifespan: 900 });
        return;

      case "whirl":
        this.spellRing(from.x, from.y, 40, 190, 0xfff1c1, 380);
        this.burst(from.x, from.y - 20, { tints: [0xffffff, 0xffe08a], count: 22, speed: 280, gravityY: 0, lifespan: 420 });
        return;

      case "quake":
        this.spellRing(from.x, from.y, 60, 380, 0xffb057, 620);
        this.spellRing(from.x, from.y, 30, 260, 0xffe3b0, 480);
        this.burst(from.x, from.y, {
          tints: [0xb98a52, 0x7a5a34, 0xd9c7a8],
          count: 40,
          speed: 240,
          gravityY: 420,
          lifespan: 900,
          angle: { min: 200, max: 340 },
        });
        if (local) this.cameras.main.shake(320, 0.006);
        return;

      case "bolt":
        this.spellBeam(from.x, from.y - 26, at.x, at.y - 20, 0xffa53c);
        this.burst(at.x, at.y - 16, { tints: [0xffd166, 0xff7b2c, 0xffffff], count: 26, speed: 200, gravityY: 60, lifespan: 600 });
        return;

      case "drain":
        this.spellBeam(at.x, at.y - 20, from.x, from.y - 26, 0xa78bfa);
        this.burst(at.x, at.y - 16, { tints: [0xa78bfa, 0x7c3aed, 0xe9d5ff], count: 24, speed: 120, gravityY: -120, lifespan: 800 });
        return;
    }
  }

  /** Anel que cresce no chão, em perspectiva isométrica. */
  private spellRing(x: number, y: number, from: number, to: number, color: number, duration: number) {
    const ring = this.add.graphics({ x, y }).setDepth(y + 3).setBlendMode(Phaser.BlendModes.ADD);
    const animation = { t: 0 };
    this.tweens.add({
      targets: animation,
      t: 1,
      duration,
      ease: "Cubic.easeOut",
      onUpdate: () => {
        const size = from + animation.t * (to - from);
        ring.clear();
        ring.lineStyle(7 * (1 - animation.t) + 1, color, 1 - animation.t);
        ring.strokeEllipse(0, 0, size, size / 2);
      },
      onComplete: () => ring.destroy(),
    });
  }

  /** Risco de energia entre dois pontos (raio e drenagem). */
  private spellBeam(x1: number, y1: number, x2: number, y2: number, color: number) {
    const beam = this.add.graphics().setDepth(DEPTH_FLOATING - 1).setBlendMode(Phaser.BlendModes.ADD);
    const animation = { t: 0 };
    this.tweens.add({
      targets: animation,
      t: 1,
      duration: 320,
      onUpdate: () => {
        beam.clear();
        beam.lineStyle(7 * (1 - animation.t) + 2, color, 1 - animation.t * 0.8);
        beam.lineBetween(x1, y1, x2, y2);
        beam.lineStyle(2, 0xffffff, (1 - animation.t) * 0.8);
        beam.lineBetween(x1, y1, x2, y2);
      },
      onComplete: () => beam.destroy(),
    });
  }

  private floatingText(x: number, y: number, text: string, color: string, size: number, rise = 34, duration = 900) {
    const label = this.add
      .text(x, y, text, {
        fontFamily: GAME_FONT,
        fontSize: `${size}px`,
        fontStyle: "bold",
        color,
        stroke: "#000000",
        strokeThickness: 4,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_FLOATING)
      .setScale(1.35);
    this.tweens.add({ targets: label, scale: 1, duration: 140, ease: "Back.easeOut" });
    this.tweens.add({ targets: label, y: y - rise, duration, ease: "Cubic.easeOut" });
    this.tweens.add({
      targets: label,
      alpha: 0,
      delay: duration * 0.55,
      duration: duration * 0.45,
      onComplete: () => label.destroy(),
    });
  }

  private burst(x: number, y: number, options: BurstOptions) {
    const emitter = this.add.particles(x, y, "spark", {
      speed: { min: options.speed * 0.3, max: options.speed },
      angle: options.angle ?? { min: 0, max: 360 },
      lifespan: { min: (options.lifespan ?? 700) * 0.5, max: options.lifespan ?? 700 },
      scale: { start: 0.55, end: 0 },
      gravityY: options.gravityY ?? 300,
      tint: options.tints,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    emitter.setDepth(DEPTH_FLOATING - 1);
    emitter.explode(options.count);
    this.time.delayedCall((options.lifespan ?? 700) + 200, () => emitter.destroy());
  }
}
