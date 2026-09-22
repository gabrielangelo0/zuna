import Phaser from "phaser";
import { Callbacks, type Room } from "@colyseus/sdk";
import {
  ClientMsg,
  Ground,
  LOOT,
  MONSTERS,
  Obj,
  ServerMsg,
  spellById,
  spellUnlocked,
  spellsUnlockedAt,
  applyCatalogOverrides,
  buildWorldMap,
  catalogItem,
  chebyshev,
  frameKey,
  generateMap,
  type AnnounceEvent,
  type CatalogEvent,
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
  type PortalDef,
  type ProfileEvent,
  type PurchaseEvent,
  type SpellEffectEvent,
  type SpellId,
  type TravelEvent,
  type WorldBlueprint,
  type WorldPatchEvent,
  type XpEvent,
} from "@zuna/shared";
import { Actor } from "./actors.ts";
import { GAME_FONT } from "./canvas.ts";
import { element } from "./dom.ts";
import { Hud } from "./hud.ts";
import { screenToTile, tileToScreen } from "./iso.ts";
import { Grimoire } from "./grimoire.ts";
import { LootLayer } from "./loot.ts";
import { Minimap } from "./minimap.ts";
import { Ranking } from "./ranking.ts";
import { KeyboardInput } from "./keyboard.ts";
import { SpriteTextures, loadSheet } from "./sprites.ts";
import { GROUND_FRAMES, TILE_CELL_H, TILE_CELL_W, createTextures, type GroundFrameName } from "./textures.ts";
import { Wardrobe } from "./wardrobe.ts";
import { FOAM_FRAMES, WATER_FRAMES, foamFrameName, shallowEdgeName, waterFramePrefix } from "./water.ts";

// Profundidade: chão < decalques (flores, marcadores) < cenário e personagens (ordenados por Y) < nomes < textos.
const DEPTH_GROUND = -1_000_000;
const DEPTH_DECAL = -900_000;
const DEPTH_FLOATING = 950_000;

/** Motivos de saída que o servidor manda junto com o fechamento da conexão. */
const CLOSE_REASON: Record<number, string> = {
  4001: "Seu personagem entrou em outra janela.",
  4002: "Sua conta foi bloqueada por um administrador.",
  4003: "Um administrador tirou você do jogo.",
};

const TEXT_RESOLUTION = Math.min(2, window.devicePixelRatio || 1);

/** Quadro do chão de cada tipo. A água tem camada própria (water.ts). */
const GROUND_FRAME: Record<Exclude<Ground, typeof Ground.Water>, GroundFrameName> = {
  [Ground.Grass]: "grass",
  [Ground.GrassDark]: "grassDark",
  [Ground.Dirt]: "dirt",
  [Ground.Sand]: "sand",
  [Ground.Stone]: "stone",
};

/** Vizinhos de um tile de água: o lado do losango que encosta em cada um. */
const SHORE_EDGES: readonly { dx: number; dy: number; part: string }[] = [
  { dx: 0, dy: -1, part: "ne" },
  { dx: 1, dy: 0, part: "se" },
  { dx: 0, dy: 1, part: "sw" },
  { dx: -1, dy: 0, part: "nw" },
];

/** Quinas: só ganham espuma quando a terra encosta só na ponta, sem tocar os dois lados vizinhos. */
const SHORE_CORNERS: readonly { dx: number; dy: number; part: string; sides: [number, number] }[] = [
  { dx: -1, dy: -1, part: "n", sides: [0, 3] },
  { dx: 1, dy: -1, part: "e", sides: [0, 1] },
  { dx: 1, dy: 1, part: "s", sides: [1, 2] },
  { dx: -1, dy: 1, part: "w", sides: [2, 3] },
];

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

/** Uma coisa do mundo sincronizada pelo servidor, com o mundo em que ela está. */
interface Entity {
  data: PlayerData | MonsterData;
  isPlayer: boolean;
}

