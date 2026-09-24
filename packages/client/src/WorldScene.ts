import Phaser from "phaser";
import { Callbacks, type Room } from "@colyseus/sdk";
import {
  RARITY,
  gearItem,
  rarityCss,
  setGearCatalog,
  type GearCatalogEvent,
  type ShotEvent,
  type MonsterSpellEvent,
  type QuestsEvent,
  type CheckinEvent,
  type MilestonesEvent,
  type InventoryEvent,
  ClientMsg,
  TILE_H,
  TILE_W,
  type ViewMessage,
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
import { SpellFx, createFxTextures } from "./effects.ts";
import { Hud } from "./hud.ts";
import { Inventory } from "./inventory.ts";
import { QuestLog } from "./questLog.ts";
import { Checkin } from "./checkin.ts";
import { screenToTile, tileToScreen } from "./iso.ts";
import { Grimoire } from "./grimoire.ts";
import { LootLayer } from "./loot.ts";
import { Minimap } from "./minimap.ts";
import { Ranking } from "./ranking.ts";
import { KeyboardInput } from "./keyboard.ts";
import { ChunkGrid } from "./chunks.ts";
import { SpriteTextures, loadSheet } from "./sprites.ts";
import { GROUND_FRAMES, TILE_CELL_H, TILE_CELL_W, createTextures, type GroundFrameName } from "./textures.ts";
import { DiamondShop } from "./shop.ts";
import { Wardrobe } from "./wardrobe.ts";
import {
  FOAM_FRAMES,
  LAVA,
  WATER,
  WATER_FRAMES,
  foamFrameName,
  shallowEdgeName,
  waterFramePrefix,
  type Liquid,
} from "./water.ts";

// Profundidade: chão < decalques (flores, marcadores) < cenário e personagens (ordenados por Y) < nomes < textos.
const DEPTH_GROUND = -1_000_000;
const DEPTH_DECAL = -900_000;
/** Portal: altura do meio do vão e tamanho do redemoinho lá dentro, em pixels. */
/** Altura da bacia do braseiro no sprite, em pixels. */
const BRAZIER_FLAME = 46;
const PORTAL_EYE = 50;
const PORTAL_EYE_W = 52;
const PORTAL_EYE_H = 68;
const DEPTH_FLOATING = 950_000;

/** Altura do sprite mais alto do cenário, em pixels: o bloco entra em cena antes da borda por causa dele. */
const TALLEST_PROP = 160;

/** O que um bloco do mundo tem montado. Vazio até a primeira vez que ele aparece na tela. */
interface ChunkParts {
  built: boolean;
  layers: Phaser.GameObjects.Blitter[];
  scenery: Phaser.GameObjects.GameObject[];
  flames: Phaser.GameObjects.Particles.ParticleEmitter[];
  water: { bob: Phaser.GameObjects.Bob; prefix: string; slow: boolean }[];
  foam: { bob: Phaser.GameObjects.Bob; part: string; slow: boolean }[];
}

/** Motivos de saída que o servidor manda junto com o fechamento da conexão. */
const CLOSE_REASON: Record<number, string> = {
  4001: "Seu personagem entrou em outra janela.",
  4002: "Sua conta foi bloqueada por um administrador.",
  4003: "Um administrador tirou você do jogo.",
};

const TEXT_RESOLUTION = Math.min(2, window.devicePixelRatio || 1);

/** Quadro do chão de cada tipo. Água e lava têm camadas próprias (water.ts). */
const GROUND_FRAME: Record<Exclude<Ground, typeof Ground.Water | typeof Ground.Lava>, GroundFrameName> = {
  [Ground.Grass]: "grass",
  [Ground.GrassDark]: "grassDark",
  [Ground.Dirt]: "dirt",
  [Ground.Sand]: "sand",
  [Ground.Stone]: "stone",
  [Ground.Snow]: "snow",
  [Ground.Cave]: "cave",
  [Ground.Ash]: "ash",
  [Ground.Mud]: "mud",
  [Ground.Marble]: "marble",
};

/** Líquidos: cada um com ondas, beira e espuma próprias. A lava anda na metade da velocidade. */
const LIQUIDS: readonly { ground: Ground; liquid: Liquid; slow: boolean }[] = [
  { ground: Ground.Water, liquid: WATER, slow: false },
  { ground: Ground.Lava, liquid: LAVA, slow: true },
];

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
const OBJECT_PROPS: Partial<Record<Obj, { id: string; decal?: boolean; flip?: boolean; fire?: boolean }>> = {
  [Obj.Tree]: { id: "prop_tree", flip: true },
  [Obj.Pine]: { id: "prop_pine", flip: true },
  [Obj.Rock]: { id: "prop_rock", flip: true },
  [Obj.Bush]: { id: "prop_bush", flip: true },
  [Obj.Pillar]: { id: "prop_banner" },
  [Obj.Flowers]: { id: "prop_flowers", decal: true, flip: true },
  [Obj.DeadTree]: { id: "prop_deadtree", flip: true },
  [Obj.TwistedTree]: { id: "prop_twisted", flip: true },
  [Obj.Mushroom]: { id: "prop_mushroom", decal: true, flip: true },
  [Obj.SnowPine]: { id: "prop_snowpine", flip: true },
  [Obj.Crystal]: { id: "prop_crystal", flip: true },
  [Obj.LavaRock]: { id: "prop_lavarock", flip: true },
  [Obj.Lily]: { id: "prop_lily", decal: true, flip: true },
  [Obj.Fern]: { id: "prop_fern", decal: true, flip: true },
  [Obj.Barrel]: { id: "prop_barrel", flip: true },
  [Obj.Column]: { id: "prop_column" },
  [Obj.Altar]: { id: "prop_altar" },
  [Obj.Brazier]: { id: "prop_brazier", fire: true },
  [Obj.Mosaic]: { id: "prop_mosaic", decal: true },
};

/** Monstros do mundo inicial, baixados antes de o jogador entrar. */
const STARTER_MONSTERS: readonly MonsterKind[] = ["rat", "snake", "wolf", "orc", "troll", "cyclops"];

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
    buyDiamonds: () => this.openShop(),
    vocation: (id) => this.room?.send(ClientMsg.Vocation, { id }),
  });
  private readonly shop = new DiamondShop();
  private readonly questLog = new QuestLog({
    claim: (id) => this.room?.send(ClientMsg.QuestClaim, { id }),
    summon: (id) => this.room?.send(ClientMsg.QuestBoss, { id }),
  });
  private readonly checkin = new Checkin({
    claim: () => this.room?.send(ClientMsg.CheckinClaim, {}),
  });
  private readonly inventory = new Inventory({
    move: (uid, to, index, count) => this.room?.send(ClientMsg.ItemMove, { uid, to, index, count }),
    equip: (uid) => this.room?.send(ClientMsg.ItemEquip, { uid }),
    use: (uid) => this.room?.send(ClientMsg.ItemUse, { uid }),
    sell: (uid, count) => this.room?.send(ClientMsg.ItemSell, { uid, count }),
    buy: (id, currency, count) => this.room?.send(ClientMsg.ItemBuy, { id, currency, count }),
    buyDiamonds: () => this.openShop(),
  });
  private spriteTextures!: SpriteTextures;
  private room: Room | null = null;
  private localId = "";
  private readonly actors = new Map<string, Actor>();
  private readonly monsterIds = new Set<string>();
  private readonly entities = new Map<string, Entity>();
  private fx!: SpellFx;
  private lootLayer!: LootLayer;
  private minimap!: Minimap;
  /** Chão, água e espuma: três camadas de losangos, refeitas quando o mundo muda. */
  /** Blocos do mundo e o que cada um tem montado. */
  private grid: ChunkGrid | null = null;
  private chunks: ChunkParts[] = [];
  /** Distância entre as profundidades de duas camadas de chão, para os blocos não se misturarem. */
  private chunkSpan = 1;
  private portalLayer: Phaser.GameObjects.GameObject[] = [];
  private portals: PortalDef[] = [];
  /** Troca a cada redesenho: o desenho antigo, se ainda estiver carregando, é descartado. */
  private drawToken = 0;
  private readonly ranking = new Ranking();
  private readonly grimoire = new Grimoire((slots) => this.room?.send(ClientMsg.Shortcuts, { slots }));
  private nextMinimapAt = 0;
  private corpses: Actor[] = [];
  /** Cada tile de líquido guarda o começo do nome do quadro; a animação só troca o número do fim. */
  /** Última janela de visão avisada ao servidor, para não repetir a mensagem a cada quadro. */
  private sentView = { u: 0, v: 0 };

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
    createFxTextures(this);
    this.fx = new SpellFx(this, { ground: DEPTH_DECAL + 5, air: DEPTH_FLOATING - 1 });
    this.drawWorld();
    // Os monstros da cidade aparecem logo ao entrar: carregar antes evita que surjam "atrasados".
    // Os dos outros mundos carregam quando o jogador chega lá (são mais de 20 folhas).
    for (const kind of STARTER_MONSTERS) void loadSheet(`monster_${kind}`).catch(() => undefined);

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
      this.sendView();
    });
    this.scale.on("resize", () => this.sendView());
    this.time.addEvent({ delay: 170, loop: true, callback: () => this.animateWater() });
    this.time.addEvent({ delay: 260, loop: true, callback: () => this.animateFoam() });
  }

  attachRoom(room: Room, token: string) {
    this.room = room;
    this.shop.setToken(token);
    this.localId = room.sessionId;
    const state = room.state as { players: { size: number }; eventName: string; eventEndsAt: number; online: number };
    const callbacks = Callbacks.get(room as Room<any, any>);

    callbacks.onAdd("players", (value, key) => {
      const player = value as PlayerData;
      const id = String(key);
      this.entities.set(id, { data: player, isPlayer: true });
      this.refreshEntity(id);
      callbacks.onChange(player, () => this.refreshEntity(id));
    });
    callbacks.onRemove("players", (_value, key) => {
      const id = String(key);
      this.entities.delete(id);
      this.removeActor(id);
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
    // O mapa de jogadores agora só traz quem está por perto: o total vem à parte.
    callbacks.listen("online", () => this.hud.setOnline(state.online));
    this.sendView();

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
      this.shop.setDiamonds(event.diamonds);
      this.inventory.setDiamonds(event.diamonds);
      this.hud.setShortcuts(event.shortcuts);
      this.grimoire.setShortcuts(event.shortcuts);
      this.grimoire.setVocation(event.vocation);
      this.hud.setVocation(event.vocation);
      this.wardrobe.setProfile(event);
    });
    room.onMessage(ServerMsg.Purchase, (event: PurchaseEvent) => this.onPurchase(event));
    room.onMessage(ServerMsg.Inventory, (event: InventoryEvent) => this.inventory.setInventory(event));
    room.onMessage(ServerMsg.MonsterSpell, (event: MonsterSpellEvent) => this.onMonsterSpell(event));
    room.onMessage(ServerMsg.Quests, (event: QuestsEvent) => {
      this.questLog.setQuests(event);
      this.hud.setQuestsReady(this.questLog.readyCount);
    });
    room.onMessage(ServerMsg.Milestones, (event: MilestonesEvent) => this.questLog.setMilestones(event));
    room.onMessage(ServerMsg.Checkin, (event: CheckinEvent) => {
      this.checkin.setCheckin(event);
      this.hud.setCheckinReady(this.checkin.ready);
    });
    room.onMessage(ServerMsg.Shot, (event: ShotEvent) => {
      const now = this.time.now;
      const from = this.actors.get(event.attacker);
      const to = this.actors.get(event.target);
      if (!from || !to) return;
      from.play("attack", now);
      this.fx.arrow(from.position(now), to.position(now));
    });
    room.onMessage(ServerMsg.Gear, (event: GearCatalogEvent) => {
      setGearCatalog(event.items);
      this.inventory.refresh();
    });
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
      this.inventory.close();
      this.questLog.close();
      this.shop.close();
      this.hud.showDisconnected(reason || CLOSE_REASON[code]);
    });

    this.hud.show();
    this.hud.onChat((text) => room.send(ClientMsg.Chat, { text }));
    this.hud.onSpell((id) => this.castSpell(id));
    this.hud.onWardrobe(() => this.wardrobe.toggle());
    this.hud.onRanking(() => this.ranking.toggle());
    this.hud.onShop(() => this.openShop(true));
    this.hud.onInventory(() => this.toggleInventory());
    this.hud.onQuests(() => this.questLog.toggle());
    this.hud.onCheckin(() => this.checkin.toggle());
    // Clique no orbe (ou Q/E) toma a melhor poção que o nível permite.
    element(".orb-hp").addEventListener("click", () => room.send(ClientMsg.QuickPotion, { kind: "hp" }));
    element(".orb-mana").addEventListener("click", () => room.send(ClientMsg.QuickPotion, { kind: "mana" }));
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
        if (this.checkin.isOpen) this.checkin.close();
        else if (this.questLog.isOpen) this.questLog.close();
        else if (this.shop.isOpen) this.shop.close();
        else if (this.grimoire.isOpen) this.grimoire.close();
        else if (this.ranking.isOpen) this.ranking.close();
        else if (this.inventory.isOpen) this.inventory.close();
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
      toggleShop: () => this.openShop(true),
      toggleInventory: () => this.toggleInventory(),
      toggleQuests: () => this.questLog.toggle(),
      toggleCheckin: () => this.checkin.toggle(),
      potion: (kind) => room.send(ClientMsg.QuickPotion, { kind }),
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
    // Depois de mover a câmera: monta o que entrou na tela e tira o que saiu.
    this.grid?.update(this.cameras.main, (chunk) => this.showChunk(chunk), (chunk) => this.hideChunk(chunk));
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

  /**
   * Prepara o mundo atual. O chão e o cenário não são desenhados aqui: cada bloco se monta
   * na primeira vez que entra na tela, e o laço de atualização cuida de quem entra e quem sai.
   */
  private drawWorld() {
    const token = ++this.drawToken;
    for (const parts of this.chunks) {
      for (const layer of parts.layers) layer.destroy();
      for (const item of parts.scenery) item.destroy();
    }
    for (const item of this.portalLayer) item.destroy();
    this.portalLayer = [];

    const { width, height } = this.worldMap;
    this.grid = new ChunkGrid(width, height, TALLEST_PROP);
    // Cada camada de chão ocupa uma faixa de profundidade própria, larga o bastante para
    // caber a ordem de todos os blocos sem uma camada invadir a outra.
    this.chunkSpan = (this.grid.cols + this.grid.rows) * this.grid.cols + this.grid.cols;
    this.chunks = this.grid.boxes.map(() => ({ built: false, layers: [], scenery: [], flames: [], water: [], foam: [] }));
    void this.drawPortals(token);
  }

  /** Portais: arco de pedra com um redemoinho girando dentro, círculo mágico no chão e o nome por cima. */
  private async drawPortals(token: number) {
    const arch = this.portals.length > 0 ? await this.spriteTextures.acquire("object_portal").catch(() => undefined) : undefined;
    // O mundo pode ter mudado enquanto o arco carregava.
    if (token !== this.drawToken) return;
    for (const portal of this.portals) {
      const screen = tileToScreen(portal.x, portal.y);
      // Portal com nível mínimo é dourado; os livres são roxos.
      const locked = portal.minLevel > 0;
      const tint = locked ? 0xffc857 : 0xb07dff;
      const deep = locked ? 0xff7a2a : 0x5f3cff;
      // Meio do vão do arco, onde mora o redemoinho.
      const heart = { x: screen.x, y: screen.y - PORTAL_EYE };

      const rune = this.add
        .image(screen.x, screen.y, "fx_rune")
        .setTint(tint)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH_DECAL + 1)
        .setScale(86 / 256, 42 / 256)
        .setAlpha(0.3);
      const spin = { angle: 0 };
      this.tweens.add({
        targets: spin,
        angle: Math.PI * 2,
        duration: 9000,
        repeat: -1,
        onUpdate: () => rune.setRotation(spin.angle),
      });
      this.portalLayer.push(rune);

      // Dois redemoinhos girando em sentidos contrários: o de fora escuro, o de dentro aceso.
      for (const [size, alpha, duration, color] of [
        [1, 0.5, 7000, deep],
        [0.7, 0.72, -4600, tint],
      ] as const) {
        const swirl = this.add
          .image(heart.x, heart.y, "fx_vortex")
          .setTint(color)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDisplaySize(PORTAL_EYE_W * size, PORTAL_EYE_H * size)
          .setAlpha(alpha)
          .setDepth(screen.y + 0.3);
        const turn = { angle: 0 };
        this.tweens.add({
          targets: turn,
          angle: Math.sign(duration) * Math.PI * 2,
          duration: Math.abs(duration),
          repeat: -1,
          onUpdate: () => swirl.setRotation(turn.angle),
        });
        this.portalLayer.push(swirl);
      }

      const floor = this.add
        .image(screen.x, screen.y + 2, "fx_glow")
        .setTint(tint)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH_DECAL + 2)
        .setScale(1.5, 0.5)
        .setAlpha(0.4);
      this.tweens.add({ targets: floor, alpha: 0.18, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.portalLayer.push(floor);

      const glow = this.add
        .image(heart.x, heart.y, "fx_glow")
        .setTint(0xffffff)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(screen.y + 0.4)
        .setScale(0.55, 0.7)
        .setAlpha(0.45);
      this.tweens.add({ targets: glow, alpha: 0.18, scale: 0.8, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.portalLayer.push(glow);

      if (arch) {
        const { meta } = arch;
        this.portalLayer.push(
          this.add
            .image(screen.x, screen.y, arch.key, frameKey("idle", "S", 0))
            .setOrigin(meta.anchorX / meta.cellW, meta.anchorY / meta.cellH)
            .setDepth(screen.y),
        );
      }

      // Faíscas subindo pelo vão e sumindo no alto do arco.
      const sparks = this.add.particles(heart.x, heart.y + 16, "fx_glow", {
        x: { min: -11, max: 11 },
        y: { min: -8, max: 8 },
        speedY: { min: -46, max: -16 },
        lifespan: { min: 800, max: 1400 },
        scale: { start: 0.13, end: 0 },
        alpha: { start: 0.85, end: 0 },
        tint: [tint, 0xffffff],
        blendMode: Phaser.BlendModes.ADD,
        frequency: 130,
      });
      sparks.setDepth(screen.y + 0.5);
      this.portalLayer.push(sparks);

      const title = portal.name || "Portal";
      const label = portal.minLevel > 0 ? `${title}\nnível ${portal.minLevel}` : title;
      const text = this.add
        .text(screen.x, screen.y - 86, label, {
          fontFamily: GAME_FONT,
          fontSize: "12px",
          fontStyle: "bold",
          color: portal.minLevel > 0 ? "#ffe3a3" : "#e6d2ff",
          stroke: "#1a1030",
          strokeThickness: 4,
          align: "center",
        })
        .setOrigin(0.5, 1)
        .setResolution(TEXT_RESOLUTION)
        .setDepth(DEPTH_FLOATING);
      this.portalLayer.push(text);
    }
  }

  /**
   * Conta quantos tiles cabem na tela e avisa o servidor, que manda só o que couber ali.
   * A tela é um losango: a largura mede no eixo (x − y) e a altura no eixo (x + y).
   */
  private sendView() {
    if (!this.room) return;
    const camera = this.cameras.main;
    const u = Math.ceil(camera.width / camera.zoom / TILE_W);
    const v = Math.ceil(camera.height / camera.zoom / TILE_H);
    if (u === this.sentView.u && v === this.sentView.v) return;
    this.sentView = { u, v };
    this.room.send(ClientMsg.View, { u, v } satisfies ViewMessage);
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

  /**
   * Monta o chão e o cenário de um bloco. Só acontece na primeira vez que o bloco aparece
   * na tela: mundo grande tem 81 blocos e o jogador normalmente visita poucos.
   */
  private buildChunk(index: number) {
    const parts = this.chunks[index];
    if (!parts || parts.built) return;
    parts.built = true;
    this.buildChunkGround(index, parts);
    void this.buildChunkScenery(index, parts, this.drawToken);
  }

  private buildChunkGround(index: number, parts: ChunkParts) {
    const grid = this.grid!;
    const box = grid.boxes[index];
    const { width, height, ground } = this.worldMap;
    const span = this.chunkSpan;
    // Ordem de desenho entre blocos, igual à de tile a tile: primeiro a diagonal, depois o x.
    const col = index % grid.cols;
    const row = (index - col) / grid.cols;
    const order = (col + row) * grid.cols + col;
    const depthOf = (layer: number) => DEPTH_GROUND + layer * span + order;

    const land = this.add.blitter(0, 0, "ground").setDepth(depthOf(2));
    parts.layers.push(land);
    const layers = new Map<number, { slow: boolean; waves: Phaser.GameObjects.Blitter; shallow: Phaser.GameObjects.Blitter; foam: Phaser.GameObjects.Blitter }>();
    const liquidLayer = (type: Ground, liquid: Liquid, slow: boolean) => {
      let layer = layers.get(type);
      if (layer) return layer;
      layer = {
        slow,
        waves: this.add.blitter(0, 0, liquid.key).setDepth(depthOf(0)),
        shallow: this.add.blitter(0, 0, `${liquid.key}_shallow`).setDepth(depthOf(1)),
        foam: this.add.blitter(0, 0, `${liquid.key}_foam`).setDepth(depthOf(3)),
      };
      layers.set(type, layer);
      parts.layers.push(layer.waves, layer.shallow, layer.foam);
      return layer;
    };

    // Por diagonais (x + y) para os losangos de baixo sobreporem os de cima.
    for (let sum = box.x0 + box.y0; sum <= box.x1 + box.y1; sum++) {
      for (let x = Math.max(box.x0, sum - box.y1); x <= Math.min(box.x1, sum - box.y0); x++) {
        const y = sum - x;
        const type = ground[y * width + x] as Ground;
        const screen = tileToScreen(x, y);
        const left = screen.x - TILE_CELL_W / 2;
        const top = screen.y - TILE_CELL_H / 2;

        const liquid = LIQUIDS.find((entry) => entry.ground === type);
        if (!liquid) {
          const frame = GROUND_FRAME[type as keyof typeof GROUND_FRAME];
          land.create(left, top, `${frame}_${tileHash(x, y) % GROUND_FRAMES[frame]}`);
          continue;
        }

        // Para um líquido, "terra" é tudo o que não for ele mesmo (lava encostada na água também tem beira).
        const isLand = (tx: number, ty: number) =>
          tx >= 0 && ty >= 0 && tx < width && ty < height && ground[ty * width + tx] !== type;
        const { waves, shallow, foam, slow } = liquidLayer(type, liquid.liquid, liquid.slow);
        const prefix = waterFramePrefix(x, y);
        parts.water.push({ bob: waves.create(left, top, `${prefix}${this.liquidFrame(slow)}`), prefix, slow });

        const touching = SHORE_EDGES.map((edge) => isLand(x + edge.dx, y + edge.dy));
        const corners = SHORE_CORNERS.filter(
          (corner) => isLand(x + corner.dx, y + corner.dy) && !touching[corner.sides[0]] && !touching[corner.sides[1]],
        ).map((corner) => corner.part);
        const edges = SHORE_EDGES.filter((_, index) => touching[index]).map((edge) => edge.part);
        for (const part of [...edges, ...corners]) {
          const frame = foamFrameName(part, (slow ? this.foamFrame >> 1 : this.foamFrame) % FOAM_FRAMES);
          parts.foam.push({ bob: foam.create(left, top, frame), part, slow });
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

  private async buildChunkScenery(index: number, parts: ChunkParts, token: number) {
    const grid = this.grid!;
    const box = grid.boxes[index];
    const { width, objects } = this.worldMap;
    const ids = new Set<string>();
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        const prop = OBJECT_PROPS[objects[y * width + x] as Obj];
        if (prop) ids.add(prop.id);
      }
    }
    if (ids.size === 0) return;
    const loaded = await Promise.all([...ids].map((id) => this.spriteTextures.acquire(id)));
    // O mundo pode ter mudado enquanto os desenhos carregavam.
    if (token !== this.drawToken) return;
    const textures = new Map(loaded.map((texture) => [texture.meta.id, texture]));

    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        const prop = OBJECT_PROPS[objects[y * width + x] as Obj];
        const texture = prop ? textures.get(prop.id) : undefined;
        if (!prop || !texture) continue;
        const { meta } = texture;
        const hash = tileHash(x, y);
        const variant = (hash >>> 3) % (meta.anims.idle?.frames ?? 1);
        const screen = tileToScreen(x, y);
        parts.scenery.push(
          this.add
            .image(screen.x, screen.y, texture.key, frameKey("idle", "S", variant))
            .setOrigin(meta.anchorX / meta.cellW, meta.anchorY / meta.cellH)
            .setFlipX(prop.flip === true && (hash & 1) === 1)
            .setDepth(prop.decal ? DEPTH_DECAL : screen.y),
        );
        if (prop.fire) this.lightBrazier(screen.x, screen.y, parts);
      }
    }
    // O bloco pode ter saído de cena enquanto os desenhos carregavam.
    if (!this.grid!.isVisible(index)) this.hideChunk(index);
  }

  /** Põe o bloco em cena. As imagens voltam para a lista de exibição; os Blitters só reaparecem. */
  private showChunk(index: number) {
    const parts = this.chunks[index];
    if (!parts) return;
    if (!parts.built) {
      this.buildChunk(index);
      return;
    }
    for (const layer of parts.layers) layer.setVisible(true);
    for (const item of parts.scenery) this.children.add(item);
    for (const flame of parts.flames) flame.resume();
  }

  /**
   * Tira o bloco de cena. As imagens de cenário saem da lista de exibição, e não só ficam
   * invisíveis: a lista é reordenada inteira a cada quadro em que alguém anda, e manter
   * milhares de objetos parados ali dentro custa essa ordenação de graça.
   */
  private hideChunk(index: number) {
    const parts = this.chunks[index];
    if (!parts || !parts.built) return;
    for (const layer of parts.layers) layer.setVisible(false);
    for (const item of parts.scenery) this.children.remove(item);
    for (const flame of parts.flames) flame.pause();
  }

  /** Chama viva na bacia do braseiro: brasa, língua de fogo e uma fagulha subindo. */
  private lightBrazier(x: number, y: number, parts: ChunkParts) {
    const bowl = y - BRAZIER_FLAME;
    const glow = this.add
      .image(x, bowl + 2, "fx_glow")
      .setTint(0xff8a2a)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(y + 0.2)
      .setScale(0.85, 0.7)
      .setAlpha(0.6);
    this.tweens.add({ targets: glow, alpha: 0.35, scale: 0.72, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    const flame = this.add.particles(x, bowl, "fx_glow", {
      x: { min: -5, max: 5 },
      y: { min: -2, max: 3 },
      speedY: { min: -38, max: -16 },
      lifespan: { min: 380, max: 680 },
      scale: { start: 0.3, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xffd27a, 0xff8a2a, 0xff5a1f],
      blendMode: Phaser.BlendModes.ADD,
      frequency: 55,
    });
    flame.setDepth(y + 0.3);
    parts.scenery.push(glow, flame);
    parts.flames.push(flame);
  }

  /** Quadro atual de um líquido. A lava conta devagar: um quadro a cada dois da água. */
  private liquidFrame(slow: boolean): number {
    return slow ? (this.waterFrame >> 1) % WATER_FRAMES : this.waterFrame % WATER_FRAMES;
  }

  /** Todos os tiles andam juntos: é o que mantém as ondas emendadas de um losango ao outro. */
  private animateWater() {
    this.waterFrame = (this.waterFrame + 1) % (WATER_FRAMES * 2);
    // Só os blocos na tela: o mundo do Vulcão tem 3.900 tiles de lava, e quase nenhum aparece.
    this.forEachVisibleChunk((parts) => {
      for (const { bob, prefix, slow } of parts.water) bob.setFrame(`${prefix}${this.liquidFrame(slow)}`);
    });
  }

  private animateFoam() {
    this.foamFrame = (this.foamFrame + 1) % (FOAM_FRAMES * 2);
    this.forEachVisibleChunk((parts) => {
      for (const { bob, part, slow } of parts.foam) {
        bob.setFrame(foamFrameName(part, (slow ? this.foamFrame >> 1 : this.foamFrame) % FOAM_FRAMES));
      }
    });
  }

  private forEachVisibleChunk(run: (parts: ChunkParts) => void) {
    const grid = this.grid;
    if (!grid) return;
    for (const index of grid.visibleChunks()) {
      const parts = this.chunks[index];
      if (parts?.built) run(parts);
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
    this.grimoire.setLevel((actor.data as PlayerData).level);
    this.wardrobe.setPlayer(actor.data as PlayerData);
    this.inventory.setPlayer(actor.data as PlayerData);
    this.questLog.setPlayer(actor.data as PlayerData);
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

  /** Equipamentos: fecha os outros painéis grandes, que ocupam o mesmo lugar. */
  private toggleInventory() {
    if (this.inventory.isOpen) {
      this.inventory.close();
      return;
    }
    this.wardrobe.close();
    this.grimoire.close();
    this.ranking.close();
    this.inventory.open();
  }

  /** Loja de diamantes por cima de tudo: fecha os outros painéis grandes. */
  private openShop(toggle = false) {
    if (toggle && this.shop.isOpen) {
      this.shop.close();
      return;
    }
    this.wardrobe.close();
    this.grimoire.close();
    this.ranking.close();
    this.shop.open();
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
    if (event.kind === "crit") {
      // Crítico: número grande e laranja, com a palavra por cima e um tranco na câmera de quem bateu.
      this.floatingText(x, top - 4, String(event.amount), "#ff6a2c", 26, 46, 1200);
      this.floatingText(x, top - 26, "CRÍTICO!", "#ffd54a", 13, 46, 1000);
      this.burst(x, middle, { tints: [0xffd54a, 0xff6a2c, 0xffffff], count: 18, speed: 220 });
      if (event.attacker === this.localId) this.cameras.main.shake(70, 0.0025);
    } else {
      this.floatingText(x, top, String(event.amount), isLocal ? "#ff5a4f" : "#ffe27a", 17);
    }
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
    if (this.inventory.isOpen) this.inventory.showStatus(event.message, event.ok);
    else this.wardrobe.showStatus(event.message, event.ok);
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
    const screen = tileToScreen(event.x, event.y);
    if (event.kind === "item") {
      const item = gearItem(event.item ?? "");
      if (!item) return;
      const rarity = RARITY[item.rarity];
      const big = item.rarity !== "comum";
      this.burst(screen.x, screen.y - 14, {
        tints: [rarity.color, 0xffffff],
        count: big ? 34 : 14,
        speed: big ? 220 : 110,
        gravityY: 200,
        lifespan: 800,
        angle: { min: 200, max: 340 },
      });
      const mine = event.id === this.localId;
      this.floatingText(screen.x, screen.y - 30, item.name, rarityCss(item.rarity), mine ? 16 : 12, 44, mine ? 1500 : 900);
      return;
    }
    const def = LOOT[event.kind];
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

  /** Baforada ou explosão de monstro: as mesmas explosões dos poderes, nas casas atingidas. */
  private onMonsterSpell(event: MonsterSpellEvent) {
    const now = this.time.now;
    const caster = this.actors.get(event.caster);
    caster?.play("attack", now);
    const from = caster ? caster.position(now) : tileToScreen(event.x, event.y);
    const target = tileToScreen(event.x, event.y);
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < event.tiles.length; i += 2) points.push(tileToScreen(event.tiles[i]!, event.tiles[i + 1]!));
    // Treme a tela de quem está dentro da área.
    const local = this.actors.get(this.localId);
    const me = local ? { x: local.tileX, y: local.tileY } : null;
    let hitsMe = false;
    for (let i = 0; me && i + 1 < event.tiles.length; i += 2) if (event.tiles[i] === me.x && event.tiles[i + 1] === me.y) hitsMe = true;
    if (event.kind === "wave") this.fx.wave(from, points, event.element);
    else if (event.kind === "blast") this.fx.tileBursts(points, target, event.element, { speed: 1.1, jitter: 60 });
    else this.fx.tileBursts(points, from, event.element, { speed: 0.9, jitter: 80 });
    if (hitsMe) this.cameras.main.shake(220, 0.007);
  }

  private onSpellEffect(event: SpellEffectEvent) {
    const now = this.time.now;
    const caster = this.actors.get(event.caster);
    caster?.play(event.spell === "heal" ? "cast" : "attack", now);
    const from = caster ? caster.position(now) : tileToScreen(event.x, event.y);
    const at = tileToScreen(event.x, event.y);
    const local = event.caster === this.localId;

    const spell = spellById(event.spell);
    // Casas atingidas, em coordenadas da tela: cada uma ganha uma explosão.
    const tiles = event.tiles ?? [];
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < tiles.length; i += 2) points.push(tileToScreen(tiles[i]!, tiles[i + 1]!));
    const element = spell?.element ?? "fire";
    switch (spell?.family) {
      case "heal":
        this.fx.heal(from);
        return;
      case "whirl":
        this.fx.whirl(from);
        this.fx.tileBursts(points, from, "earth", { speed: 2, scale: 0.75, jitter: 40 });
        return;
      case "quake":
        this.fx.quake(from, local);
        this.fx.tileBursts(points, from, "earth", { speed: 0.9, scale: 0.9, jitter: 80 });
        return;
      case "bolt":
        this.fx.fireball(from, at);
        return;
      case "drain":
        this.fx.drain(from, at);
        return;
      case "storm":
        this.fx.storm(from, (spell.range + 0.5) * 64, local);
        this.fx.tileBursts(points, from, "energy", { speed: 0.6, jitter: 500 });
        return;
      case "flame":
        caster?.play("cast", now);
        this.fx.wave(from, points, element);
        if (local) this.cameras.main.shake(160, 0.004);
        return;
      case "frost":
        caster?.play("cast", now);
        this.fx.frost(from, at, points);
        return;
      case "inferno":
        caster?.play("cast", now);
        this.fx.inferno(from, points, local);
        return;
    }
    if (points.length > 0) this.fx.tileBursts(points, from, element);
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