export class WorldScene extends Phaser.Scene {
  /** Mapas de todos os mundos abertos, pela chave. */
  private readonly blueprints = new Map<string, WorldBlueprint>();
  private worldSlug = "";
  private worldMap = generateMap();
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
  private readonly entities = new Map<string, Entity>();
  private lootLayer!: LootLayer;
  private minimap!: Minimap;
  /** Chão, água e espuma: três camadas de losangos, refeitas quando o mundo muda. */
  private groundLayers: Phaser.GameObjects.Blitter[] = [];
  private sceneryLayer: Phaser.GameObjects.GameObject[] = [];
  private portalLayer: Phaser.GameObjects.GameObject[] = [];
  private portals: PortalDef[] = [];
  /** Troca a cada redesenho: o desenho antigo, se ainda estiver carregando, é descartado. */
  private drawToken = 0;
  private readonly ranking = new Ranking();
  private readonly grimoire = new Grimoire((slots) => this.room?.send(ClientMsg.Shortcuts, { slots }));
  private nextMinimapAt = 0;
  private corpses: Actor[] = [];
  /** Cada tile de água guarda o começo do nome do quadro; a animação só troca o número do fim. */
  private readonly waterBobs: { bob: Phaser.GameObjects.Bob; prefix: string }[] = [];
  private readonly foamBobs: { bob: Phaser.GameObjects.Bob; part: string }[] = [];
  private waterFrame = 0;
  private foamFrame = 0;
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
    this.minimap.setMap(this.worldMap, this.blueprints.get(this.worldSlug)?.world);
    element("#minimap-in").addEventListener("click", () => this.minimap.zoom(1.35));
    element("#minimap-out").addEventListener("click", () => this.minimap.zoom(1 / 1.35));
    element("#minimap-expand").addEventListener("click", () => this.toggleMap());
    element("#minimap-canvas").addEventListener("click", () => this.toggleMap());
    createTextures(this);
    this.drawWorld();
    // Os monstros aparecem logo ao entrar: carregar antes evita que surjam "atrasados".
    for (const kind of MONSTER_KINDS) void loadSheet(`monster_${kind}`).catch(() => undefined);

    this.hoverMarker = this.add.image(0, 0, "marker_hover").setDepth(DEPTH_DECAL + 1).setVisible(false);
    this.targetMarker = this.add.image(0, 0, "marker_target").setDepth(DEPTH_DECAL + 2).setVisible(false);

    const center = this.worldCenter();
    this.cameraAnchor.x = center.x;
    this.cameraAnchor.y = center.y;
    const camera = this.cameras.main;
    camera.centerOn(center.x, center.y);
    camera.startFollow(this.cameraAnchor, true, 0.15, 0.15);

    this.input.mouse?.disableContextMenu();
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer));
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.onPointerDown(pointer));
    this.input.on("wheel", (_pointer: unknown, _objects: unknown, _dx: number, dy: number) => {
      camera.setZoom(Phaser.Math.Clamp(camera.zoom * (dy > 0 ? 0.9 : 1.1), 0.6, 1.6));
    });
    this.time.addEvent({ delay: 170, loop: true, callback: () => this.animateWater() });
    this.time.addEvent({ delay: 260, loop: true, callback: () => this.animateFoam() });
  }

  attachRoom(room: Room) {
    this.room = room;
    this.localId = room.sessionId;
    const state = room.state as { players: { size: number }; eventName: string; eventEndsAt: number };
    const callbacks = Callbacks.get(room as Room<any, any>);

    callbacks.onAdd("players", (value, key) => {
      const player = value as PlayerData;
      const id = String(key);
      this.entities.set(id, { data: player, isPlayer: true });
      this.refreshEntity(id);
      callbacks.onChange(player, () => this.refreshEntity(id));
      this.hud.setOnline(state.players.size);
    });
    callbacks.onRemove("players", (_value, key) => {
      const id = String(key);
      this.entities.delete(id);
      this.removeActor(id);
      this.hud.setOnline(state.players.size);
    });
    callbacks.onAdd("monsters", (value, key) => {
      const monster = value as MonsterData;
      const id = String(key);
      this.entities.set(id, { data: monster, isPlayer: false });
      this.monsterIds.add(id);
      this.refreshEntity(id);
      callbacks.onChange(monster, () => this.refreshEntity(id));
    });
    callbacks.onRemove("monsters", (_value, key) => {
      const id = String(key);
      this.entities.delete(id);
      this.monsterIds.delete(id);
      this.removeActor(id);
    });
    callbacks.onAdd("loot", (value, key) => {
      const loot = value as LootData;
      if (loot.world === this.worldSlug) this.lootLayer.add(String(key), loot);
    });
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
      this.hud.setShortcuts(event.shortcuts);
      this.grimoire.setShortcuts(event.shortcuts);
      this.wardrobe.setProfile(event);
    });
    room.onMessage(ServerMsg.Purchase, (event: PurchaseEvent) => this.onPurchase(event));
    room.onMessage(ServerMsg.Travel, (event: TravelEvent) => {
      this.useWorld(event.world);
      this.hud.showBanner(event.name);
    });
    room.onMessage(ServerMsg.WorldPatch, (event: WorldPatchEvent) => this.applyWorldPatch(event.blueprint));
    room.onMessage(ServerMsg.Catalog, (event: CatalogEvent) => {
      applyCatalogOverrides(event.catalog);
      this.wardrobe.refresh();
    });
    room.onLeave((code, reason) => {
      this.wardrobe.close();
      this.hud.showDisconnected(reason || CLOSE_REASON[code]);
    });

    this.hud.show();
    this.hud.onChat((text) => room.send(ClientMsg.Chat, { text }));
    this.hud.onSpell((id) => this.castSpell(id));
    this.hud.onWardrobe(() => this.wardrobe.toggle());
    this.hud.onRanking(() => this.ranking.toggle());
    this.hud.onPowers(() => this.grimoire.toggle());
    this.hud.onMount(() => room.send(ClientMsg.ToggleMount));
    this.keyboard = new KeyboardInput({
      move: (dx, dy) => room.send(ClientMsg.Move, { dx, dy }),
      spell: (key) => {
        const id = this.hud.spellForKey(key);
        if (id) this.castSpell(id);
        else if (key <= "6") this.grimoire.open();
      },
      targetNearest: () => this.targetNearest(),
      escape: () => {
        if (this.grimoire.isOpen) this.grimoire.close();
        else if (this.ranking.isOpen) this.ranking.close();
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
      togglePowers: () => this.grimoire.toggle(),
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
      const center = this.worldCenter();
      this.cameraAnchor.x = center.x + Math.cos(time / 7000) * 280;
      this.cameraAnchor.y = center.y + Math.sin(time / 7000) * 140;
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
    for (const portal of this.portals) blips.push({ x: portal.x, y: portal.y, color: 0xb07dff, size: 2 });
    for (const [id, actor] of this.actors) {
      if (id === this.localId || actor.dead) continue;
      const monster = this.monsterIds.has(id);
      blips.push({ x: actor.tileX, y: actor.tileY, color: monster ? 0xe0483d : 0x5ef08f, size: monster ? 2 : 3 });
    }
    this.minimap.draw(blips);
    element("#minimap-where").textContent = `${local.tileX}, ${local.tileY}`;
  }

  // ------------------------------------------------------------ mundos

  /** Mapas que o servidor mandou antes de entrar. O primeiro é o mundo onde todo mundo nasce. */
  setWorlds(list: WorldBlueprint[]) {
    this.blueprints.clear();
    for (const blueprint of list) this.blueprints.set(blueprint.world.slug, blueprint);
    const start = list.find((entry) => entry.world.isDefault) ?? list[0];
    if (start) this.useWorld(start.world.slug);
  }

  /** Troca o mundo desenhado na tela e recoloca quem está nele. */
  private useWorld(slug: string) {
    const blueprint = this.blueprints.get(slug);
    if (!blueprint || slug === this.worldSlug) return;
    this.worldSlug = slug;
    this.worldMap = buildWorldMap(blueprint);
    this.portals = blueprint.portals;
    if (!this.scene.isActive()) return;

    this.drawWorld();
    this.minimap?.setMap(this.worldMap, this.blueprints.get(this.worldSlug)?.world);
    for (const id of [...this.actors.keys()]) {
      this.actors.get(id)?.destroy();
      this.actors.delete(id);
    }
    this.lootLayer?.clear();
    const loot = (this.room?.state as { loot?: Map<string, LootData> } | undefined)?.loot;
    if (loot) for (const [id, data] of loot) if (data.world === this.worldSlug) this.lootLayer.add(String(id), data);
    for (const id of this.entities.keys()) this.refreshEntity(id);
  }

  /** O painel editou o mundo: monta o terreno de novo sem tirar ninguém do jogo. */
  private applyWorldPatch(blueprint: WorldBlueprint) {
    this.blueprints.set(blueprint.world.slug, blueprint);
    if (blueprint.world.slug !== this.worldSlug) return;
    this.worldMap = buildWorldMap(blueprint);
    this.portals = blueprint.portals;
    this.drawWorld();
    this.minimap?.setMap(this.worldMap, this.blueprints.get(this.worldSlug)?.world);
  }

  /** Centro do mundo em pixels: a praça, para a câmera começar olhando para ela. */
  private worldCenter() {
    const world = this.blueprints.get(this.worldSlug)?.world;
    return tileToScreen(world?.spawnX ?? this.worldMap.width / 2, world?.spawnY ?? this.worldMap.height / 2);
  }

  /** Redesenha chão, cenário e portais do mundo atual. */
  private drawWorld() {
    const token = ++this.drawToken;
    for (const layer of this.groundLayers) layer.destroy();
    this.groundLayers = [];
    this.foamBobs.length = 0;
    for (const item of this.sceneryLayer) item.destroy();
    this.sceneryLayer = [];
    for (const item of this.portalLayer) item.destroy();
    this.portalLayer = [];
    this.waterBobs.length = 0;

    this.drawGround();
    void this.drawObjects(token);
    this.drawPortals();
  }

  /** Portais: um losango brilhante no chão com o nome por cima. */
  private drawPortals() {
    for (const portal of this.portals) {
      const screen = tileToScreen(portal.x, portal.y);
      const mark = this.add
        .image(screen.x, screen.y, "marker_goto")
        .setDepth(DEPTH_DECAL + 1)
        .setTint(0xb07dff)
        .setAlpha(0.85);
      this.tweens.add({ targets: mark, alpha: 0.35, scale: 1.12, duration: 900, yoyo: true, repeat: -1 });
      this.portalLayer.push(mark);

      const text = this.add
        .text(screen.x, screen.y - 26, portal.name || "Portal", {
          fontFamily: GAME_FONT,
          fontSize: "12px",
          color: "#e6d2ff",
          stroke: "#1a1030",
          strokeThickness: 4,
        })
        .setOrigin(0.5, 1)
        .setResolution(TEXT_RESOLUTION)
        .setDepth(DEPTH_FLOATING);
      this.portalLayer.push(text);
    }
  }

  /** Só entra em cena o que está no mesmo mundo do jogador. */
  private refreshEntity(id: string) {
    const entry = this.entities.get(id);
    if (!entry) return;
    if (id === this.localId && entry.data.world && entry.data.world !== this.worldSlug) {
      this.useWorld(entry.data.world);
      return;
    }

    const here = entry.data.world === this.worldSlug;
    const actor = this.actors.get(id);
    if (!here) {
      if (!actor) return;
      this.actors.delete(id);
      actor.destroy();
      return;
    }
    if (actor) this.syncActor(actor);
    else this.syncActor(this.addActor(id, entry.data, entry.isPlayer));
  }

  // ------------------------------------------------------------ mapa

  private drawGround() {
    const { width, height, ground } = this.worldMap;
    // A água fica por baixo, a água rasa clareia por cima dela, a borda da terra cobre
    // o losango vizinho e a espuma vem por cima de tudo.
    const water = this.add.blitter(0, 0, "water").setDepth(DEPTH_GROUND - 2);
    const shallow = this.add.blitter(0, 0, "shallow").setDepth(DEPTH_GROUND - 1);
    const land = this.add.blitter(0, 0, "ground").setDepth(DEPTH_GROUND);
    const foam = this.add.blitter(0, 0, "foam").setDepth(DEPTH_GROUND + 1);
    this.groundLayers = [water, shallow, land, foam];
    const isLand = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < width && y < height && ground[y * width + x] !== Ground.Water;

    // Por diagonais (x + y) para os losangos de baixo sobreporem os de cima.
    for (let sum = 0; sum <= width + height - 2; sum++) {
      for (let x = Math.max(0, sum - height + 1); x <= Math.min(sum, width - 1); x++) {
        const y = sum - x;
        const type = ground[y * width + x] as Ground;
        const screen = tileToScreen(x, y);
        const left = screen.x - TILE_CELL_W / 2;
        const top = screen.y - TILE_CELL_H / 2;

        if (type !== Ground.Water) {
          const frame = GROUND_FRAME[type];
          land.create(left, top, `${frame}_${tileHash(x, y) % GROUND_FRAMES[frame]}`);
          continue;
        }

        const prefix = waterFramePrefix(x, y);
        this.waterBobs.push({ bob: water.create(left, top, `${prefix}${this.waterFrame}`), prefix });

        const touching = SHORE_EDGES.map((edge) => isLand(x + edge.dx, y + edge.dy));
        const corners = SHORE_CORNERS.filter(
          (corner) => isLand(x + corner.dx, y + corner.dy) && !touching[corner.sides[0]] && !touching[corner.sides[1]],
        ).map((corner) => corner.part);
        const edges = SHORE_EDGES.filter((_, index) => touching[index]).map((edge) => edge.part);
        for (const part of [...edges, ...corners]) {
          this.foamBobs.push({ bob: foam.create(left, top, foamFrameName(part, this.foamFrame)), part });
        }

        // Água rasa: o lado que encosta na terra, e também o tile de trás, para o degradê continuar.
        for (const part of corners) shallow.create(left, top, part);
        SHORE_EDGES.forEach((edge, index) => {
          if (touching[index]) shallow.create(left, top, shallowEdgeName(edge.part, 0));
          else if (isLand(x + edge.dx * 2, y + edge.dy * 2)) shallow.create(left, top, shallowEdgeName(edge.part, 1));
        });
      }
    }
  }

  private async drawObjects(token: number) {
    const ids = [...new Set(Object.values(OBJECT_PROPS).map((prop) => prop!.id))];
    const textures = new Map((await Promise.all(ids.map((id) => this.spriteTextures.acquire(id)))).map((t) => [t.meta.id, t]));
    // O mundo pode ter mudado enquanto os desenhos carregavam.
    if (token !== this.drawToken) return;
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
        this.sceneryLayer.push(
          this.add
            .image(screen.x, screen.y, texture.key, frameKey("idle", "S", variant))
            .setOrigin(meta.anchorX / meta.cellW, meta.anchorY / meta.cellH)
            .setFlipX(prop.flip === true && (hash & 1) === 1)
            .setDepth(prop.decal ? DEPTH_DECAL : screen.y),
        );
      }
    }
  }

  /** Todos os tiles de água andam juntos: é o que mantém as ondas emendadas de um losango ao outro. */
  private animateWater() {
    this.waterFrame = (this.waterFrame + 1) % WATER_FRAMES;
    for (const { bob, prefix } of this.waterBobs) bob.setFrame(`${prefix}${this.waterFrame}`);
  }

  private animateFoam() {
    this.foamFrame = (this.foamFrame + 1) % FOAM_FRAMES;
    for (const { bob, part } of this.foamBobs) bob.setFrame(foamFrameName(part, this.foamFrame));
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
    this.grimoire.setLevel((actor.data as PlayerData).level);
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
    const spell = spellById(id);
    if (!this.room || !local || !spell || this.hud.isOnCooldown(id)) return;
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
      spell.kind === "melee" || spell.kind === "area"
        ? monstersInRange(spell.range)
        : spell.kind === "target" || spell.kind === "leech"
          ? aimed
          : true;

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
      this.hud.showBanner(`Novo poder: ${spell.name}`);
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

    switch (spellById(event.spell)?.family) {
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

      case "storm":
        this.spellRing(from.x, from.y, 80, 520, 0x8ec5ff, 700);
        for (let i = 0; i < 5; i++) {
          const offset = { x: from.x + (Math.random() - 0.5) * 320, y: from.y + (Math.random() - 0.5) * 170 };
          this.time.delayedCall(i * 90, () => {
            this.spellBeam(offset.x, offset.y - 320, offset.x, offset.y, 0xbfe0ff);
            this.burst(offset.x, offset.y, { tints: [0xffffff, 0x8ec5ff], count: 14, speed: 160, lifespan: 500 });
          });
        }
        if (local) this.cameras.main.shake(420, 0.005);
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
