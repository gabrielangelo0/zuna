import { Room, ServerError, type Client } from "colyseus";
import {
  QUEST_ALTAR_RANGE,
  QUEST_BOSS_COOLDOWN_MS,
  questProgressOf,
  questWaiting,
  type QuestBossMessage,
  type QuestClaimMessage,
  type CheckinEvent,
  type MilestonesEvent,
  type VocationMessage,
  type ViewMessage,
  type PvpInfoEvent,
  type VipEvent,
  type ArenaEvent,
  type ArenaFightEvent,
  type ArenaFightMessage,
  type ArenaOpenMessage,
  type ArenaOpponent,
  type VipBuyMessage,
  checkinDayKey,
  vocationById,
  vocationFamilies,
  vocationStats,
  liveVocations,
  type QuestProgress,
  type QuestsEvent,
  cone,
  square,
  type MonsterSpellEvent,
  CRIT_CHANCE,
  arenasFor,
  CRIT_MULTIPLIER,
  spellArea,
  BAG_BASE,
  BAG_MAX,
  EQUIP_SLOTS,
  POTION_COOLDOWN_MS,
  SLOT_LABEL,
  bagCapacity,
  dropCount,
  looksOf,
  type ItemMoveMessage,
  type ItemUseMessage,
  type QuickPotionMessage,
  type ShotEvent,
  MONSTER_LEVEL,
  RARITY,
  gearItem,
  gearList,
  rollGear,
  sumStats,
  type EquipSlot,
  type GearCatalogEvent,
  type GearStats,
  type InventoryEvent,
  type ItemBuyMessage,
  type ItemEquipMessage,
  type ItemSellMessage,
  type OwnedItem,
  type PlayerStats,
  CHASE_LOSE_RANGE,
  VIEW_SYNC_MS,
  CHAT_MAX_LEN,
  ClientMsg,
  DEATH_XP_LOSS,
  DEFAULT_APPEARANCE,
  DIRS,
  LOOT,
  LOOT_OWNER_MS,
  LOOT_TTL_MS,
  MONSTERS,
  PLAYER_ATTACK_MS,
  PLAYER_STEP_MS,
  ServerMsg,
  TICK_MS,
  buildWorldMap,
  catalogItem,
  chebyshev,
  describeDrop,
  dirIndex,
  findPath,
  healAmount,
  levelForXp,
  ownsItem,
  parseAppearance,
  playerStats,
  randInt,
  rollDrops,
  sanitizeShortcuts,
  spellById,
  spellUnlocked,
  spellsUnlockedAt,
  stepDuration,
  xpForLevel,
  type AnnounceEvent,
  type AppearanceMessage,
  type BuyMessage,
  type CatalogEvent,
  type CatalogOverride,
  type ChatChannel,
  type ChatEvent,
  type ChatMessage,
  type DropRoll,
  type EquipMessage,
  type GotoMessage,
  type GroundItemDef,
  type HitEvent,
  type HitKind,
  type ItemKind,
  type JoinOptions,
  type LevelUpEvent,
  type LootEvent,
  type MonsterDeathEvent,
  type MonsterDef,
  type MonsterKind,
  type MoveMessage,
  type PortalDef,
  type PlayerDeathEvent,
  type Point,
  type ProfileEvent,
  type PurchaseEvent,
  type SpellEffectEvent,
  type SpellId,
  type SpellMessage,
  type ShortcutsMessage,
  type SpawnDef,
  type TargetMessage,
  type TravelEvent,
  type WorldBlueprint,
  type WorldPatchEvent,
  type XpEvent,
  canAttack,
  marksAttacker,
  droppableItems,
  hasProtection,
  PROTECTION_ITEM,
  type Fighter,
  type VipTier,
  vipDaysLeft,
  vipPurchase,
} from "@zuna/shared";
import {
  arenaBoard,
  arenaDay,
  arenaList,
  arenaOpponents,
  arenaSeason,
  arenaSettings,
  entriesLeft,
  entriesTotal,
  refreshSnapshot,
  resolveFight,
  selfOpponent,
  settleSeasons,
  standingOf,
} from "./arena.ts";
import { accountFromToken } from "./auth.ts";
import { EventManager } from "./events.ts";
import { allQuests, listQuestProgress, liveQuests, questById, saveQuestProgress } from "./quests.ts";
import { checkinDaysAll, checkinSettings, checkinStateFor, claimCheckin } from "./checkin.ts";
import { claimMilestones, levelRewardsAll, pendingMilestones, takenMilestones, xpRate } from "./progress.ts";
import { pvpSettings, recordPvpKill } from "./pvp.ts";
import { rankOf, vipPass, vipPassesOnSale, vipTier, vipTiersAll } from "./vip.ts";
import { chargeDiamonds, saveCharacterVocation, vocationChangeCost, vocationSettings } from "./vocations.ts";
import {
  addCharacterItem,
  buyGearWithDiamonds,
  gearSettings,
  listCharacterItems,
  removeCharacterItem,
  saveCharacterItem,
} from "./gear.ts";
import {
  registerLiveRoom,
  unregisterLiveRoom,
  type LiveAccountPatch,
  type LiveCharacterPatch,
  type LiveCommand,
  type LiveEvent,
  type LiveEventResult,
  type LiveRoom,
  type LiveWorldPart,
} from "./live.ts";
import {
  accountBan,
  addDiamonds,
  appearanceFromRow,
  getAccount,
  listUnlocks,
  loadCharacter,
  markLogin,
  purchaseItem,
  saveCharacter,
  type CharacterRow,
  type CharacterSnapshot,
  purchaseVip,
  claimVipChest,
  vipChestDay,
} from "./repository.ts";
import { StateView } from "@colyseus/schema";
import { LootState, MonsterState, PlayerState, WorldState } from "./schema.ts";
import { generateSpawns } from "./spawns.ts";
import { DEFAULT_VIEW, clampView, inView, type ViewWindow } from "./interest.ts";
import { blueprintOf, getWorld, loadAllWorlds, loadWorldContent, type WorldContent } from "./worldRepository.ts";
import {
  blockedForMonster,
  blockedForPlayer,
  createSim,
  findFreeTile,
  freeLootTile,
  indexPortals,
  inSafe,
  occupyPlayer,
  playersOn,
  portalAt,
  tileKey,
  walkable,
  type WorldSim,
} from "./worldSim.ts";

/** Multiplicador global de XP ("rate" do servidor). */
const XP_RATE = Number(process.env.XP_RATE) || 1;
/** Comandos de teste no chat (/evento, /xp, /ouro, /diamantes). Ligados só fora de produção; DEV_COMMANDS=0 ou 1 força. */
const DEV_COMMANDS = process.env.DEV_COMMANDS ? process.env.DEV_COMMANDS !== "0" : process.env.NODE_ENV !== "production";
const AUTOSAVE_MS = 60_000;
const MAX_TEST_GRANT = 100_000_000;
/** Roupa para quem teve um item tirado pelo painel. */
const FREE_OUTFIT = "aventureiro";

/** Aviso de conta bloqueada, com o motivo quando o administrador escreveu um. */
export function banMessage(reason: string): string {
  return reason ? `Sua conta está bloqueada: ${reason}` : "Sua conta está bloqueada.";
}

/** Atributos do nível somados aos dos equipamentos. */
function withGear(base: PlayerStats, gear: GearStats): PlayerStats {
  return {
    maxHp: base.maxHp + gear.hp,
    maxMana: base.maxMana + gear.mana,
    maxDamage: base.maxDamage + gear.attack,
    armor: base.armor + gear.defense,
  };
}

function equippedStats(items: readonly OwnedItem[]): GearStats {
  return sumStats(items.filter((item) => item.equipped !== "").map((item) => gearItem(item.itemId)));
}

const pendingWrites = new Set<Promise<void>>();
/** Última gravação de cada personagem: quem entra de novo espera a saída anterior terminar de salvar. */
const lastWriteByCharacter = new Map<number, Promise<void>>();

/** Espera as gravações em andamento de todas as salas (usado antes de fechar o banco). */
export async function waitForPendingWrites() {
  while (pendingWrites.size > 0) await Promise.all([...pendingWrites]);
}

interface AuthData {
  accountId: number;
  character: CharacterRow;
}

interface PlayerSim {
  id: string;
  client: Client;
  state: PlayerState;
  /** Mundo onde o personagem está agora. */
  world: WorldSim;
  accountId: number;
  /** Nome da conta, para o painel. */
  username: string;
  characterId: number;
  unlocks: Set<string>;
  diamonds: number;
  /** Classe do personagem (vazio = ainda não escolheu). */
  vocation: string;
  /** Monstros derrubados (o golpe final vale para quem mais causou dano). */
  kills: number;
  /** Poderes na barra, na ordem das teclas. */
  shortcuts: string[];
  /** Equipamentos do personagem (equipados e na mochila). */
  items: OwnedItem[];
  /** Soma dos atributos dos equipados. */
  gear: GearStats;
  /** Último aviso de mochila cheia (para não repetir a cada passo). */
  bagFullWarnAt: number;
  /** Próxima poção liberada. */
  nextPotionAt: number;
  /** Andamento das missões deste personagem. */
  questProgress: QuestProgress[];
  /** Tamanho da tela do jogador, em tiles: define o que o servidor manda para ele. */
  view: ViewWindow;
  /** Entidades que já estão na StateView dele, para mandar só a diferença. */
  seen: Set<string>;
  /** Próximo recálculo da visão. */
  nextViewAt: number;
  path: Point[];
  moveDir: Point | null;
  nextStepAt: number;
  nextAttackAt: number;
  nextChaseAt: number;
  spellReadyAt: Map<SpellId, number>;
  chatReadyAt: number;
  /** Silenciado por um administrador até este instante. */
  mutedUntil: number;
  /** Portais só levam de novo depois deste instante (evita ir e voltar sem parar). */
  nextPortalAt: number;
  /** Marca de agressor em PvP vence neste instante (0 = sem marca). */
  markedUntil: number;
  /** Degrau de VIP da conta ("" = não é VIP) e quando o passe termina. */
  vipTier: string;
  vipUntil: number;
  /** Quando cada outro jogador bateu neste aqui pela última vez: é o que define revide. */
  attackedBy: Map<string, number>;
  /** Operações de banco deste personagem, em fila: nunca duas ao mesmo tempo. */
  queue: Promise<void>;
}

export interface MonsterSim {
  id: string;
  def: MonsterDef;
  state: MonsterState;
  world: WorldSim;
  home: Point;
  respawns: boolean;
  /** Ninho do editor de mapa que criou este monstro (0 = nenhum). */
  nestId: number;
  targetId: string | null;
  path: Point[];
  pathGoal: Point | null;
  nextStepAt: number;
  nextAttackAt: number;
  nextThinkAt: number;
  /** Próximo ataque especial em área liberado. */
  nextSpecialAt: number;
  /** Chefe de desafio: multiplica vida, dano e XP, e conta a missão de quem o derrubar. */
  scale: number;
  questId: number;
  /** Dano causado por cada jogador: a XP é dividida nessa proporção. */
  damageBy: Map<string, number>;
  onDeath?: () => void;
}

/** Alvo de um golpe: monstro ou jogador. O código de monstro não muda de forma por causa disto. */
type Combatant = MonsterSim | PlayerSim;

function isPlayerSim(target: Combatant): target is PlayerSim {
  return "client" in target;
}

interface Scheduled {
  at: number;
  run: () => void;
}

interface Bonuses {
  xp: number;
  gold: number;
  stepFactor: number;
}

/** Próximo passo mantendo a cadência quando o personagem anda sem parar. */
function nextStepTime(previous: number, now: number, duration: number): number {
  return (now - previous < TICK_MS ? previous : now) + duration;
}

function isReady(at: number, now: number): boolean {
  return now + TICK_MS / 2 >= at;
}

function parseTestAmount(argument: string): number | null {
  const amount = Math.trunc(Number(argument));
  return amount > 0 ? Math.min(amount, MAX_TEST_GRANT) : null;
}

export class WorldRoom extends Room<{ state: WorldState }> implements LiveRoom {
  maxClients = 150;

  /** Todos os mundos rodando nesta sala, por id e por chave. */
  private readonly worlds = new Map<number, WorldSim>();
  private readonly worldBySlug = new Map<string, WorldSim>();
  private readonly players = new Map<string, PlayerSim>();
  private readonly monsters = new Map<string, MonsterSim>();
  /** Reaproveitados a cada tick para não alocar conjunto novo 40 vezes por segundo. */
  private readonly povoados = new Set<WorldSim>();
  private readonly visivel = new Set<string>();
  private nextLootId = 1;
  private nextLootSweepAt = 0;
  private scheduled: Scheduled[] = [];
  private nextMonsterId = 1;
  private nextRegenAt = 0;
  private nextAutosaveAt = Date.now() + AUTOSAVE_MS;
  /** Chefe de desafio vivo agora, por missão, e quando cada um pode voltar. */
  private readonly bossQuests = new Map<number, string>();
  private readonly bossQuestReadyAt = new Map<number, number>();
  private eventManager!: EventManager;

  async onCreate() {
    const state = new WorldState();
    state.eventName = "";
    state.eventEndsAt = 0;
    state.xpMultiplier = 1;
    this.setState(state);

    for (const content of await loadAllWorlds()) this.startWorld(content);
    this.eventManager = new EventManager(this);
    await this.eventManager.load();

    this.onMessage(ClientMsg.Move, (client, message: MoveMessage) => this.handleMove(client, message));
    this.onMessage(ClientMsg.Goto, (client, message: GotoMessage) => this.handleGoto(client, message));
    this.onMessage(ClientMsg.Target, (client, message: TargetMessage) => this.handleTarget(client, message));
    this.onMessage(ClientMsg.Spell, (client, message: SpellMessage) => this.handleSpell(client, message));
    this.onMessage(ClientMsg.Chat, (client, message: ChatMessage) => this.handleChat(client, message));
    this.onMessage(ClientMsg.Appearance, (client, message: AppearanceMessage) => this.handleAppearance(client, message));
    this.onMessage(ClientMsg.Equip, (client, message: EquipMessage) => this.handleEquip(client, message));
    this.onMessage(ClientMsg.Buy, (client, message: BuyMessage) => this.handleBuy(client, message));
    this.onMessage(ClientMsg.ToggleMount, (client) => this.handleToggleMount(client));
    this.onMessage(ClientMsg.Shortcuts, (client, message: ShortcutsMessage) => this.handleShortcuts(client, message));
    this.onMessage(ClientMsg.ItemEquip, (client, message: ItemEquipMessage) => this.handleItemEquip(client, message));
    this.onMessage(ClientMsg.ItemMove, (client, message: ItemMoveMessage) => this.handleItemMove(client, message));
    this.onMessage(ClientMsg.ItemUse, (client, message: ItemUseMessage) => this.handleItemUse(client, message));
    this.onMessage(ClientMsg.QuickPotion, (client, message: QuickPotionMessage) => this.handleQuickPotion(client, message));
    this.onMessage(ClientMsg.QuestClaim, (client, message: QuestClaimMessage) => this.handleQuestClaim(client, message));
    this.onMessage(ClientMsg.QuestBoss, (client, message: QuestBossMessage) => this.handleQuestBoss(client, message));
    this.onMessage(ClientMsg.CheckinClaim, (client) => void this.handleCheckinClaim(client));
    this.onMessage(ClientMsg.Vocation, (client, message: VocationMessage) => void this.handleVocation(client, message));
    this.onMessage(ClientMsg.ItemSell, (client, message: ItemSellMessage) => this.handleItemSell(client, message));
    this.onMessage(ClientMsg.ItemBuy, (client, message: ItemBuyMessage) => this.handleItemBuy(client, message));
    this.onMessage(ClientMsg.View, (client, message: ViewMessage) => this.handleView(client, message));
    this.onMessage(ClientMsg.VipBuy, (client, message: VipBuyMessage) => this.handleVipBuy(client, message));
    this.onMessage(ClientMsg.VipClaim, (client) => this.handleVipClaim(client));
    this.onMessage(ClientMsg.ArenaOpen, (client, message: ArenaOpenMessage) => this.handleArenaOpen(client, message));
    this.onMessage(ClientMsg.ArenaFight, (client, message: ArenaFightMessage) => this.handleArenaFight(client, message));

    this.setPatchRate(TICK_MS);
    this.setSimulationInterval(() => this.tick(), TICK_MS);
    registerLiveRoom(this);
  }

  // ------------------------------------------------------------ mundos

  /** Levanta um mundo do banco: terreno, ninhos de monstro e tesouros no chão. */
  private startWorld(content: WorldContent): WorldSim {
    const sim = createSim(content);
    this.worlds.set(sim.def.id, sim);
    this.worldBySlug.set(sim.def.slug, sim);
    this.populate(sim);
    return sim;
  }

  /** Enche o mundo: ninhos do editor, tesouros e, se o mundo pedir, monstros espalhados sozinhos. */
  private populate(sim: WorldSim) {
    if (sim.def.autoSpawns) {
      for (const spawn of generateSpawns(sim.def, sim.map)) this.spawnMonster(sim, spawn.kind, spawn, { respawns: true });
    }
    for (const nest of sim.spawns) {
      for (let i = 0; i < nest.amount; i++) this.spawnFromNest(sim, nest);
    }
    for (const item of sim.items) this.spawnGroundItem(sim, item);
  }

  /** Mundo onde os personagens novos nascem. */
  private defaultWorld(): WorldSim {
    for (const sim of this.worlds.values()) if (sim.def.isDefault) return sim;
    return [...this.worlds.values()][0];
  }

  /** O mundo pedido, ou o padrão quando ele sumiu ou está fechado. */
  private worldFor(worldId: number, admin = false): WorldSim {
    const sim = this.worlds.get(worldId);
    if (sim && (admin || sim.def.published)) return sim;
    return this.defaultWorld();
  }

  /** Tira do mundo tudo o que estava nele: usado ao recarregar ou apagar. */
  private clearWorld(sim: WorldSim) {
    for (const monster of [...this.monsters.values()]) {
      if (monster.world === sim) this.removeMonster(monster.id);
    }
    for (const [id, loot] of [...this.state.loot]) {
      if (loot.world === sim.def.slug) this.removeLoot(sim, id, tileKey(sim, loot.x, loot.y));
    }
    sim.nestAlive.clear();
    sim.itemLoot.clear();
    sim.itemOfLoot.clear();
    sim.itemReadyAt.clear();
  }

  /**
   * O painel salvou um mundo: monta o terreno de novo e manda o desenho para quem está jogando.
   * `full` repõe também monstros e tesouros (pintar o mapa não precisa disso).
   */
  async reloadWorld(worldId: number, full = true) {
    const existing = this.worlds.get(worldId);
    const world = await getWorld(worldId);
    if (!world) {
      if (existing) this.dropWorld(existing);
      return;
    }
    const content = await loadWorldContent(world);

    if (!existing) {
      this.startWorld(content);
      this.broadcast(ServerMsg.WorldPatch, { blueprint: blueprintOf(content) } satisfies WorldPatchEvent);
      return;
    }

    const sim = existing;
    // Mudar tamanho, semente ou terreno refaz o mapa inteiro: nada pode continuar no lugar antigo.
    const reshaped =
      sim.def.width !== world.width ||
      sim.def.height !== world.height ||
      sim.def.seed !== world.seed ||
      sim.def.style !== world.style ||
      sim.def.spawnX !== world.spawnX ||
      sim.def.spawnY !== world.spawnY ||
      sim.def.townRadius !== world.townRadius;
    const rebuild = full || reshaped;

    if (rebuild) this.clearWorld(sim);
    this.worldBySlug.delete(sim.def.slug);
    sim.def = content.world;
    sim.tiles = content.tiles;
    sim.portalList = content.portals;
    sim.spawns = content.spawns;
    sim.items = content.items;
    sim.map = buildWorldMap(blueprintOf(content));
    indexPortals(sim);
    this.worldBySlug.set(sim.def.slug, sim);

    if (rebuild) {
      sim.monsterAt.clear();
      sim.lootAt.clear();
      sim.playersAt.clear();
      this.populate(sim);
    } else {
      this.settleWorld(sim);
    }

    const home = this.defaultWorld();
    for (const player of this.players.values()) {
      if (player.world !== sim) continue;
      if (!sim.def.published && sim !== home) {
        this.travel(player, home, home.def.spawnX, home.def.spawnY);
        continue;
      }
      player.state.world = sim.def.slug;
      const x = Math.min(player.state.x, sim.map.width - 1);
      const y = Math.min(player.state.y, sim.map.height - 1);
      if (rebuild || !walkable(sim, x, y)) this.travel(player, sim, x, y);
    }
    this.broadcast(ServerMsg.WorldPatch, { blueprint: blueprintOf(content) } satisfies WorldPatchEvent);
  }

  /** Depois de repintar o terreno: tira monstros e tesouros de tiles que viraram parede ou água. */
  private settleWorld(sim: WorldSim) {
    const now = Date.now();
    for (const monster of [...this.monsters.values()]) {
      if (monster.world !== sim || walkable(sim, monster.state.x, monster.state.y)) continue;
      const spot = findFreeTile(sim, monster.state.x, monster.state.y, true, 6);
      if (spot) this.moveMonster(monster, spot.x, spot.y, now);
      else this.removeMonster(monster.id);
    }
    for (const [id, loot] of [...this.state.loot]) {
      if (loot.world !== sim.def.slug || walkable(sim, loot.x, loot.y)) continue;
      this.removeLoot(sim, id, tileKey(sim, loot.x, loot.y));
    }
  }

  /** O mundo foi apagado no painel: quem estava lá volta para o mundo padrão. */
  private dropWorld(sim: WorldSim) {
    this.clearWorld(sim);
    this.worlds.delete(sim.def.id);
    this.worldBySlug.delete(sim.def.slug);
    const home = this.defaultWorld();
    for (const player of this.players.values()) {
      if (player.world === sim) this.travel(player, home, home.def.spawnX, home.def.spawnY);
    }
  }

  /** Mundo onde as levas de um evento nascem (0 = o mundo padrão). */
  eventWorld(worldId: number): WorldSim | undefined {
    if (!worldId) return this.defaultWorld();
    const sim = this.worlds.get(worldId);
    return sim && sim.def.published ? sim : undefined;
  }

  /** Desenho atual de cada mundo, para o cliente montar o mapa. */
  blueprints(): WorldBlueprint[] {
    return [...this.worlds.values()].map((sim) => ({
      world: sim.def,
      tiles: sim.tiles,
      portals: sim.portalList,
    }));
  }

  /** Leva o personagem para outro ponto — no mesmo mundo ou em outro. */
  private travel(player: PlayerSim, sim: WorldSim, x: number, y: number) {
    const s = player.state;
    const from = player.world;
    // O destino pode vir de um mundo maior (painel, portal antigo): traz para dentro do mapa.
    const at = {
      x: Math.min(Math.max(0, Math.round(x)), sim.map.width - 1),
      y: Math.min(Math.max(0, Math.round(y)), sim.map.height - 1),
    };
    const spot = findFreeTile(sim, at.x, at.y, false) ?? findFreeTile(sim, sim.def.spawnX, sim.def.spawnY, false) ?? at;
    occupyPlayer(from, s.x, s.y, player.id, false);
    if (from !== sim) {
      for (const monster of this.monsters.values()) {
        if (monster.targetId === player.id) monster.targetId = null;
      }
      player.world = sim;
      s.world = sim.def.slug;
    }
    s.x = spot.x;
    s.y = spot.y;
    // Pulou para longe: refaz a visão agora, senão o mundo novo aparece vazio por um instante.
    player.nextViewAt = 0;
    occupyPlayer(sim, s.x, s.y, player.id, true);
    s.target = "";
    player.path = [];
    player.moveDir = null;
    player.nextPortalAt = Date.now() + 800;
    if (from === sim) return;
    player.client.send(ServerMsg.Travel, {
      world: sim.def.slug,
      x: s.x,
      y: s.y,
      name: sim.def.name,
    } satisfies TravelEvent);
    // As missões e a regra de PvP dependem do mundo: as duas vão de novo a cada viagem.
    this.sendQuests(player);
    this.sendPvp(player);
    void this.persist(player);
  }

  /** Alguém pisou num portal. */
  private enterPortal(player: PlayerSim, portal: PortalDef) {
    const target = this.worlds.get(portal.toWorldId);
    const label = portal.name || "o portal";
    if (!target || !target.def.published) {
      player.nextPortalAt = Date.now() + 3000;
      this.sendChat(player.client, "system", `${portal.name || "Este portal"} está fechado.`);
      return;
    }
    if (player.state.level < portal.minLevel) {
      player.nextPortalAt = Date.now() + 3000;
      this.sendChat(player.client, "system", `Você precisa do nível ${portal.minLevel} para atravessar ${label}.`);
      return;
    }
    const changed = target !== player.world;
    this.travel(player, target, portal.toX, portal.toY);
    this.sendChat(
      player.client,
      "event",
      changed ? `Você atravessou ${label} e chegou a ${target.def.name}.` : `Você atravessou ${label}.`,
    );
  }

  // ------------------------------------------------------------ painel de administração

  onlineCharacters(): number[] {
    return [...this.players.values()].map((player) => player.characterId);
  }

  private playerByCharacter(characterId: number): PlayerSim | undefined {
    return [...this.players.values()].find((entry) => entry.characterId === characterId);
  }

  /** Põe o personagem noutro tile sem deixar o mapa de ocupação desencontrado. */
  private placePlayer(player: PlayerSim, x: number, y: number) {
    this.travel(player, player.world, x, y);
  }

  /** O administrador mexeu num personagem que está online: vale na hora. */
  applyCharacter(characterId: number, patch: LiveCharacterPatch) {
    const player = this.playerByCharacter(characterId);
    if (!player) return;
    const s = player.state;
    if (patch.name !== undefined) s.name = patch.name;
    if (patch.gold !== undefined) s.gold = patch.gold;
    if (patch.kills !== undefined) player.kills = patch.kills;
    if (patch.xp !== undefined) s.xp = patch.xp;
    if (patch.pet !== undefined) s.pet = patch.pet;
    if (patch.mount !== undefined) {
      s.mount = patch.mount;
      if (!patch.mount) s.mounted = false;
    }
    if (patch.outfit !== undefined) {
      s.outfit = patch.outfit;
      player.unlocks.add(patch.outfit);
      this.sendProfile(player);
    }
    if (patch.x !== undefined || patch.y !== undefined) {
      this.placePlayer(player, patch.x ?? s.x, patch.y ?? s.y);
    }
    if (patch.level !== undefined && patch.level !== s.level) {
      s.level = patch.level;
      const stats = this.statsOf(player);
      s.maxHp = stats.maxHp;
      s.maxMana = stats.maxMana;
      s.hp = Math.min(s.hp, stats.maxHp) || stats.maxHp;
      s.mana = Math.min(s.mana, stats.maxMana);
      s.xp = Math.max(s.xp, xpForLevel(patch.level));
      player.shortcuts = sanitizeShortcuts(player.shortcuts, s.level, vocationFamilies(player.vocation));
      this.sendProfile(player);
      this.sendNear(player.world.def.slug, s.x, s.y, ServerMsg.LevelUp, { id: player.id, level: s.level } satisfies LevelUpEvent);
    }
    this.sendChat(player.client, "system", "Um administrador ajustou seu personagem.");
  }

  applyAccount(accountId: number, patch: LiveAccountPatch) {
    for (const player of this.players.values()) {
      if (player.accountId !== accountId) continue;
      if (patch.diamonds !== undefined) player.diamonds = patch.diamonds;
      if (patch.unlock) player.unlocks.add(patch.unlock);
      if (patch.revoke) {
        player.unlocks.delete(patch.revoke);
        // Quem perdeu o item não pode continuar usando: volta para o visual grátis.
        const s = player.state;
        if (s.outfit === patch.revoke) s.outfit = FREE_OUTFIT;
        if (s.pet === patch.revoke) s.pet = "";
        if (s.mount === patch.revoke) {
          s.mount = "";
          s.mounted = false;
        }
      }
      this.sendProfile(player);
      this.sendChat(player.client, "system", patch.notice ?? "Um administrador atualizou sua conta.");
    }
  }

  /** Presente do painel: entra na mochila de quem está online. Falso quando ele não está nesta sala. */
  giveItem(characterId: number, itemId: string): boolean {
    for (const player of this.players.values()) {
      if (player.characterId !== characterId) continue;
      const item = gearItem(itemId);
      if (!item) return true;
      this.grantItem(player, item.id);
      this.sendChat(player.client, "loot", `Um administrador te deu ${item.name}.`);
      return true;
    }
    return false;
  }

  /** O painel mexeu nos equipamentos: catálogo novo para todos e atributos recalculados. */
  sendGear() {
    this.broadcast(ServerMsg.Gear, { items: gearList() } satisfies GearCatalogEvent);
    for (const player of this.players.values()) this.refreshGear(player);
  }

  kickAccount(accountId: number, reason: string) {
    for (const player of [...this.players.values()]) {
      if (player.accountId === accountId) player.client.leave(4002, reason);
    }
  }

  /** Retrato desta sala para o painel. */
  liveWorld(): LiveWorldPart {
    const now = Date.now();
    const players = [...this.players.values()].map((player) => {
      const s = player.state;
      return {
        characterId: player.characterId,
        world: player.world.def.slug,
        accountId: player.accountId,
        name: s.name,
        username: player.username,
        level: s.level,
        hp: s.hp,
        maxHp: s.maxHp,
        mana: s.mana,
        maxMana: s.maxMana,
        x: s.x,
        y: s.y,
        gold: s.gold,
        outfit: s.outfit,
        mounted: s.mounted,
        mutedMs: Math.max(0, player.mutedUntil - now),
      };
    });
    const worlds = [...this.worlds.values()].map((sim) => ({
      worldId: sim.def.id,
      slug: sim.def.slug,
      name: sim.def.name,
      players: [...this.players.values()].filter((player) => player.world === sim).length,
      monsters: [...this.monsters.values()].filter((monster) => monster.world === sim).length,
      loot: sim.lootAt.size,
    }));

    return {
      players,
      monsters: this.monsters.size,
      worlds,
      event: this.state.eventName,
      eventEndsAt: this.state.eventEndsAt,
      xpMultiplier: this.state.xpMultiplier,
    };
  }

  announceText(text: string) {
    this.announce(text);
  }

  /** Comando de mestre num personagem desta sala. */
  commandCharacter(characterId: number, command: LiveCommand): boolean {
    const player = this.playerByCharacter(characterId);
    if (!player) return false;
    const s = player.state;

    switch (command.kind) {
      case "whisper":
        this.sendChat(player.client, "system", command.text);
        return true;
      case "kick":
        void this.persist(player);
        player.client.leave(4003, command.text);
        return true;
      case "teleport": {
        const target = command.worldId ? this.worldFor(command.worldId, true) : player.world;
        this.travel(player, target, command.x, command.y);
        this.sendChat(player.client, "system", "Um administrador te moveu de lugar.");
        return true;
      }
      case "heal":
        s.hp = s.maxHp;
        s.mana = s.maxMana;
        this.broadcast(ServerMsg.Hit, {
          target: player.id,
          attacker: player.id,
          amount: s.maxHp,
          kind: "heal",
        } satisfies HitEvent);
        this.sendChat(player.client, "system", "Um administrador curou você.");
        return true;
      case "summon": {
        for (let i = 0; i < command.count; i++) {
          this.spawnMonster(player.world, command.monster, { x: s.x, y: s.y }, { respawns: false });
        }
        this.sendChat(player.client, "system", "Algo foi invocado perto de você...");
        return true;
      }
      case "mute":
        player.mutedUntil = Date.now() + command.minutes * 60_000;
        this.sendChat(player.client, "system", `Um administrador silenciou você por ${command.minutes} min.`);
        return true;
    }
  }

  runEvent(event: LiveEvent): LiveEventResult {
    if (event === "stop") return this.eventManager.stop() ? "ok" : "none";
    return this.eventManager.start(event) ? "ok" : "busy";
  }

  /** O painel mexeu nos eventos: recarrega a lista sem derrubar o que está rodando. */
  async reloadEvents() {
    await this.eventManager.load();
  }

  /** Preço novo na loja: quem está com a vitrine aberta vê na hora. */
  sendCatalog(overrides: CatalogOverride[]) {
    this.broadcast(ServerMsg.Catalog, { catalog: overrides } satisfies CatalogEvent);
  }

  /** Valida a sessão e carrega o personagem antes de a pessoa entrar na sala. */
  async onAuth(_client: Client, options: JoinOptions) {
    const account = await accountFromToken(options?.token);
    if (!account) throw new ServerError(401, "Sua sessão expirou. Entre novamente.");
    const ban = await accountBan(account.id);
    if (ban.banned) throw new ServerError(403, banMessage(ban.reason));
    const characterId = Number(options?.characterId);
    await lastWriteByCharacter.get(characterId);
    const character = Number.isInteger(characterId) ? await loadCharacter(account.id, characterId) : undefined;
    if (!character) throw new ServerError(404, "Personagem não encontrado.");
    const auth: AuthData = { accountId: account.id, character };
    return auth;
  }

  async onJoin(client: Client, _options: JoinOptions, auth: AuthData) {
    let row = auth.character;
    const previous = [...this.players.values()].find((player) => player.characterId === row.id);
    if (previous) {
      // Mesmo personagem entrando de novo (outra aba ou página recarregada): o login novo assume o lugar.
      this.removePlayer(previous);
      await this.persist(previous);
      previous.client.leave(4001, "Seu personagem entrou em outra janela.");
      row = (await loadCharacter(auth.accountId, row.id)) ?? row;
    }

    const [unlockList, account] = await Promise.all([listUnlocks(auth.accountId), getAccount(auth.accountId)]);
    const unlocks = new Set(unlockList);
    const owns = (id: string, kind: ItemKind) => {
      const item = catalogItem(id);
      return item !== undefined && item.kind === kind && ownsItem(item, unlocks);
    };

    const saved = appearanceFromRow(row);
    const appearance =
      parseAppearance({ ...saved, outfit: owns(saved.outfit, "outfit") ? saved.outfit : DEFAULT_APPEARANCE.outfit }) ??
      DEFAULT_APPEARANCE;
    const pet = row.pet && owns(row.pet, "pet") ? row.pet : "";
    const mount = row.mount && owns(row.mount, "mount") ? row.mount : "";
    const [items, questProgress] = await Promise.all([listCharacterItems(row.id), listQuestProgress(row.id)]);
    const gear = equippedStats(items);
    // O nível sai da XP, e não do que está gravado: se a curva mudou, ele já entra no nível novo.
    const level = Math.max(row.level, levelForXp(row.xp));
    const stats = withGear(playerStats(level, row.vocation), gear);
    const sim = this.worldFor(row.worldId);
    const spot = this.spawnPointFor(sim, row);

    const state = new PlayerState({
      name: row.name,
      world: sim.def.slug,
      x: spot.x,
      y: spot.y,
      dir: 1,
      stepMs: PLAYER_STEP_MS,
      hp: row.hp > 0 ? Math.min(row.hp, stats.maxHp) : stats.maxHp,
      maxHp: stats.maxHp,
      mana: Math.min(Math.max(0, row.mana), stats.maxMana),
      maxMana: stats.maxMana,
      level,
      xp: row.xp,
      gold: row.gold,
      target: "",
      ...appearance,
      pet,
      mount,
      mounted: mount !== "" && row.mounted,
      looks: looksOf(items),
      marked: (row.markedUntil?.getTime() ?? 0) > Date.now(),
      vip: rankOf(account?.vipTier ?? "", account?.vipUntil?.getTime() ?? 0),
      title: vipTier(account?.vipTier ?? "")?.title ?? "",
    });

    const player: PlayerSim = {
      id: client.sessionId,
      client,
      state,
      world: sim,
      accountId: auth.accountId,
      username: account?.username ?? "",
      characterId: row.id,
      unlocks,
      diamonds: account?.diamonds ?? 0,
      vocation: row.vocation,
      kills: row.kills,
      shortcuts: sanitizeShortcuts(row.shortcuts ? row.shortcuts.split(",") : [], level, vocationFamilies(row.vocation)),
      items,
      gear,
      bagFullWarnAt: 0,
      nextPotionAt: 0,
      questProgress: questProgress,
      view: DEFAULT_VIEW,
      seen: new Set(),
      nextViewAt: 0,
      path: [],
      moveDir: null,
      nextStepAt: 0,
      nextAttackAt: 0,
      nextChaseAt: 0,
      spellReadyAt: new Map(),
      chatReadyAt: 0,
      mutedUntil: 0,
      nextPortalAt: 0,
      markedUntil: row.markedUntil ? row.markedUntil.getTime() : 0,
      attackedBy: new Map(),
      vipTier: account?.vipTier ?? "",
      vipUntil: account?.vipUntil?.getTime() ?? 0,
      queue: Promise.resolve(),
    };
    this.players.set(client.sessionId, player);
    this.state.players.set(client.sessionId, state);
    // Sem StateView o cliente não receberia nada: o estado todo é filtrado por visão.
    const view = new StateView();
    view.add(state);
    client.view = view;
    player.seen.add(client.sessionId);
    this.state.online = this.players.size;
    occupyPlayer(sim, spot.x, spot.y, client.sessionId, true);

    this.settleBag(player);
    this.sendPvp(player);
    void this.sendVip(player);
    this.sendQuests(player);
    void this.sendCheckin(player);
    void this.grantMilestones(player);
    this.sendProfile(player);
    this.sendInventory(player);
    const greeting = row.lastLoginAt ? "Bem-vindo de volta" : "Bem-vindo";
    this.sendChat(client, "system", `${greeting}, ${row.name}! Aperte O para abrir o guarda-roupa e a loja.`);
    if (sim !== this.defaultWorld()) this.sendChat(client, "event", `Você está em ${sim.def.name}.`);
    this.broadcastChat("system", `${row.name} entrou no mundo.`, client);
    void this.enqueue(player, () => markLogin(row.id)).catch(() => undefined);
  }

  async onLeave(client: Client) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    this.removePlayer(player);
    client.view?.dispose();
    client.view = undefined;
    this.state.online = this.players.size;
    this.broadcastChat("system", `${player.state.name} saiu do mundo.`);
    await this.persist(player);
  }

  async onDispose() {
    unregisterLiveRoom(this);
    await Promise.all([...this.players.values()].map((player) => this.persist(player)));
  }

  // ------------------------------------------------------------ API usada pelos eventos

  after(delayMs: number, run: () => void) {
    this.scheduled.push({ at: Date.now() + delayMs, run });
  }

  announce(text: string) {
    this.broadcast(ServerMsg.Announce, { text } satisfies AnnounceEvent);
    this.broadcastChat("event", text);
  }

  spawnMonster(
    sim: WorldSim,
    kind: MonsterKind,
    at: Point,
    options: { respawns: boolean; nestId?: number; scale?: number; questId?: number } = { respawns: false },
  ): MonsterSim | null {
    const spot = findFreeTile(sim, at.x, at.y, true, 3);
    if (!spot) return null;
    const def = MONSTERS[kind];
    const id = `m${this.nextMonsterId++}`;
    const state = new MonsterState({
      kind,
      world: sim.def.slug,
      x: spot.x,
      y: spot.y,
      dir: randInt(Math.random, 0, DIRS.length - 1),
      stepMs: stepDuration(def.stepMs, 1, 0),
      hp: Math.round(def.hp * (options.scale ?? 1)),
      maxHp: Math.round(def.hp * (options.scale ?? 1)),
    });
    const monster: MonsterSim = {
      id,
      def,
      state,
      world: sim,
      home: { x: at.x, y: at.y },
      respawns: options.respawns,
      nestId: options.nestId ?? 0,
      targetId: null,
      path: [],
      pathGoal: null,
      nextStepAt: 0,
      nextAttackAt: 0,
      nextThinkAt: 0,
      nextSpecialAt: Date.now() + 2500,
      scale: options.scale ?? 1,
      questId: options.questId ?? 0,
      damageBy: new Map(),
    };
    this.monsters.set(id, monster);
    this.state.monsters.set(id, state);
    sim.monsterAt.set(tileKey(sim, spot.x, spot.y), id);
    return monster;
  }

  /** Põe mais um monstro de um ninho do editor, num ponto sorteado dentro do raio. */
  private spawnFromNest(sim: WorldSim, nest: SpawnDef) {
    if (!sim.spawns.includes(nest)) return;
    const alive = sim.nestAlive.get(nest.id) ?? 0;
    if (alive >= nest.amount) return;
    const radius = Math.max(0, nest.radius);
    const at = {
      x: nest.x + randInt(Math.random, -radius, radius),
      y: nest.y + randInt(Math.random, -radius, radius),
    };
    const monster = this.spawnMonster(sim, nest.monster, at, { respawns: false, nestId: nest.id });
    if (!monster) {
      this.after(5000, () => this.spawnFromNest(sim, nest));
      return;
    }
    monster.home = { x: nest.x, y: nest.y };
    sim.nestAlive.set(nest.id, alive + 1);
  }

  /** Põe no chão um tesouro fixo do editor. Ele fica lá até alguém passar por cima. */
  private spawnGroundItem(sim: WorldSim, item: GroundItemDef) {
    if (sim.itemLoot.has(item.id)) return;
    const lootId = this.dropLoot(
      sim,
      { kind: item.loot, gold: item.gold, diamonds: item.diamonds },
      item.x,
      item.y,
      "",
      { forever: true },
    );
    if (!lootId) {
      sim.itemReadyAt.set(item.id, Date.now() + 10_000);
      return;
    }
    sim.itemLoot.set(item.id, lootId);
    sim.itemOfLoot.set(lootId, item.id);
  }

  /** Remove sem recompensa (fim de evento). */
  removeMonster(id: string) {
    const monster = this.monsters.get(id);
    if (!monster) return;
    this.monsters.delete(id);
    this.state.monsters.delete(id);
    monster.world.monsterAt.delete(tileKey(monster.world, monster.state.x, monster.state.y));
    for (const player of this.players.values()) {
      if (player.state.target === id) player.state.target = "";
    }
  }

  // ------------------------------------------------------------ persistência

  /** Executa as operações de banco de um personagem em fila. */
  private enqueue<T>(player: PlayerSim, task: () => Promise<T>): Promise<T> {
    const run = player.queue.then(task);
    const settled = run.then(
      () => undefined,
      (error: unknown) => console.error(`Erro de banco com ${player.state.name}:`, error),
    );
    player.queue = settled;
    pendingWrites.add(settled);
    lastWriteByCharacter.set(player.characterId, settled);
    void settled.then(() => {
      pendingWrites.delete(settled);
      if (lastWriteByCharacter.get(player.characterId) === settled) lastWriteByCharacter.delete(player.characterId);
    });
    return run;
  }

  /** O retrato é tirado na hora em que a gravação roda, não quando foi pedida. */
  private persist(player: PlayerSim): Promise<void> {
    return this.enqueue(player, () => saveCharacter(this.snapshotOf(player))).catch(() => undefined);
  }

  private snapshotOf(player: PlayerSim): CharacterSnapshot {
    const s = player.state;
    return {
      id: player.characterId,
      level: s.level,
      xp: s.xp,
      hp: s.hp,
      mana: s.mana,
      gold: s.gold,
      kills: player.kills,
      shortcuts: player.shortcuts,
      x: s.x,
      y: s.y,
      worldId: player.world.def.id,
      appearance: {
        skin: s.skin,
        hairColor: s.hairColor,
        outfit: s.outfit,
        primary: s.primary,
        secondary: s.secondary,
        detail: s.detail,
      },
      pet: s.pet,
      mount: s.mount,
      mounted: s.mounted,
      markedUntil: player.markedUntil,
    };
  }

  private removePlayer(player: PlayerSim) {
    occupyPlayer(player.world, player.state.x, player.state.y, player.id, false);
    this.players.delete(player.id);
    this.state.players.delete(player.id);
    for (const monster of this.monsters.values()) {
      if (monster.targetId === player.id) monster.targetId = null;
    }
  }

  private spawnPointFor(sim: WorldSim, row: CharacterRow): Point {
    const home = { x: sim.def.spawnX, y: sim.def.spawnY };
    const inside = row.x >= 0 && row.y >= 0 && row.x < sim.map.width && row.y < sim.map.height;
    if (inside && !blockedForPlayer(sim, row.x, row.y)) return { x: row.x, y: row.y };
    const near = inside ? findFreeTile(sim, row.x, row.y, false) : null;
    return near ?? findFreeTile(sim, home.x, home.y, false) ?? home;
  }

  // ------------------------------------------------------------ mensagens dos clientes

  private handleMove(client: Client, message: MoveMessage) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    const dx = Math.sign(Number(message?.dx) || 0);
    const dy = Math.sign(Number(message?.dy) || 0);
    player.moveDir = dx === 0 && dy === 0 ? null : { x: dx, y: dy };
    if (player.moveDir) player.path = [];
  }

  private handleGoto(client: Client, message: GotoMessage) {
    const player = this.players.get(client.sessionId);
    const x = Math.trunc(Number(message?.x));
    const y = Math.trunc(Number(message?.y));
    if (!player || !Number.isFinite(x) || !Number.isFinite(y)) return;

    const sim = player.world;
    const blocked = (tx: number, ty: number) => blockedForPlayer(sim, tx, ty);
    const { width, height } = sim.map;
    const goal = { x, y };
    const path =
      findPath(width, height, player.state, goal, blocked, { maxNodes: 6000 }) ??
      findPath(width, height, player.state, goal, blocked, { adjacent: true, maxNodes: 6000 });

    player.moveDir = null;
    player.state.target = "";
    player.path = path ?? [];
  }

  private handleTarget(client: Client, message: TargetMessage) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    const id = String(message?.id ?? "");
    if (id && !this.monsters.has(id)) {
      const outro = this.players.get(id);
      // Clique que não faz nada parece defeito: a recusa diz o motivo em vez de sumir.
      const motivo = outro ? this.pvpRefusal(player, outro) : "Esse alvo não existe mais.";
      if (motivo) {
        this.sendChat(client, "system", motivo);
        return;
      }
    }
    player.state.target = id;
    player.path = [];
    player.nextChaseAt = 0;
  }

  private handleSpell(client: Client, message: SpellMessage) {
    const player = this.players.get(client.sessionId);
    const spell = spellById(String(message?.id ?? ""));
    if (!player || !spell) return;

    const now = Date.now();
    const s = player.state;
    if (!spellUnlocked(spell, s.level)) {
      this.sendChat(client, "system", `${spell.name} abre no nível ${spell.minLevel}.`);
      return;
    }
    if ((player.spellReadyAt.get(spell.id) ?? 0) > now) return;
    if (s.mana < spell.mana) {
      this.sendChat(client, "system", "Mana insuficiente.");
      return;
    }

    // Cada poder escolhe seus alvos antes de gastar mana: sem alvo, nada é cobrado.
    const sim = player.world;
    const target = s.target ? this.combatant(s.target) : undefined;
    let at: Point = s;
    if (spell.kind === "target" || spell.kind === "leech" || spell.kind === "blast") {
      if (!target || target.world !== sim || chebyshev(s.x, s.y, target.state.x, target.state.y) > spell.range) {
        this.sendChat(client, "system", "Escolha um alvo dentro do alcance (Tab mira no mais próximo).");
        return;
      }
      if (!this.canHit(player, target)) {
        this.sendChat(client, "system", this.pvpRefusal(player, target as PlayerSim) ?? "Alvo protegido.");
        return;
      }
      at = { x: target.state.x, y: target.state.y };
    }
    // O leque mira sozinho no alvo escolhido; sem alvo, sai para onde o personagem olha.
    if (spell.kind === "wave" && target && target.world === sim) this.face(s, target.state);
    const tiles = spellArea(spell, s, s.dir, at).filter((tile) => tile.x >= 0 && tile.y >= 0 && tile.x < sim.map.width && tile.y < sim.map.height);
    const targets: Combatant[] = [];
    if (spell.kind !== "heal") {
      for (const tile of tiles) {
        const id = sim.monsterAt.get(tileKey(sim, tile.x, tile.y));
        const monster = id ? this.monsters.get(id) : undefined;
        if (monster) targets.push(monster);
        // Jogadores também: o índice de ids por tile existe por causa disto. Quem a regra de
        // PvP protege simplesmente não entra na lista — a magia passa por cima sem feri-lo.
        for (const outroId of playersOn(sim, tile.x, tile.y)) {
          const outro = this.players.get(outroId);
          if (outro && outro !== player && this.canHit(player, outro)) targets.push(outro);
        }
      }
      if (targets.length === 0) {
        this.sendChat(client, "system", spell.kind === "wave" ? "Nada na sua frente." : "Nada ao seu redor.");
        return;
      }
    }

    s.mana -= spell.mana;
    player.spellReadyAt.set(spell.id, now + spell.cooldownMs);
    const shown = spell.kind === "target" || spell.kind === "leech" || spell.kind === "heal" ? undefined : tiles.flatMap((tile) => [tile.x, tile.y]);
    this.sendNear(sim.def.slug, at.x, at.y, ServerMsg.SpellEffect, {
      caster: player.id, spell: spell.id, x: at.x, y: at.y, tiles: shown,
    } satisfies SpellEffectEvent);

    if (spell.kind === "heal") {
      const magic = vocationStats(player.vocation).magicFactor;
      const amount = Math.round(healAmount(s.level) * spell.power * magic) + randInt(Math.random, 0, 10);
      const healed = Math.min(amount, s.maxHp - s.hp);
      s.hp += healed;
      this.broadcastHit(player.id, player.id, healed, "heal");
      return;
    }

    const { maxDamage } = this.statsOf(player);
    const magic = vocationStats(player.vocation).magicFactor;
    let dealt = 0;
    for (const alvo of targets) {
      const crit = Math.random() < CRIT_CHANCE;
      const roll = Math.round(maxDamage * spell.power * magic * (0.85 + Math.random() * 0.3) * (crit ? CRIT_MULTIPLIER : 1));
      const armor = isPlayerSim(alvo) ? this.statsOf(alvo).armor : alvo.def.armor;
      dealt += Math.max(0, roll - armor);
      this.damage(alvo, player, roll - armor, crit);
    }

    if (spell.kind === "leech" && dealt > 0) {
      const healed = Math.min(Math.round(dealt / 2), s.maxHp - s.hp);
      if (healed > 0) {
        s.hp += healed;
        this.broadcastHit(player.id, player.id, healed, "heal");
      }
    }
  }

  /** Monstros num raio (Chebyshev) em volta de um ponto do mesmo mundo. */
  private monstersAround(sim: WorldSim, center: Point, radius: number): MonsterSim[] {
    const found: MonsterSim[] = [];
    for (let y = center.y - radius; y <= center.y + radius; y++) {
      for (let x = center.x - radius; x <= center.x + radius; x++) {
        if (x === center.x && y === center.y) continue;
        const id = sim.monsterAt.get(tileKey(sim, x, y));
        const monster = id ? this.monsters.get(id) : undefined;
        if (monster) found.push(monster);
      }
    }
    return found;
  }

  /** O jogador arrumou a barra de poderes. */
  private handleShortcuts(client: Client, message: ShortcutsMessage) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    const slots = Array.isArray(message?.slots) ? message.slots.map((slot) => String(slot ?? "")) : [];
    player.shortcuts = sanitizeShortcuts(slots, player.state.level, vocationFamilies(player.vocation));
    this.sendProfile(player);
    void this.persist(player);
  }

  private handleChat(client: Client, message: ChatMessage) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    const text = String(message?.text ?? "")
      .replace(/\p{Cc}/gu, "")
      .trim()
      .slice(0, CHAT_MAX_LEN);
    const now = Date.now();
    if (!text || now < player.chatReadyAt) return;
    player.chatReadyAt = now + 600;

    if (now < player.mutedUntil && !text.startsWith("/")) {
      const minutes = Math.ceil((player.mutedUntil - now) / 60_000);
      this.sendChat(player.client, "system", `Você está silenciado por mais ${minutes} min.`);
      return;
    }

    if (text.startsWith("/")) {
      this.runCommand(player, text);
      return;
    }
    this.broadcast(ServerMsg.Chat, {
      channel: "player",
      from: player.state.name,
      id: player.id,
      text,
    } satisfies ChatEvent);
  }

  /** Cores, pele e cabelo: grátis para trocar. */
  private handleAppearance(client: Client, message: AppearanceMessage) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    const s = player.state;
    const appearance = parseAppearance({ ...message, outfit: s.outfit });
    if (!appearance) return;
    s.skin = appearance.skin;
    s.hairColor = appearance.hairColor;
    s.primary = appearance.primary;
    s.secondary = appearance.secondary;
    s.detail = appearance.detail;
  }

  private handleEquip(client: Client, message: EquipMessage) {
    const player = this.players.get(client.sessionId);
    const kind = message?.kind;
    if (!player || (kind !== "outfit" && kind !== "pet" && kind !== "mount")) return;
    const id = String(message.id ?? "");
    if (id) {
      const item = catalogItem(id);
      if (!item || item.kind !== kind || !ownsItem(item, player.unlocks)) return;
      const exigido = item.vip ?? 0;
      if (exigido > 0 && (this.vipOf(player)?.rank ?? 0) < exigido) {
        const tier = vipTiersAll().find((entry) => entry.rank === exigido);
        this.sendChat(client, "system", `${item.name} é exclusivo do ${tier?.name ?? "VIP"}.`);
        return;
      }
    } else if (kind === "outfit") {
      return;
    }

    const s = player.state;
    if (kind === "outfit") {
      s.outfit = id;
    } else if (kind === "pet") {
      s.pet = id;
    } else {
      s.mount = id;
      s.mounted = id !== "";
    }
  }

  private handleToggleMount(client: Client) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    if (!player.state.mount) {
      this.sendChat(client, "system", "Você não tem uma montaria equipada. Aperte O para escolher uma.");
      return;
    }
    player.state.mounted = !player.state.mounted;
  }

  private handleBuy(client: Client, message: BuyMessage) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    const item = catalogItem(String(message?.id ?? ""));
    if (!item || item.price === 0 || item.enabled === false) {
      this.sendPurchase(player, false, "", "Item indisponível.");
      return;
    }
    const exigido = item.vip ?? 0;
    if (exigido > 0 && (this.vipOf(player)?.rank ?? 0) < exigido) {
      const tier = vipTiersAll().find((entry) => entry.rank === exigido);
      this.sendPurchase(player, false, item.id, `${item.name} é exclusivo do ${tier?.name ?? "VIP"}.`);
      return;
    }

    this.enqueue(player, async () => {
      if (player.unlocks.has(item.id)) {
        this.sendPurchase(player, false, item.id, "Você já tem esse item.");
        return;
      }
      const result = await purchaseItem({
        accountId: player.accountId,
        characterId: player.characterId,
        itemId: item.id,
        currentGold: player.state.gold,
      });
      if (!result.ok) {
        this.sendPurchase(player, false, item.id, result.message);
        return;
      }
      // Desconta do valor atual: o loot que caiu enquanto a compra era gravada não se perde.
      if (item.currency === "gold") player.state.gold = Math.max(0, player.state.gold - item.price);
      player.diamonds = result.diamonds;
      player.unlocks.add(item.id);
      this.sendProfile(player);
      this.sendPurchase(player, true, item.id, `Você adquiriu ${item.name}!`);
    }).catch(() => this.sendPurchase(player, false, item.id, "Não foi possível concluir a compra. Tente de novo."));
  }

  private runCommand(player: PlayerSim, text: string) {
    const [command, argument = ""] = text.slice(1).toLowerCase().split(/\s+/);
    const testOnly = () => {
      if (!DEV_COMMANDS) this.sendChat(player.client, "system", "Comando indisponível.");
      return DEV_COMMANDS;
    };

    switch (command) {
      case "ajuda":
        this.sendChat(
          player.client,
          "system",
          DEV_COMMANDS
            ? "Comandos: /online · teste: /evento <chave> · /ir <mundo> · /xp 500 · /ouro 2000 · /diamantes 1000 · /item <id>"
            : "Comandos: /online",
        );
        return;
      case "online": {
        const names = [...this.players.values()].map((p) => `${p.state.name} (${p.state.level})`);
        this.sendChat(player.client, "system", `${names.length} online: ${names.join(", ")}`);
        return;
      }
      case "evento": {
        if (!testOnly()) return;
        const slugs = this.eventManager
          .list()
          .filter((def) => def.enabled)
          .map((def) => def.slug);
        if (!slugs.includes(argument)) {
          this.sendChat(player.client, "system", `Use /evento <chave>. Hoje tem: ${slugs.join(", ") || "nenhum"}.`);
        } else if (!this.eventManager.start(argument)) {
          this.sendChat(player.client, "system", "Já existe um evento em andamento.");
        }
        return;
      }
      case "ir": {
        if (!testOnly()) return;
        const target = this.worldBySlug.get(argument);
        if (!target) {
          const names = [...this.worldBySlug.keys()].join(", ");
          this.sendChat(player.client, "system", `Use /ir <mundo>. Mundos: ${names}.`);
          return;
        }
        this.travel(player, target, target.def.spawnX, target.def.spawnY);
        return;
      }
      case "xp": {
        if (!testOnly()) return;
        const amount = parseTestAmount(argument);
        if (amount === null) this.sendChat(player.client, "system", "Use /xp <quantidade>.");
        else this.giveXp(player, amount);
        return;
      }
      case "ouro": {
        if (!testOnly()) return;
        const amount = parseTestAmount(argument);
        if (amount === null) {
          this.sendChat(player.client, "system", "Use /ouro <quantidade>.");
          return;
        }
        player.state.gold += amount;
        this.sendChat(player.client, "loot", `Você recebeu ${amount} moedas de ouro (teste).`);
        return;
      }
      case "diamantes": {
        if (!testOnly()) return;
        const amount = parseTestAmount(argument);
        if (amount === null) {
          this.sendChat(player.client, "system", "Use /diamantes <quantidade>.");
          return;
        }
        this.enqueue(player, async () => {
          player.diamonds = await addDiamonds(player.accountId, amount);
          this.sendProfile(player);
          this.sendChat(player.client, "loot", `Você recebeu ${amount} diamantes (teste).`);
        }).catch(() => undefined);
        return;
      }
      case "item": {
        if (!testOnly()) return;
        const [itemId = "", amount = "1"] = text.slice(1).split(/\s+/).slice(1);
        const item = gearItem(itemId.toLowerCase());
        if (!item) {
          this.sendChat(player.client, "system", `Use /item <id>. Ex.: ${gearList().slice(0, 6).map((entry) => entry.id).join(", ")}…`);
          return;
        }
        const got = this.grantItem(player, item.id, Math.max(1, Math.min(1000, Number(amount) || 1)));
        this.sendChat(player.client, "loot", `Você recebeu ${got}× ${item.name} (teste).`);
        return;
      }
      default:
        this.sendChat(player.client, "system", "Comando desconhecido. Digite /ajuda.");
    }
  }

  // ------------------------------------------------------------ simulação

  private tick() {
    const now = Date.now();
    this.runScheduled(now);
    for (const player of this.players.values()) this.updatePlayer(player, now);
    // Monstro de mundo vazio não pensa: não há ninguém lá para ver, e são centenas deles.
    this.povoados.clear();
    for (const player of this.players.values()) this.povoados.add(player.world);
    for (const monster of this.monsters.values()) {
      if (this.povoados.has(monster.world)) this.updateMonster(monster, now);
    }
    this.syncViews(now);
    if (this.state.online !== this.players.size) this.state.online = this.players.size;
    if (now >= this.nextRegenAt) {
      this.nextRegenAt = now + 1000;
      this.regenerate();
    }
    if (now >= this.nextLootSweepAt) {
      this.nextLootSweepAt = now + 1000;
      this.sweepLoot(now);
      this.refillGroundItems(now);
    }
    if (now >= this.nextAutosaveAt) {
      this.nextAutosaveAt = now + AUTOSAVE_MS;
      for (const player of this.players.values()) void this.persist(player);
    }
    this.eventManager.update(now);
  }

  private runScheduled(now: number) {
    if (!this.scheduled.some((task) => task.at <= now)) return;
    const due = this.scheduled.filter((task) => task.at <= now);
    this.scheduled = this.scheduled.filter((task) => task.at > now);
    for (const task of due) task.run();
  }

  // ------------------------------------------------------------ o que cada um enxerga

  /**
   * Refaz de tempos em tempos a lista do que cabe na tela de cada jogador. É isto que segura
   * o tamanho do estado: antes os 742 monstros dos nove mundos iam para todo mundo, 40 vezes
   * por segundo, e o cliente escondia os de fora depois de já ter decodificado todos.
   */
  private syncViews(now: number) {
    for (const player of this.players.values()) {
      if (now < player.nextViewAt) continue;
      player.nextViewAt = now + VIEW_SYNC_MS;
      this.syncView(player);
    }
  }

  private syncView(player: PlayerSim) {
    const view = player.client.view;
    if (!view) return;
    const { x, y } = player.state;
    const sim = player.world;
    const window = player.view;
    const visivel = this.visivel;
    visivel.clear();

    // O próprio personagem e o alvo dele nunca somem, mesmo se a perseguição passar da borda.
    visivel.add(player.id);
    if (player.state.target) visivel.add(player.state.target);
    for (const other of this.players.values()) {
      if (other.world === sim && inView(window, x, y, other.state.x, other.state.y)) visivel.add(other.id);
    }
    // monsterAt já é o índice de monstros vivos daquele mundo, tile a tile.
    for (const id of sim.monsterAt.values()) {
      const monster = this.monsters.get(id);
      if (monster && inView(window, x, y, monster.state.x, monster.state.y)) visivel.add(id);
    }
    for (const [id, loot] of this.state.loot) {
      if (loot.world === sim.def.slug && inView(window, x, y, loot.x, loot.y)) visivel.add(id);
    }

    for (const id of visivel) {
      if (player.seen.has(id)) continue;
      const entity = this.viewEntity(id);
      if (!entity) continue;
      view.add(entity);
      player.seen.add(id);
    }
    for (const id of player.seen) {
      if (visivel.has(id)) continue;
      const entity = this.viewEntity(id);
      if (entity) view.remove(entity);
      player.seen.delete(id);
    }
  }

  /** O estado de uma entidade, seja jogador, monstro ou drop. */
  private viewEntity(id: string): PlayerState | MonsterState | LootState | undefined {
    return this.state.players.get(id) ?? this.state.monsters.get(id) ?? this.state.loot.get(id);
  }

  /** Manda um evento só para quem tem aquele ponto na tela. */
  private sendNear(world: string, x: number, y: number, type: string, message: unknown) {
    for (const player of this.players.values()) {
      if (player.world.def.slug !== world) continue;
      if (!inView(player.view, player.state.x, player.state.y, x, y)) continue;
      player.client.send(type, message);
    }
  }

  /** O cliente contou o tamanho da tela dele, em tiles. */
  private handleView(client: Client, message: ViewMessage) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    player.view = clampView(message?.u, message?.v);
    // A janela mudou de tamanho: refaz já, senão fica um vazio na borda até o próximo ciclo.
    player.nextViewAt = 0;
  }

  /** Bônus do mascote e da montaria. A velocidade da montaria só vale montado. */
  /** Degrau de VIP ativo da conta, ou undefined. Um lugar só: todo benefício lê a linha daqui. */
  private vipOf(player: PlayerSim): VipTier | undefined {
    const tier = vipTier(player.vipTier);
    return tier && player.vipUntil > Date.now() ? tier : undefined;
  }

  private bonusesOf(player: PlayerSim): Bonuses {
    const s = player.state;
    const bonuses: Bonuses = { xp: 0, gold: 0, stepFactor: 1 };
    // O VIP soma no mesmo ponto que pet e montaria, e por isso vale só para XP de monstro.
    // Estender a missão e o baú dobraria prêmio que o painel calibrou sem contar com isto.
    const vip = this.vipOf(player);
    if (vip) {
      bonuses.xp += vip.bonusXp;
      bonuses.gold += vip.bonusGold;
    }
    for (const id of [s.pet, s.mount]) {
      const bonus = id ? catalogItem(id)?.bonus : undefined;
      if (!bonus) continue;
      bonuses.xp += bonus.xp ?? 0;
      bonuses.gold += bonus.gold ?? 0;
      if (bonus.stepFactor && id === s.mount && s.mounted) bonuses.stepFactor = bonus.stepFactor;
    }
    return bonuses;
  }

  private updatePlayer(player: PlayerSim, now: number) {
    const s = player.state;
    const sim = player.world;
    const target = s.target ? this.combatant(s.target) : undefined;
    // Larga o alvo que sumiu, mudou de mundo, ou que a regra de PvP deixou de permitir — o
    // outro pode ter entrado na zona segura no meio da briga.
    if (s.target && (!target || target.world !== sim || !this.canHit(player, target))) s.target = "";

    if (isReady(player.nextStepAt, now)) {
      if (player.moveDir) {
        this.tryPlayerStep(player, player.moveDir.x, player.moveDir.y, now);
      } else if (player.path.length > 0) {
        const next = player.path[0];
        if (blockedForPlayer(sim, next.x, next.y)) {
          const goal = player.path[player.path.length - 1];
          player.path =
            findPath(sim.map.width, sim.map.height, s, goal, (x, y) => blockedForPlayer(sim, x, y), { maxNodes: 3000 }) ?? [];
        } else {
          player.path.shift();
          this.movePlayer(player, next.x, next.y, now);
        }
      } else if (target && chebyshev(s.x, s.y, target.state.x, target.state.y) > this.attackRange(player) && now >= player.nextChaseAt) {
        player.nextChaseAt = now + 200;
        const path = findPath(sim.map.width, sim.map.height, s, target.state, (x, y) => blockedForPlayer(sim, x, y), {
          adjacent: true,
          maxNodes: 1500,
        });
        if (path && path.length > 0) this.movePlayer(player, path[0].x, path[0].y, now);
      }
    }

    const range = target ? this.attackRange(player) : 1;
    if (target && now >= player.nextAttackAt && chebyshev(s.x, s.y, target.state.x, target.state.y) <= range) {
      player.nextAttackAt = now + PLAYER_ATTACK_MS;
      const { maxDamage } = this.statsOf(player);
      const crit = Math.random() < CRIT_CHANCE;
      const roll = Math.round(maxDamage * (0.35 + Math.random() * 0.65) * (crit ? CRIT_MULTIPLIER : 1));
      this.face(s, target.state);
      // Besta: dispara de longe e gasta uma flecha.
      if (range > 1) {
        this.sendNear(sim.def.slug, s.x, s.y, ServerMsg.Shot, { attacker: player.id, target: target.id } satisfies ShotEvent);
        this.spendAmmo(player);
      }
      // A armadura do alvo: monstro tem a da espécie, jogador tem a do que está vestindo.
      const armor = isPlayerSim(target) ? this.statsOf(target).armor : target.def.armor;
      this.damage(target, player, roll - armor, crit);
    }

    if (player.world.lootAt.size > 0) this.collectLoot(player, now);
  }

  /** Anda na direção pedida; numa diagonal bloqueada, desliza pelo eixo livre. */
  private tryPlayerStep(player: PlayerSim, dx: number, dy: number, now: number) {
    const s = player.state;
    const sim = player.world;
    const options = dx !== 0 && dy !== 0 ? [[dx, dy], [dx, 0], [0, dy]] : [[dx, dy]];
    for (const [ox, oy] of options) {
      const nx = s.x + ox;
      const ny = s.y + oy;
      if (blockedForPlayer(sim, nx, ny)) continue;
      if (ox !== 0 && oy !== 0 && (blockedForPlayer(sim, s.x + ox, s.y) || blockedForPlayer(sim, s.x, s.y + oy))) continue;
      this.movePlayer(player, nx, ny, now);
      return;
    }
    const facing = dirIndex(dx, dy);
    if (facing >= 0) s.dir = facing;
  }

  private movePlayer(player: PlayerSim, x: number, y: number, now: number) {
    const s = player.state;
    const sim = player.world;
    const dx = x - s.x;
    const dy = y - s.y;
    const duration = stepDuration(PLAYER_STEP_MS * this.bonusesOf(player).stepFactor, dx, dy);
    occupyPlayer(sim, s.x, s.y, player.id, false);
    s.x = x;
    s.y = y;
    s.dir = dirIndex(dx, dy);
    s.stepMs = duration;
    occupyPlayer(sim, x, y, player.id, true);
    player.nextStepAt = nextStepTime(player.nextStepAt, now, duration);

    const portal = portalAt(sim, x, y);
    if (portal && now >= player.nextPortalAt) this.enterPortal(player, portal);
  }

  private updateMonster(monster: MonsterSim, now: number) {
    const s = monster.state;
    const sim = monster.world;
    let target = monster.targetId ? this.players.get(monster.targetId) : undefined;
    if (
      target &&
      (target.world !== sim ||
        inSafe(sim, target.state.x, target.state.y) ||
        chebyshev(s.x, s.y, target.state.x, target.state.y) > CHASE_LOSE_RANGE)
    ) {
      target = undefined;
    }
    if (!target) monster.targetId = null;

    if (!target && now >= monster.nextThinkAt) {
      monster.nextThinkAt = now + 400;
      target = this.findAggroTarget(monster);
      if (target) {
        monster.targetId = target.id;
        monster.path = [];
        monster.nextAttackAt = Math.max(monster.nextAttackAt, now + 600);
      }
    }

    if (target && monster.def.special && now >= monster.nextSpecialAt && this.monsterSpecial(monster, target)) return;

    if (target) {
      const t = target.state;
      if (chebyshev(s.x, s.y, t.x, t.y) <= 1) {
        if (now >= monster.nextAttackAt) {
          monster.nextAttackAt = now + monster.def.attackMs;
          this.face(s, t);
          this.monsterAttack(monster, target);
        }
      } else if (isReady(monster.nextStepAt, now)) {
        this.stepMonsterTowards(monster, t, true, now);
      }
      return;
    }

    if (!isReady(monster.nextStepAt, now)) return;
    if (chebyshev(s.x, s.y, monster.home.x, monster.home.y) > 6) {
      this.stepMonsterTowards(monster, monster.home, false, now);
      return;
    }
    if (Math.random() < 0.01) {
      const d = DIRS[Math.floor(Math.random() * DIRS.length)];
      const nx = s.x + d.x;
      const ny = s.y + d.y;
      if (chebyshev(nx, ny, monster.home.x, monster.home.y) <= 4 && this.canMonsterStep(monster, d.x, d.y)) {
        this.moveMonster(monster, nx, ny, now);
      }
    }
  }

  private canMonsterStep(monster: MonsterSim, dx: number, dy: number): boolean {
    const { x, y } = monster.state;
    const sim = monster.world;
    if (blockedForMonster(sim, x + dx, y + dy, monster.id)) return false;
    if (dx !== 0 && dy !== 0) {
      return !blockedForMonster(sim, x + dx, y, monster.id) && !blockedForMonster(sim, x, y + dy, monster.id);
    }
    return true;
  }

  private stepMonsterTowards(monster: MonsterSim, goal: Point, adjacent: boolean, now: number) {
    const s = monster.state;
    const sim = monster.world;
    const goalChanged = !monster.pathGoal || monster.pathGoal.x !== goal.x || monster.pathGoal.y !== goal.y;
    if (goalChanged || monster.path.length === 0) {
      monster.pathGoal = { x: goal.x, y: goal.y };
      monster.path =
        findPath(sim.map.width, sim.map.height, s, goal, (x, y) => blockedForMonster(sim, x, y, monster.id), {
          adjacent,
          maxNodes: 600,
        }) ?? [];
      if (monster.path.length === 0) {
        this.greedyStep(monster, goal, now);
        return;
      }
    }

    const next = monster.path[0];
    if (blockedForMonster(sim, next.x, next.y, monster.id)) {
      monster.path = [];
      monster.nextStepAt = now + 200;
      return;
    }
    monster.path.shift();
    this.moveMonster(monster, next.x, next.y, now);
  }

  /** Sem caminho (bloqueado por outros monstros): tenta ao menos se aproximar. */
  private greedyStep(monster: MonsterSim, goal: Point, now: number) {
    const s = monster.state;
    let best: Point | null = null;
    let bestDistance = Math.hypot(goal.x - s.x, goal.y - s.y);
    for (const d of DIRS) {
      if (!this.canMonsterStep(monster, d.x, d.y)) continue;
      const distance = Math.hypot(goal.x - (s.x + d.x), goal.y - (s.y + d.y));
      if (distance < bestDistance - 0.01) {
        bestDistance = distance;
        best = { x: s.x + d.x, y: s.y + d.y };
      }
    }
    if (best) this.moveMonster(monster, best.x, best.y, now);
    else monster.nextStepAt = now + 300;
  }

  private moveMonster(monster: MonsterSim, x: number, y: number, now: number) {
    const s = monster.state;
    const sim = monster.world;
    const dx = x - s.x;
    const dy = y - s.y;
    const duration = stepDuration(monster.def.stepMs, dx, dy);
    sim.monsterAt.delete(tileKey(sim, s.x, s.y));
    s.x = x;
    s.y = y;
    s.dir = dirIndex(dx, dy);
    s.stepMs = duration;
    sim.monsterAt.set(tileKey(sim, x, y), monster.id);
    monster.nextStepAt = nextStepTime(monster.nextStepAt, now, duration);
  }

  private findAggroTarget(monster: MonsterSim): PlayerSim | undefined {
    const s = monster.state;
    let best: PlayerSim | undefined;
    let bestDistance = Infinity;
    for (const player of this.players.values()) {
      const p = player.state;
      if (player.world !== monster.world || inSafe(monster.world, p.x, p.y)) continue;
      const distance = chebyshev(s.x, s.y, p.x, p.y);
      if (distance <= monster.def.aggroRange && distance < bestDistance) {
        best = player;
        bestDistance = distance;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ combate

  /**
   * Ataque especial em área (baforada, explosão): atinge todo jogador nas casas da área.
   * Devolve falso quando o alvo está fora do alcance (aí o monstro só anda e morde).
   */
  private monsterSpecial(monster: MonsterSim, target: PlayerSim): boolean {
    const special = monster.def.special!;
    const s = monster.state;
    const t = target.state;
    const distance = chebyshev(s.x, s.y, t.x, t.y);
    if (distance > special.range || inSafe(monster.world, t.x, t.y)) return false;
    const now = Date.now();
    monster.nextSpecialAt = now + special.cooldownMs * (0.85 + Math.random() * 0.3);
    monster.nextAttackAt = Math.max(monster.nextAttackAt, now + 700);
    this.face(s, t);
    const tiles =
      special.kind === "wave"
        ? cone(s, dirIndex(t.x - s.x, t.y - s.y), special.range)
        : special.kind === "blast"
          ? square(t, special.radius ?? 1, false)
          : square(s, special.range, true);
    const sim = monster.world;
    const inside = new Set(tiles.map((tile) => tileKey(sim, tile.x, tile.y)));
    this.sendNear(sim.def.slug, t.x, t.y, ServerMsg.MonsterSpell, {
      caster: monster.id,
      element: special.element,
      kind: special.kind,
      tiles: tiles.flatMap((tile) => [tile.x, tile.y]),
      x: t.x,
      y: t.y,
    } satisfies MonsterSpellEvent);
    for (const player of this.players.values()) {
      const p = player.state;
      if (player.world !== sim || p.hp <= 0 || !inside.has(tileKey(sim, p.x, p.y)) || inSafe(sim, p.x, p.y)) continue;
      const { armor } = this.statsOf(player);
      const damage = Math.max(0, Math.round(special.power * (0.8 + Math.random() * 0.4) * monster.scale ** 0.5 - armor * 0.5));
      if (damage === 0) {
        this.broadcastHit(player.id, monster.id, 0, "block");
        continue;
      }
      p.hp -= damage;
      this.broadcastHit(player.id, monster.id, damage, "damage");
      if (!p.target && !player.moveDir && player.path.length === 0) p.target = monster.id;
      if (p.hp <= 0) this.killPlayer(player, monster);
    }
    return true;
  }

  private monsterAttack(monster: MonsterSim, player: PlayerSim) {
    // Revida sozinho quando está parado e sem alvo; não atrapalha quem está fugindo.
    if (!player.state.target && !player.moveDir && player.path.length === 0) player.state.target = monster.id;
    const { armor } = this.statsOf(player);
    const damage = Math.max(0, Math.round(randInt(Math.random, 0, monster.def.maxHit) * monster.scale ** 0.5) - armor);
    if (damage === 0) {
      this.broadcastHit(player.id, monster.id, 0, "block");
      return;
    }
    player.state.hp -= damage;
    this.broadcastHit(player.id, monster.id, damage, "damage");
    if (player.state.hp <= 0) this.killPlayer(player, monster);
  }

  /** Monstro ou jogador por id, para quem não precisa saber qual dos dois é. */
  private combatant(id: string): Combatant | undefined {
    return this.monsters.get(id) ?? this.players.get(id);
  }

  /** O que `canAttack` precisa saber de `a`, do ponto de vista de um confronto com `b`. */
  private fighterOf(a: PlayerSim, b: PlayerSim): Fighter {
    return {
      level: a.state.level,
      markedUntil: a.markedUntil,
      inSafe: inSafe(a.world, a.state.x, a.state.y),
      attackedAt: a.attackedBy.get(b.id) ?? 0,
    };
  }

  /**
   * Por que `a` não pode bater em `b`, ou null quando pode. Uma regra, um lugar: a mira, o
   * auto-ataque e a magia de área perguntam aqui em vez de cada um inventar a sua versão.
   */
  private pvpRefusal(a: PlayerSim, b: PlayerSim): string | null {
    if (a === b) return "Você não pode atacar a si mesmo.";
    if (a.world !== b.world) return "Esse jogador não está neste mundo.";
    if (a.world.def.pvp !== "open") return "Aqui não se ataca outro jogador.";
    return canAttack(this.fighterOf(a, b), this.fighterOf(b, a), pvpSettings(), Date.now());
  }

  private canHit(attacker: PlayerSim, target: Combatant): boolean {
    return isPlayerSim(target) ? this.pvpRefusal(attacker, target) === null : true;
  }

  /** Despacha o golpe para o lado certo. */
  private damage(target: Combatant, attacker: PlayerSim, amount: number, crit = false) {
    if (isPlayerSim(target)) this.damagePlayer(target, attacker, amount, crit);
    else this.damageMonster(target, attacker, amount, crit);
  }

  /** Marca o agressor e avisa a vizinhança: a caveira é o que faz a punição existir socialmente. */
  private markPlayer(player: PlayerSim, agora: number) {
    const minutos = pvpSettings().markMinutes;
    if (minutos <= 0) return;
    const novo = agora + minutos * 60_000;
    if (novo <= player.markedUntil) return;
    const estreia = !player.state.marked;
    player.markedUntil = novo;
    player.state.marked = true;
    if (estreia) {
      this.sendChat(player.client, "system", `Você atacou alguém sem ser atacado e ficou marcado por ${minutos} minutos.`);
    }
    this.sendPvp(player);
    void this.persist(player);
  }

  private damagePlayer(target: PlayerSim, attacker: PlayerSim, amount: number, crit = false) {
    if (!this.players.has(target.id) || target === attacker) return;
    if (this.pvpRefusal(attacker, target)) return;
    const agora = Date.now();
    const settings = pvpSettings();

    // A marca nasce antes do dano: depois do golpe o alvo já consta como atacado, e aí todo
    // ataque pareceria revide.
    if (marksAttacker(this.fighterOf(attacker, target), this.fighterOf(target, attacker), settings, agora)) {
      this.markPlayer(attacker, agora);
    }
    target.attackedBy.set(attacker.id, agora);

    const s = target.state;
    if (amount <= 0) {
      this.broadcastHit(target.id, attacker.id, 0, "block");
      return;
    }
    s.hp = Math.max(0, s.hp - amount);
    this.broadcastHit(target.id, attacker.id, amount, crit ? "crit" : "damage");
    if (s.hp <= 0) this.killPlayer(target, attacker);
  }

  private damageMonster(monster: MonsterSim, attacker: PlayerSim, amount: number, crit = false) {
    if (!this.monsters.has(monster.id)) return;
    const s = monster.state;

    if (amount <= 0) {
      this.broadcastHit(monster.id, attacker.id, 0, "block");
    } else {
      const dealt = Math.min(amount, s.hp);
      monster.damageBy.set(attacker.id, (monster.damageBy.get(attacker.id) ?? 0) + dealt);
      s.hp = Math.max(0, s.hp - amount);
      this.broadcastHit(monster.id, attacker.id, amount, crit ? "crit" : "damage");
    }

    if (!monster.targetId && !inSafe(monster.world, attacker.state.x, attacker.state.y)) {
      monster.targetId = attacker.id;
      monster.nextAttackAt = Math.max(monster.nextAttackAt, Date.now() + 500);
    }
    if (s.hp <= 0) this.killMonster(monster);
  }

  private killMonster(monster: MonsterSim) {
    const { def, state: s } = monster;
    const sim = monster.world;
    this.removeMonster(monster.id);
    this.sendNear(sim.def.slug, s.x, s.y, ServerMsg.MonsterDeath, { id: monster.id, kind: def.kind, x: s.x, y: s.y } satisfies MonsterDeathEvent);

    const totalDamage = [...monster.damageBy.values()].reduce((sum, value) => sum + value, 0);
    let topDamager: PlayerSim | undefined;
    let topDamage = 0;
    for (const [playerId, damage] of monster.damageBy) {
      const player = this.players.get(playerId);
      if (!player || totalDamage <= 0) continue;
      if (damage > topDamage) {
        topDamage = damage;
        topDamager = player;
      }
      const multiplier = XP_RATE * this.eventManager.xpMultiplierFor(sim) * (1 + this.bonusesOf(player).xp);
      this.giveXp(player, Math.max(1, Math.round((def.xp * monster.scale * multiplier * damage) / totalDamage)));
      this.creditQuests(player, monster);
    }

    if (topDamager) {
      topDamager.kills += 1;
      if (def.boss) this.announce(`${topDamager.state.name} derrotou ${def.name} em ${sim.def.name}!`);
      const goldBonus = this.bonusesOf(topDamager).gold + this.eventManager.goldMultiplierFor(sim) - 1;
      for (const drop of rollDrops(Math.random, def, goldBonus)) {
        this.dropLoot(sim, drop, s.x, s.y, topDamager.id);
      }
      const gear = rollGear(Math.random, MONSTER_LEVEL[def.kind] ?? 1, def.boss === true, gearSettings().dropRate);
      if (gear) {
        const count = dropCount(Math.random, gear);
        this.dropLoot(sim, { kind: "item", gold: 0, diamonds: 0, item: gear.id, count }, s.x, s.y, topDamager.id);
      }
    }

    if (monster.questId) this.finishBossQuest(monster);
    if (monster.respawns) this.after(def.respawnMs, () => this.respawn(sim, def.kind, monster.home));
    if (monster.nestId) {
      const nest = sim.spawns.find((entry) => entry.id === monster.nestId);
      sim.nestAlive.set(monster.nestId, Math.max(0, (sim.nestAlive.get(monster.nestId) ?? 1) - 1));
      if (nest) this.after(nest.respawnMs || def.respawnMs || 30_000, () => this.spawnFromNest(sim, nest));
    }
    monster.onDeath?.();
  }

  private respawn(sim: WorldSim, kind: MonsterKind, home: Point) {
    if (!this.spawnMonster(sim, kind, home, { respawns: true })) this.after(5000, () => this.respawn(sim, kind, home));
  }

  private giveXp(player: PlayerSim, amount: number) {
    const s = player.state;
    // A taxa do painel vale para tudo o que dá XP: monstro, missão, presente e baú.
    const gained = Math.max(1, Math.round(amount * xpRate()));
    s.xp += gained;
    this.sendNear(player.world.def.slug, s.x, s.y, ServerMsg.Xp, { id: player.id, amount: gained } satisfies XpEvent);

    const newLevel = levelForXp(s.xp);
    if (newLevel <= s.level) return;
    const oldLevel = s.level;
    s.level = newLevel;
    const stats = this.statsOf(player);
    s.maxHp = stats.maxHp;
    s.maxMana = stats.maxMana;
    s.hp = stats.maxHp;
    s.mana = stats.maxMana;
    this.sendNear(player.world.def.slug, s.x, s.y, ServerMsg.LevelUp, { id: player.id, level: newLevel } satisfies LevelUpEvent);
    this.sendChat(player.client, "system", `Você avançou do nível ${oldLevel} para o nível ${newLevel}.`);
    for (let level = oldLevel + 1; level <= newLevel; level++) {
      for (const spell of spellsUnlockedAt(level, vocationFamilies(player.vocation))) {
        this.sendChat(player.client, "event", `Novo poder: ${spell.name} — ${spell.description}.`);
      }
    }
    // Graus antigos sobem sozinhos, e poder novo entra numa vaga livre da barra.
    const shortcuts = sanitizeShortcuts(player.shortcuts, s.level, vocationFamilies(player.vocation));
    if (shortcuts.join(",") !== player.shortcuts.join(",")) {
      player.shortcuts = shortcuts;
      this.sendProfile(player);
    }
    if (Math.floor(newLevel / 10) > Math.floor(oldLevel / 10)) {
      this.broadcastChat("event", `${s.name} alcançou o nível ${newLevel}!`);
    }
    void this.grantMilestones(player);
    void this.persist(player);
  }

  /**
   * O que a vítima perde da mochila ao morrer para outro jogador. Devolve os ids que caíram.
   *
   * Só item solto: equipamento vestido não cai, e item comprado com diamante nunca cai. É o
   * que impede a queda de item de virar pedido de estorno num jogo onde se paga por
   * equipamento. O Amuleto de Proteção se consome e salva a mochila inteira.
   */
  private dropOnPvpDeath(player: PlayerSim, killer: PlayerSim): string[] {
    const settings = pvpSettings();
    const sim = player.world;
    const s = player.state;
    if (hasProtection(player.items)) {
      const amuleto = player.items.find((item) => item.itemId === PROTECTION_ITEM && item.equipped === "amulet");
      if (amuleto) {
        this.consume(player, amuleto, 1);
        this.sendChat(player.client, "event", "Seu Amuleto de Proteção se partiu e salvou tudo que você carregava.");
      }
      return [];
    }

    const caem = droppableItems(player.items, settings.dropSlots, player.markedUntil > Date.now());
    const ids: string[] = [];
    for (const item of caem) {
      const drop = { kind: "item" as const, gold: 0, diamonds: 0, item: item.itemId, count: item.count };
      // Cai com o matador como dono: o dropLoot já lhe dá primeira-mão antes de liberar geral.
      if (!this.dropLoot(sim, drop, s.x, s.y, killer.id)) continue;
      ids.push(item.itemId);
      this.consume(player, item, item.count);
    }
    if (ids.length > 0) this.sendInventory(player);
    return ids;
  }

  private killPlayer(player: PlayerSim, killer: Combatant) {
    const s = player.state;
    const levelFloor = xpForLevel(s.level);
    // O VIP reduz ou zera a perda: é o benefício que mais se sente, porque dói na hora.
    const perda = DEATH_XP_LOSS * (this.vipOf(player)?.deathXpFactor ?? 1);
    const xpLost = Math.max(0, Math.min(Math.round(s.xp * perda), s.xp - levelFloor));
    s.xp -= xpLost;

    const porJogador = isPlayerSim(killer);
    const nomeDoMatador = porJogador ? killer.state.name : killer.def.name;
    const caidos = porJogador ? this.dropOnPvpDeath(player, killer) : [];

    this.sendNear(player.world.def.slug, s.x, s.y, ServerMsg.PlayerDeath, {
      id: player.id,
      x: s.x,
      y: s.y,
      xpLost,
      killer: porJogador ? killer.id : "",
      dropped: caidos,
    } satisfies PlayerDeathEvent);
    const perdeu = [xpLost > 0 ? `perdeu ${xpLost} de experiência` : "", caidos.length > 0 ? `deixou cair ${caidos.length} item(ns)` : ""]
      .filter(Boolean)
      .join(" e ");
    this.sendChat(player.client, "system", `Você foi morto por ${nomeDoMatador}${perdeu ? ` e ${perdeu}` : ""}.`);
    if (porJogador) {
      this.sendChat(killer.client, "event", `Você derrotou ${s.name}.`);
      void recordPvpKill({
        killerId: killer.characterId,
        victimId: player.characterId,
        killerName: killer.state.name,
        victimName: s.name,
        worldId: player.world.def.id,
        markedKiller: killer.markedUntil > Date.now(),
        droppedItems: caidos,
      }).catch(() => undefined);
    }

    for (const monster of this.monsters.values()) {
      if (monster.targetId === player.id) monster.targetId = null;
    }

    const sim = player.world;
    const home = { x: sim.def.spawnX, y: sim.def.spawnY };
    const spot = findFreeTile(sim, home.x, home.y, false) ?? home;
    occupyPlayer(sim, s.x, s.y, player.id, false);
    s.x = spot.x;
    s.y = spot.y;
    occupyPlayer(sim, s.x, s.y, player.id, true);
    player.nextPortalAt = Date.now() + 800;
    s.hp = s.maxHp;
    s.mana = s.maxMana;
    s.target = "";
    player.path = [];
    player.moveDir = null;
  }

  private regenerate() {
    const agora = Date.now();
    const janela = pvpSettings().retaliationMinutes * 60_000;
    for (const player of this.players.values()) {
      const s = player.state;
      const boost = inSafe(player.world, s.x, s.y) ? 3 : 1;
      s.hp = Math.min(s.maxHp, s.hp + boost * (1 + Math.floor(s.level / 5)));
      s.mana = Math.min(s.maxMana, s.mana + boost * (2 + Math.floor(s.level / 4)));

      // A marca vence aqui, de segundo em segundo, em vez de custar uma conferência por tick.
      if (player.markedUntil > 0 && player.markedUntil <= agora) {
        player.markedUntil = 0;
        s.marked = false;
        this.sendChat(player.client, "event", "Sua marca de agressor passou.");
        this.sendPvp(player);
        void this.persist(player);
      }
      // E a janela de revide, para o mapa não crescer sem fim numa sessão longa.
      if (player.attackedBy.size > 0) {
        for (const [id, quando] of player.attackedBy) if (agora - quando > janela) player.attackedBy.delete(id);
      }

      // O VIP vence aqui também: nada de conferir prazo a cada tick.
      if (player.vipTier && player.vipUntil > 0 && player.vipUntil <= agora && s.vip > 0) {
        const nome = vipTier(player.vipTier)?.name ?? "VIP";
        this.refreshVipLook(player);
        this.sendChat(player.client, "event", `Seu ${nome} terminou.`);
        this.sendInventory(player);
        void this.sendVip(player);
      }
    }
  }

  /** As regras do PvP e a marca dele, para a tela avisar antes de o jogador tentar. */
  private sendPvp(player: PlayerSim) {
    if (!this.players.has(player.id)) return;
    const s = pvpSettings();
    player.client.send(ServerMsg.Pvp, {
      enabled: s.enabled,
      minLevel: s.minLevel,
      levelRatio: s.levelRatio,
      dropSlots: s.dropSlots,
      markMinutes: s.markMinutes,
      openHere: player.world.def.pvp === "open",
      markedUntil: player.markedUntil,
    } satisfies PvpInfoEvent);
  }

  private adjacentMonsters(sim: WorldSim, center: Point): MonsterSim[] {
    const result: MonsterSim[] = [];
    for (const d of DIRS) {
      const id = sim.monsterAt.get(tileKey(sim, center.x + d.x, center.y + d.y));
      const monster = id ? this.monsters.get(id) : undefined;
      if (monster) result.push(monster);
    }
    return result;
  }

  // ------------------------------------------------------------ drops

  /**
   * Põe um drop no chão, no tile da morte ou no mais perto que estiver livre.
   * `forever` é para os tesouros do editor, que não somem com o tempo.
   */
  private dropLoot(
    sim: WorldSim,
    drop: DropRoll,
    x: number,
    y: number,
    owner: string,
    options: { forever?: boolean } = {},
  ): string | null {
    const spot = freeLootTile(sim, x, y);
    if (!spot) return null;
    const now = Date.now();
    const id = `l${this.nextLootId++}`;
    const state = new LootState({
      kind: drop.kind,
      world: sim.def.slug,
      x: spot.x,
      y: spot.y,
      gold: drop.gold,
      diamonds: drop.diamonds,
      item: drop.item ?? "",
      count: drop.count ?? 1,
      owner,
      freeAt: options.forever ? 0 : now + LOOT_OWNER_MS,
      expiresAt: options.forever ? Number.MAX_SAFE_INTEGER : now + LOOT_TTL_MS,
    });
    this.state.loot.set(id, state);
    const key = tileKey(sim, spot.x, spot.y);
    const ids = sim.lootAt.get(key);
    if (ids) ids.push(id);
    else sim.lootAt.set(key, [id]);
    return id;
  }

  /** Quem está pisando no drop leva. Nos primeiros segundos, só quem derrubou o monstro. */
  private collectLoot(player: PlayerSim, now: number) {
    const sim = player.world;
    const key = tileKey(sim, player.state.x, player.state.y);
    const ids = sim.lootAt.get(key);
    if (!ids) return;
    for (const id of [...ids]) {
      const loot = this.state.loot.get(id);
      if (!loot) {
        this.removeLoot(sim, id, key);
        continue;
      }
      if (loot.owner && loot.owner !== player.id && now < loot.freeAt) continue;
      if (loot.kind === "item" && this.room(player, loot.item) < Math.max(1, loot.count)) {
        if (now - player.bagFullWarnAt > 5000) {
          player.bagFullWarnAt = now;
          this.sendChat(player.client, "system", "Sua mochila está cheia. Venda ou equipe algum item (tecla I).");
        }
        continue;
      }
      this.removeLoot(sim, id, key);
      this.giveLoot(player, loot);
    }
  }

  private removeLoot(sim: WorldSim, id: string, key: number) {
    this.state.loot.delete(id);
    const ids = sim.lootAt.get(key)?.filter((other) => other !== id) ?? [];
    if (ids.length > 0) sim.lootAt.set(key, ids);
    else sim.lootAt.delete(key);

    // Era um tesouro fixo do editor: marca quando ele volta ao chão.
    const itemId = sim.itemOfLoot.get(id);
    if (itemId === undefined) return;
    sim.itemOfLoot.delete(id);
    sim.itemLoot.delete(itemId);
    const item = sim.items.find((entry) => entry.id === itemId);
    sim.itemReadyAt.set(itemId, Date.now() + (item?.respawnMs || 300_000));
  }

  private giveLoot(player: PlayerSim, loot: LootState) {
    if (loot.kind === "item") {
      this.giveItemLoot(player, loot);
      return;
    }
    const def = LOOT[loot.kind as keyof typeof LOOT];
    const s = player.state;
    if (loot.gold > 0) s.gold += loot.gold;
    if (loot.diamonds > 0) {
      const amount = loot.diamonds;
      player.diamonds += amount;
      void this.enqueue(player, async () => {
        player.diamonds = await addDiamonds(player.accountId, amount);
        this.sendProfile(player);
      }).catch(() => undefined);
    }

    this.sendNear(loot.world, loot.x, loot.y, ServerMsg.Loot, {
      id: player.id,
      kind: loot.kind as LootEvent["kind"],
      gold: loot.gold,
      diamonds: loot.diamonds,
      x: loot.x,
      y: loot.y,
    } satisfies LootEvent);

    const description = describeDrop(loot);
    if (def.announce) this.announce(`${s.name} encontrou um ${def.name} (${description})!`);
    else if (def.rarity !== "comum") this.sendChat(player.client, "loot", `${def.name}: ${description}.`);
    if (loot.gold > 0 || loot.diamonds > 0) void this.persist(player);
  }

  /** Item do chão vai para a mochila (junta com a pilha que já existir). */
  private giveItemLoot(player: PlayerSim, loot: LootState) {
    const item = gearItem(loot.item);
    if (!item) return;
    const count = Math.max(1, loot.count);
    this.sendNear(loot.world, loot.x, loot.y, ServerMsg.Loot, {
      id: player.id,
      kind: "item",
      item: item.id,
      gold: 0,
      diamonds: 0,
      x: loot.x,
      y: loot.y,
    } satisfies LootEvent);
    const rarity = RARITY[item.rarity].label;
    const label = count > 1 ? `${count}× ${item.name}` : item.name;
    if (item.rarity === "epico" || item.rarity === "lendario") this.announce(`${player.state.name} encontrou ${label} (${rarity})!`);
    else this.sendChat(player.client, "loot", `Você encontrou ${label} (${rarity}).`);
    this.grantItem(player, item.id, count);
  }

  // ------------------------------------------------------------ mochila e equipamentos

  private capacity(player: PlayerSim): number {
    return bagCapacity(player.items, this.vipOf(player)?.bagSlots ?? 0);
  }

  private bagItems(player: PlayerSim): OwnedItem[] {
    return player.items.filter((item) => item.equipped === "");
  }

  private bagCount(player: PlayerSim): number {
    return this.bagItems(player).length;
  }

  private itemAt(player: PlayerSim, position: number): OwnedItem | undefined {
    return player.items.find((item) => item.equipped === "" && item.position === position);
  }

  /** Primeiro espaço livre da grade, ou -1. */
  private freePosition(player: PlayerSim, except?: OwnedItem): number {
    const taken = new Set(this.bagItems(player).filter((item) => item !== except).map((item) => item.position));
    const capacity = this.capacity(player);
    for (let i = 0; i < capacity; i++) if (!taken.has(i)) return i;
    return -1;
  }

  /** Quantos dessa coisa ainda cabem (nas pilhas que já existem e nos espaços livres). */
  private room(player: PlayerSim, itemId: string): number {
    const item = gearItem(itemId);
    if (!item) return 0;
    const inStacks = this.bagItems(player)
      .filter((owned) => owned.itemId === itemId)
      .reduce((sum, owned) => sum + Math.max(0, item.stack - owned.count), 0);
    const free = this.capacity(player) - this.bagCount(player);
    return inStacks + Math.max(0, free) * item.stack;
  }

  /**
   * Põe itens na mochila (drop, compra, presente): primeiro completa as pilhas, depois ocupa espaços livres.
   * Devolve quantos entraram. As pilhas novas ganham o id do banco logo em seguida.
   */
  private grantItem(player: PlayerSim, itemId: string, count = 1, after?: () => void): number {
    const item = gearItem(itemId);
    if (!item || count <= 0) return 0;
    let left = count;
    const touched: OwnedItem[] = [];
    for (const owned of this.bagItems(player)) {
      if (left <= 0 || owned.itemId !== itemId || owned.count >= item.stack || owned.uid === 0) continue;
      const add = Math.min(left, item.stack - owned.count);
      owned.count += add;
      left -= add;
      touched.push(owned);
    }
    const created: OwnedItem[] = [];
    while (left > 0) {
      const position = this.freePosition(player);
      if (position < 0) break;
      const amount = Math.min(left, item.stack);
      const owned: OwnedItem = { uid: 0, itemId, count: amount, equipped: "", position };
      player.items.push(owned);
      created.push(owned);
      left -= amount;
    }
    this.enqueue(player, async () => {
      for (const owned of touched) await saveCharacterItem(player.characterId, owned);
      for (const owned of created) owned.uid = await addCharacterItem(player.characterId, itemId, owned.count, owned.position);
      this.sendInventory(player);
      after?.();
    }).catch(() => {
      player.items = player.items.filter((entry) => !created.includes(entry));
      this.sendInventory(player);
    });
    this.sendInventory(player);
    return count - left;
  }

  private saveItem(player: PlayerSim, ...items: OwnedItem[]) {
    this.enqueue(player, async () => {
      for (const item of items) if (item.uid > 0) await saveCharacterItem(player.characterId, item);
    }).catch(() => undefined);
  }

  /** Tira `count` de uma pilha; a pilha vazia some da mochila e do banco. */
  private consume(player: PlayerSim, owned: OwnedItem, count: number) {
    owned.count -= count;
    if (owned.count > 0) {
      this.saveItem(player, owned);
      return;
    }
    player.items = player.items.filter((entry) => entry !== owned);
    const wasEquipped = owned.equipped !== "";
    this.enqueue(player, () => removeCharacterItem(player.characterId, owned.uid)).catch(() => undefined);
    if (wasEquipped) this.refreshGear(player);
  }

  /** Itens de antes da grade (ou fora dela depois de trocar de mochila) ganham um lugar. */
  private settleBag(player: PlayerSim) {
    const capacity = this.capacity(player);
    const seen = new Set<number>();
    const moved: OwnedItem[] = [];
    for (const item of this.bagItems(player)) {
      if (item.position >= 0 && item.position < capacity && !seen.has(item.position)) {
        seen.add(item.position);
        continue;
      }
      let spot = 0;
      while (seen.has(spot)) spot++;
      item.position = spot;
      seen.add(spot);
      moved.push(item);
    }
    if (moved.length > 0) this.saveItem(player, ...moved);
  }

  /** Atributos com os equipamentos. */
  private statsOf(player: PlayerSim): PlayerStats {
    return withGear(playerStats(player.state.level, player.vocation), player.gear);
  }

  /** Recalcula atributos e visual depois de vestir, tirar ou o painel mudar um item. */
  private refreshGear(player: PlayerSim) {
    player.gear = equippedStats(player.items);
    const s = player.state;
    const stats = this.statsOf(player);
    s.maxHp = stats.maxHp;
    s.maxMana = stats.maxMana;
    s.hp = Math.min(s.hp, s.maxHp);
    s.mana = Math.min(s.mana, s.maxMana);
    s.looks = looksOf(player.items);
    this.sendInventory(player);
  }

  private sendInventory(player: PlayerSim) {
    if (!this.players.has(player.id)) return;
    player.client.send(ServerMsg.Inventory, {
      items: player.items.filter((item) => item.uid > 0),
      stats: player.gear,
      capacity: this.capacity(player),
    } satisfies InventoryEvent);
  }

  private itemNotice(player: PlayerSim, ok: boolean, message: string) {
    this.sendPurchase(player, ok, "", message);
  }

  private ownedBy(player: PlayerSim, uid: unknown): OwnedItem | undefined {
    const id = Number(uid);
    return player.items.find((item) => item.uid > 0 && item.uid === id);
  }

  /** Clique duplo: veste no espaço certo, ou usa (poção). */
  private handleItemEquip(client: Client, message: ItemEquipMessage) {
    const player = this.players.get(client.sessionId);
    const owned = player && this.ownedBy(player, message?.uid);
    const item = owned ? gearItem(owned.itemId) : undefined;
    if (!player || !owned || !item) return;
    if (!item.slot) {
      this.useItem(player, owned);
      return;
    }
    if (owned.equipped) this.moveItem(player, owned, "bag", this.freePosition(player));
    else this.moveItem(player, owned, item.slot);
  }

  private handleItemMove(client: Client, message: ItemMoveMessage) {
    const player = this.players.get(client.sessionId);
    const owned = player && this.ownedBy(player, message?.uid);
    if (!player || !owned) return;
    const to = String(message?.to ?? "");
    if (to === "bag") this.moveItem(player, owned, "bag", Number(message?.index), Number(message?.count) || undefined);
    else if (EQUIP_SLOTS.includes(to as EquipSlot)) this.moveItem(player, owned, to as EquipSlot);
  }

  /**
   * Arrastar e soltar: para um espaço do corpo ou para uma casa da grade.
   * Troca de lugar com o que estiver lá, junta pilhas iguais e divide pilhas (`count`).
   */
  private moveItem(player: PlayerSim, owned: OwnedItem, to: EquipSlot | "bag", index = -1, count?: number) {
    const item = gearItem(owned.itemId);
    if (!item) return;
    const changed = new Set<OwnedItem>([owned]);
    const finish = () => {
      this.saveItem(player, ...changed);
      this.refreshGear(player);
    };

    if (to !== "bag") {
      if (item.slot !== to) {
        this.itemNotice(player, false, `${item.name} não vai no espaço ${SLOT_LABEL[to].toLowerCase()}.`);
        return;
      }
      if (player.state.level < item.level) {
        this.itemNotice(player, false, `${item.name} precisa do nível ${item.level}.`);
        return;
      }
      if (owned.equipped === to) return;
      const current = player.items.find((entry) => entry.equipped === to);
      if (to === "backpack") {
        // A mochila nova precisa comportar tudo o que está na grade (e a velha, que volta para ela).
        const capacity = Math.min(BAG_MAX, BAG_BASE + item.bagSlots);
        const returning = current ? (owned.equipped === "" ? owned.position : this.freePosition(player)) : -1;
        const overflow = this.bagItems(player).some((entry) => entry !== owned && entry.position >= capacity);
        if (overflow || returning >= capacity) {
          this.itemNotice(player, false, "A mochila nova é menor: esvazie os últimos espaços antes de trocar.");
          return;
        }
      }
      // Munição igual: junta na pilha vestida.
      if (current && current.itemId === owned.itemId && item.stack > 1) {
        const add = Math.min(owned.count, item.stack - current.count);
        if (add <= 0) return;
        current.count += add;
        this.saveItem(player, current);
        this.consume(player, owned, add);
        this.refreshGear(player);
        return;
      }
      if (current) {
        // O que estava vestido vai para onde o novo estava (ou para um espaço livre).
        const spot = owned.equipped === "" ? owned.position : this.freePosition(player);
        if (spot < 0) {
          this.itemNotice(player, false, "A mochila está cheia.");
          return;
        }
        current.equipped = "";
        current.position = spot;
        changed.add(current);
      }
      owned.equipped = to;
      owned.position = -1;
      finish();
      return;
    }

    // Para a grade.
    const capacity = this.capacity(player);
    if (!Number.isInteger(index) || index < 0 || index >= capacity) index = this.freePosition(player, owned);
    if (index < 0) {
      this.itemNotice(player, false, "A mochila está cheia.");
      return;
    }
    const target = this.itemAt(player, index);
    if (target === owned) return;

    // Dividir pilha: parte vai para uma casa vazia.
    if (count !== undefined && count > 0 && count < owned.count && owned.equipped === "") {
      if (target && target.itemId !== owned.itemId) return;
      if (target) {
        const add = Math.min(count, item.stack - target.count);
        if (add <= 0) return;
        target.count += add;
        owned.count -= add;
        this.saveItem(player, target, owned);
        this.sendInventory(player);
        return;
      }
      owned.count -= count;
      this.saveItem(player, owned);
      const split: OwnedItem = { uid: 0, itemId: owned.itemId, count, equipped: "", position: index };
      player.items.push(split);
      this.enqueue(player, async () => {
        split.uid = await addCharacterItem(player.characterId, split.itemId, split.count, split.position);
        this.sendInventory(player);
      }).catch(() => undefined);
      this.sendInventory(player);
      return;
    }

    // Juntar pilhas iguais.
    if (target && target.itemId === owned.itemId && item.stack > 1) {
      const add = Math.min(owned.count, item.stack - target.count);
      if (add > 0) {
        target.count += add;
        this.saveItem(player, target);
        this.consume(player, owned, add);
        this.refreshGear(player);
        return;
      }
    }

    if (owned.equipped !== "") {
      const slot = owned.equipped;
      if (slot === "backpack" && !this.fitsAfterBackpack(player, 0, owned, index)) {
        this.itemNotice(player, false, "Sem a mochila, os últimos espaços somem: esvazie-os antes de tirar.");
        return;
      }
      if (target) {
        const other = gearItem(target.itemId);
        if (!other || other.slot !== slot || player.state.level < other.level) {
          this.itemNotice(player, false, "Esse espaço está ocupado.");
          return;
        }
        target.equipped = slot;
        target.position = -1;
        changed.add(target);
      }
      owned.equipped = "";
      owned.position = index;
      finish();
      return;
    }

    if (target) {
      target.position = owned.position;
      changed.add(target);
    }
    owned.position = index;
    this.saveItem(player, ...changed);
    this.sendInventory(player);
  }

  /** Com uma mochila de `bagSlots` espaços extras, tudo o que está na grade ainda cabe? */
  private fitsAfterBackpack(player: PlayerSim, bagSlots: number, leaving: OwnedItem, arrivingAt = -1): boolean {
    const capacity = Math.min(BAG_MAX, BAG_BASE + bagSlots);
    const bag = this.bagItems(player).filter((item) => item !== leaving);
    if (arrivingAt >= capacity) return false;
    return bag.every((item) => item.position < capacity);
  }

  private handleItemUse(client: Client, message: ItemUseMessage) {
    const player = this.players.get(client.sessionId);
    const owned = player && this.ownedBy(player, message?.uid);
    if (player && owned) this.useItem(player, owned);
  }

  /** Teclas Q e E: a melhor poção que o nível permite. */
  private handleQuickPotion(client: Client, message: QuickPotionMessage) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    const key = message?.kind === "mana" ? "restore" : "heal";
    const candidates = this.bagItems(player)
      .map((owned) => ({ owned, item: gearItem(owned.itemId) }))
      .filter(({ item }) => item && item[key] > 0 && item.level <= player.state.level)
      .sort((a, b) => b.item![key] - a.item![key]);
    const best = candidates[0];
    if (!best) {
      this.sendChat(player.client, "system", key === "heal" ? "Sem poção de vida na mochila." : "Sem poção de mana na mochila.");
      return;
    }
    this.useItem(player, best.owned);
  }

  private useItem(player: PlayerSim, owned: OwnedItem) {
    const item = gearItem(owned.itemId);
    const s = player.state;
    if (!item || (item.heal <= 0 && item.restore <= 0) || s.hp <= 0) return;
    const now = Date.now();
    if (now < player.nextPotionAt) return;
    if (s.level < item.level) {
      this.itemNotice(player, false, `${item.name} precisa do nível ${item.level}.`);
      return;
    }
    // Não desperdiça: só bebe se tiver o que recuperar.
    const missingHp = item.heal > 0 && s.hp < s.maxHp;
    const missingMana = item.restore > 0 && s.mana < s.maxMana;
    if (!missingHp && !missingMana) {
      this.sendChat(player.client, "system", item.heal > 0 ? "Sua vida já está cheia." : "Sua mana já está cheia.");
      return;
    }
    player.nextPotionAt = now + POTION_COOLDOWN_MS;
    if (item.heal > 0) {
      const healed = Math.min(item.heal, s.maxHp - s.hp);
      s.hp += healed;
      this.broadcastHit(player.id, player.id, healed, "heal");
    }
    if (item.restore > 0) s.mana = Math.min(s.maxMana, s.mana + item.restore);
    this.consume(player, owned, 1);
    this.sendInventory(player);
  }

  private handleItemSell(client: Client, message: ItemSellMessage) {
    const player = this.players.get(client.sessionId);
    const owned = player && this.ownedBy(player, message?.uid);
    if (!player || !owned) return;
    const item = gearItem(owned.itemId);
    const count = Math.min(owned.count, Math.max(1, Math.floor(Number(message?.count) || owned.count)));
    const price = (item?.sellGold ?? 0) * count;
    player.state.gold += price;
    this.consume(player, owned, count);
    this.sendInventory(player);
    const label = count > 1 ? `${count}× ${item?.name ?? "item"}` : (item?.name ?? "item");
    this.itemNotice(player, true, `Vendido: ${label} por ${price} moedas de ouro.`);
    void this.persist(player);
  }

  private handleItemBuy(client: Client, message: ItemBuyMessage) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    const item = gearItem(String(message?.id ?? ""));
    const currency = message?.currency === "diamonds" ? "diamonds" : "gold";
    const unit = currency === "gold" ? (item?.priceGold ?? 0) : (item?.priceDiamonds ?? 0);
    if (!item || !item.enabled || unit <= 0) {
      this.itemNotice(player, false, "Item indisponível.");
      return;
    }
    const count = Math.min(item.stack, Math.max(1, Math.floor(Number(message?.count) || 1)));
    if (this.room(player, item.id) < count) {
      this.itemNotice(player, false, "A mochila está cheia.");
      return;
    }
    const price = unit * count;
    const label = count > 1 ? `${count}× ${item.name}` : item.name;
    if (currency === "gold") {
      if (player.state.gold < price) {
        this.itemNotice(player, false, `Faltam ${Math.ceil(price - player.state.gold)} moedas de ouro.`);
        return;
      }
      player.state.gold -= price;
      this.grantItem(player, item.id, count, () => {
        this.itemNotice(player, true, `Você comprou ${label}!`);
        void this.persist(player);
      });
      return;
    }
    const position = this.freePosition(player);
    this.enqueue(player, async () => {
      const result = await buyGearWithDiamonds({ accountId: player.accountId, characterId: player.characterId, item, price, position });
      if (!result.ok) {
        this.itemNotice(player, false, result.message);
        return;
      }
      player.diamonds = result.diamonds;
      player.items.push({ uid: result.uid, itemId: item.id, count: 1, equipped: "", position });
      this.sendProfile(player);
      this.sendInventory(player);
      this.itemNotice(player, true, `Você comprou ${label}!`);
    }).catch(() => this.itemNotice(player, false, "Não foi possível concluir a compra. Tente de novo."));
  }

  /** Arma de longe com munição vestida: alcance da arma. Sem munição, só corpo a corpo. */
  private attackRange(player: PlayerSim): number {
    const weapon = player.items.find((item) => item.equipped === "weapon");
    const range = weapon ? (gearItem(weapon.itemId)?.range ?? 1) : 1;
    if (range <= 1) return 1;
    return player.items.some((item) => item.equipped === "ammo" && item.count > 0) ? range : 1;
  }

  /** Cada disparo gasta uma flecha. */
  private spendAmmo(player: PlayerSim) {
    const ammo = player.items.find((item) => item.equipped === "ammo");
    if (!ammo) return;
    this.consume(player, ammo, 1);
    if (!player.items.includes(ammo)) this.sendChat(player.client, "system", "Suas flechas acabaram.");
    else this.sendInventory(player);
  }

  // ------------------------------------------------------------ classes

  /**
   * Escolhe ou troca a classe. A primeira escolha é de graça; depois custa diamantes, e a
   * conta só é debitada se tiver o saldo — quem não tem, não troca e não perde nada.
   */
  private async handleVocation(client: Client, message: VocationMessage) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    const wanted = vocationById(String(message?.id ?? ""));
    if (!wanted || !wanted.enabled) {
      this.sendChat(client, "system", "Essa classe não existe.");
      return;
    }
    if (wanted.id === player.vocation) return;

    const cost = vocationChangeCost(player.vocation);
    if (cost > 0) {
      const left = await chargeDiamonds(player.accountId, cost);
      if (!this.players.has(player.id)) return;
      if (left === null) {
        this.sendChat(client, "system", `Trocar de classe custa ${cost} diamantes e você não tem esse tanto.`);
        return;
      }
      player.diamonds = left;
    }

    const first = player.vocation === "";
    player.vocation = wanted.id;
    const s = player.state;
    // A classe muda vida, mana e os poderes: recalcula tudo e enche as barras.
    const stats = this.statsOf(player);
    s.maxHp = stats.maxHp;
    s.maxMana = stats.maxMana;
    s.hp = stats.maxHp;
    s.mana = stats.maxMana;
    player.shortcuts = sanitizeShortcuts(player.shortcuts, s.level, vocationFamilies(wanted.id));
    void this.enqueue(player, () => saveCharacterVocation(player.characterId, wanted.id)).catch(() => undefined);
    void this.persist(player);
    this.sendProfile(player);
    this.sendChat(
      client,
      "event",
      first ? `Agora você é ${wanted.name}. ${wanted.description}` : `Você virou ${wanted.name}${cost > 0 ? ` por ${cost} diamantes` : ""}.`,
    );
  }

  // ------------------------------------------------------------ baús de marco

  private async sendMilestones(player: PlayerSim) {
    const taken = await takenMilestones(player.characterId);
    if (!this.players.has(player.id)) return;
    player.client.send(ServerMsg.Milestones, {
      rewards: levelRewardsAll(),
      taken,
      level: player.state.level,
    } satisfies MilestonesEvent);
  }

  /**
   * O painel mexeu nos marcos: todo mundo recebe a lista nova. Um baú criado para um nível
   * que o jogador já passou é entregue na hora, sem esperar ele entrar de novo.
   */
  sendMilestoneList() {
    for (const player of this.players.values()) void this.grantMilestones(player);
  }

  /**
   * Entrega os baús que o nível já alcançou e que ainda não foram pagos. Roda ao entrar
   * (pega os marcos criados depois, ou os níveis ganhos numa mudança de curva) e a cada
   * nível novo. A gravação é que decide: se outra janela pagou antes, aqui não paga de novo.
   */
  private async grantMilestones(player: PlayerSim) {
    const due = await pendingMilestones(player.characterId, player.state.level);
    if (!this.players.has(player.id)) return;
    const paid = new Set(await claimMilestones(player.characterId, due.map((reward) => reward.level)));
    if (!this.players.has(player.id)) return;
    for (const reward of due) {
      if (!paid.has(reward.level)) continue;
      const prizes: string[] = [];
      if (reward.rewardGold > 0) {
        player.state.gold += reward.rewardGold;
        prizes.push(`${reward.rewardGold.toLocaleString("pt-BR")} de ouro`);
      }
      if (reward.rewardDiamonds > 0) {
        const amount = reward.rewardDiamonds;
        player.diamonds += amount;
        prizes.push(`${amount.toLocaleString("pt-BR")} diamantes`);
        void this.enqueue(player, async () => {
          player.diamonds = await addDiamonds(player.accountId, amount);
          this.sendProfile(player);
        }).catch(() => undefined);
      }
      if (reward.rewardItem) {
        const item = gearItem(reward.rewardItem);
        const got = item ? this.grantItem(player, item.id, reward.rewardItemCount) : 0;
        if (item && got > 0) prizes.push(got > 1 ? `${got}× ${item.name}` : item.name);
        else if (item) this.itemNotice(player, false, `A mochila estava cheia: ${item.name} não coube.`);
      }
      const title = reward.name || `Nível ${reward.level}`;
      this.sendChat(player.client, "event", `Marco alcançado — ${title}: você recebeu ${prizes.join(", ") || "nada"}.`);
    }
    if (paid.size > 0) {
      void this.persist(player);
      this.sendProfile(player);
    }
    void this.sendMilestones(player);
  }

  // ------------------------------------------------------------ check-in diário

  private async sendCheckin(player: PlayerSim) {
    const state = await checkinStateFor(player.accountId);
    if (!this.players.has(player.id)) return;
    player.client.send(ServerMsg.Checkin, {
      days: checkinDaysAll(),
      state,
      enabled: checkinSettings().enabled,
    } satisfies CheckinEvent);
  }

  /** O painel mexeu no ciclo: todo mundo recebe a lista nova. */
  sendCheckinList() {
    for (const player of this.players.values()) void this.sendCheckin(player);
  }

  /** Abre o presente do dia: ouro e XP no personagem, diamantes na conta, item na mochila. */
  private async handleCheckinClaim(client: Client) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    const result = await claimCheckin(player.accountId);
    if (!this.players.has(player.id)) return;
    if (!result.ok) {
      const message =
        result.reason === "already" ? "Você já abriu o presente de hoje. Volte amanhã!"
        : result.reason === "off" ? "O presente diário está fechado agora."
        : "Ainda não há presentes configurados.";
      this.sendChat(client, "system", message);
      void this.sendCheckin(player);
      return;
    }

    const { day } = result;
    const rewards: string[] = [];
    if (day.rewardGold > 0) {
      player.state.gold += day.rewardGold;
      rewards.push(`${day.rewardGold.toLocaleString("pt-BR")} de ouro`);
    }
    if (day.rewardXp > 0) {
      this.giveXp(player, Math.round(day.rewardXp));
      rewards.push(`${Math.round(day.rewardXp).toLocaleString("pt-BR")} de XP`);
    }
    if (day.rewardDiamonds > 0) {
      const amount = day.rewardDiamonds;
      player.diamonds += amount;
      rewards.push(`${amount.toLocaleString("pt-BR")} diamantes`);
      void this.enqueue(player, async () => {
        player.diamonds = await addDiamonds(player.accountId, amount);
        this.sendProfile(player);
      }).catch(() => undefined);
    }
    if (day.rewardItem) {
      const item = gearItem(day.rewardItem);
      const got = item ? this.grantItem(player, item.id, day.rewardItemCount) : 0;
      if (item && got > 0) rewards.push(got > 1 ? `${got}× ${item.name}` : item.name);
      else if (item) this.itemNotice(player, false, `A mochila estava cheia: ${item.name} não coube.`);
    }
    void this.persist(player);
    this.sendProfile(player);
    const streak = result.state.streak;
    this.sendChat(
      client,
      "event",
      `Presente do dia ${result.state.day}: você recebeu ${rewards.join(", ") || "nada"}. Sequência: ${streak} dia${streak === 1 ? "" : "s"}.`,
    );
    void this.sendCheckin(player);
  }

  // ------------------------------------------------------------ VIP

  /** Situação do VIP e o que está à venda. Só o dono recebe. */
  private async sendVip(player: PlayerSim) {
    if (!this.players.has(player.id)) return;
    const hoje = checkinDayKey(Date.now(), checkinSettings().offsetHours);
    const pego = await vipChestDay(player.accountId).catch(() => "");
    if (!this.players.has(player.id)) return;
    player.client.send(ServerMsg.Vip, {
      tier: this.vipOf(player)?.id ?? "",
      untilMs: player.vipUntil,
      tiers: vipTiersAll(),
      passes: vipPassesOnSale(),
      chestReady: this.vipOf(player) !== undefined && pego !== hoje,
    } satisfies VipEvent);
  }

  /** Reflete no estado visível o degrau e o título: é como os outros enxergam o VIP. */
  private refreshVipLook(player: PlayerSim) {
    const tier = this.vipOf(player);
    player.state.vip = tier?.rank ?? 0;
    player.state.title = tier?.title ?? "";
  }

  private handleVipBuy(client: Client, message: VipBuyMessage) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    const passe = vipPass(String(message?.pass ?? ""));
    if (!passe) {
      this.sendChat(client, "system", "Esse passe não existe mais.");
      return;
    }
    // Na fila do personagem, como toda compra: nunca duas operações de banco ao mesmo tempo.
    void this.enqueue(player, async () => {
      const result = await purchaseVip({
        accountId: player.accountId,
        characterId: player.characterId,
        pass: passe,
        tiers: vipTiersAll(),
        now: Date.now(),
      });
      if (!this.players.has(player.id)) return;
      if (!result.ok) {
        this.sendChat(client, "system", result.message);
        return;
      }
      player.vipTier = result.tier;
      player.vipUntil = result.untilMs;
      player.diamonds = result.diamonds;
      this.refreshVipLook(player);
      const tier = this.vipOf(player);
      const dias = vipDaysLeft(result.untilMs, Date.now());
      this.sendProfile(player);
      this.sendInventory(player);
      void this.sendVip(player);
      this.sendChat(client, "event", `${tier?.name ?? "VIP"} ativo por ${dias} dia${dias === 1 ? "" : "s"}.`);
      this.broadcastChat("event", `${player.state.name} entrou para o ${tier?.name ?? "VIP"}!`);
    }).catch(() => this.sendChat(client, "system", "Não foi possível concluir a compra. Tente de novo."));
  }

  private handleVipClaim(client: Client) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    const tier = this.vipOf(player);
    if (!tier) {
      this.sendChat(client, "system", "O baú diário é dos assinantes VIP.");
      return;
    }
    // O baú do VIP vira na mesma hora do presente diário: um horário só na cabeça do jogador.
    const hoje = checkinDayKey(Date.now(), checkinSettings().offsetHours);
    void this.enqueue(player, async () => {
      const pegou = await claimVipChest(player.accountId, hoje);
      if (!this.players.has(player.id)) return;
      if (!pegou) {
        this.sendChat(client, "system", "Você já abriu o baú VIP de hoje. Volte amanhã!");
        void this.sendVip(player);
        return;
      }
      const premios: string[] = [];
      if (tier.chestGold > 0) {
        player.state.gold += tier.chestGold;
        premios.push(`${tier.chestGold.toLocaleString("pt-BR")} de ouro`);
      }
      if (tier.chestXp > 0) {
        this.giveXp(player, Math.round(tier.chestXp));
        premios.push(`${Math.round(tier.chestXp).toLocaleString("pt-BR")} de XP`);
      }
      if (tier.chestDiamonds > 0) {
        player.diamonds = await addDiamonds(player.accountId, tier.chestDiamonds);
        premios.push(`${tier.chestDiamonds.toLocaleString("pt-BR")} diamantes`);
      }
      if (tier.chestItem) {
        const item = gearItem(tier.chestItem);
        const got = item ? this.grantItem(player, item.id, tier.chestItemCount) : 0;
        if (item && got > 0) premios.push(got > 1 ? `${got}× ${item.name}` : item.name);
        else if (item) this.itemNotice(player, false, `A mochila estava cheia: ${item.name} não coube.`);
      }
      void this.persist(player);
      this.sendProfile(player);
      void this.sendVip(player);
      this.sendChat(client, "event", `Baú ${tier.name}: você recebeu ${premios.join(", ") || "nada"}.`);
    }).catch(() => this.sendChat(client, "system", "Não foi possível abrir o baú. Tente de novo."));
  }

  // ------------------------------------------------------------ missões

  private sendQuests(player: PlayerSim) {
    if (!this.players.has(player.id)) return;
    const worldNames: Record<string, string> = {};
    for (const world of this.worlds.values()) worldNames[String(world.def.id)] = world.def.name;
    player.client.send(ServerMsg.Quests, {
      quests: liveQuests(),
      progress: player.questProgress,
      worldNames,
      worldId: player.world.def.id,
    } satisfies QuestsEvent);
  }

  /**
   * O painel mexeu nas classes: quem perdeu a classe (apagada) fica sem, e todo mundo
   * recebe os números novos na hora, com vida, mana e atalhos recalculados.
   */
  // ------------------------------------------------------------ arena

  /** A praça que o nível do jogador alcança, respeitando a que ele pediu. */
  private arenaFor(player: PlayerSim, pedida: string) {
    const abertas = arenasFor(arenaList(), player.state.level);
    return abertas.find((arena) => arena.id === pedida) ?? abertas[0];
  }

  /**
   * Abre a arena: atualiza o retrato do jogador, paga o que ficou da temporada passada e manda
   * a lista de adversários.
   *
   * O retrato é gravado **aqui**, e não quando ele é escolhido como adversário: senão abrir a
   * arena viraria uma escrita por adversário listado.
   */
  private handleArenaOpen(client: Client, message: ArenaOpenMessage) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    void this.enqueue(player, async () => {
      const agora = Date.now();
      const season = arenaSeason(agora);
      await refreshSnapshot({
        characterId: player.characterId,
        name: player.state.name,
        level: player.state.level,
        vocation: player.vocation,
        items: player.items,
        look: {
          skin: player.state.skin,
          hairColor: player.state.hairColor,
          outfit: player.state.outfit,
          colorPrimary: player.state.primary,
          colorSecondary: player.state.secondary,
          colorDetail: player.state.detail,
        },
      });
      // A virada da temporada acontece aqui, na primeira abertura depois de a semana virar.
      const premios = await settleSeasons(agora, player.characterId);
      for (const premio of premios) {
        if (premio.gold > 0) player.state.gold += premio.gold;
        if (premio.diamonds > 0) player.diamonds = await addDiamonds(player.accountId, premio.diamonds);
        if (!this.players.has(player.id)) return;
        const partes = [premio.gold > 0 ? `${premio.gold} de ouro` : "", premio.diamonds > 0 ? `${premio.diamonds} 💎` : ""].filter(Boolean);
        this.sendChat(client, "event", `${premio.arenaName}: você fechou a temporada ${premio.season} em ${premio.rank}º e levou ${partes.join(" e ")}.`);
      }
      if (premios.length > 0) this.sendProfile(player);
      await this.sendArena(player, String(message?.arena ?? ""));
    }).catch(() => this.sendChat(client, "system", "Não foi possível abrir a arena. Tente de novo."));
  }

  private async sendArena(player: PlayerSim, pedida: string) {
    if (!this.players.has(player.id)) return;
    const settings = arenaSettings();
    const agora = Date.now();
    const season = arenaSeason(agora);
    const dia = arenaDay(agora);
    const arena = this.arenaFor(player, pedida);
    const abertas = arenasFor(arenaList(), player.state.level);
    if (!arena) {
      // Ninguém alcança arena nenhuma ainda: diz qual é o nível que falta, em vez de uma tela vazia.
      const ligadas = arenaList().filter((a) => a.enabled).map((a) => a.minLevel);
      const falta = ligadas.length > 0 ? Math.min(...ligadas) : 0;
      player.client.send(ServerMsg.Arena, {
        enabled: settings.enabled, arenas: [], arena: "", opponents: [], me: null, rating: 0, wins: 0, losses: 0,
        entriesLeft: 0, entriesTotal: 0, entryPrice: 0, season, board: [], nextLevel: falta,
      } satisfies ArenaEvent);
      return;
    }
    const vipRank = this.vipOf(player)?.rank ?? 0;
    const standing = await standingOf(arena.id, season, player.characterId);
    const [opponents, me, board] = await Promise.all([
      arenaOpponents(arena, player.characterId, season),
      selfOpponent(player.characterId, arena.id, season),
      arenaBoard(arena.id, season, player.characterId),
    ]);
    if (!this.players.has(player.id)) return;
    player.client.send(ServerMsg.Arena, {
      enabled: settings.enabled,
      arenas: abertas,
      arena: arena.id,
      opponents,
      me,
      rating: standing.rating,
      wins: standing.wins,
      losses: standing.losses,
      entriesLeft: entriesLeft(arena, standing, vipRank, dia),
      entriesTotal: entriesTotal(arena, vipRank),
      entryPrice: arena.entryPrice,
      season,
      board,
      nextLevel: 0,
    } satisfies ArenaEvent);
  }

  /** Desafia alguém. A luta é resolvida no servidor; o cliente recebe a reprise e anima. */
  private handleArenaFight(client: Client, message: ArenaFightMessage) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    if (!arenaSettings().enabled) {
      this.sendChat(client, "system", "A arena está fechada agora.");
      return;
    }
    const arena = this.arenaFor(player, String(message?.arena ?? ""));
    if (!arena || arena.id !== String(message?.arena ?? "")) {
      this.sendChat(client, "system", "Essa arena não está aberta para o seu nível.");
      return;
    }
    const characterId = Math.max(0, Math.round(Number(message?.characterId) || 0));
    const dummyId = Math.max(0, Math.round(Number(message?.dummyId) || 0));
    if (characterId === player.characterId) {
      this.sendChat(client, "system", "Você não pode desafiar a si mesmo.");
      return;
    }
    const paid = message?.paid === true;
    void this.enqueue(player, async () => {
      const agora = Date.now();
      const season = arenaSeason(agora);
      const dia = arenaDay(agora);
      const vipRank = this.vipOf(player)?.rank ?? 0;
      // O adversário é relido do banco aqui: o cliente manda só o id, e quem monta os números é
      // o servidor. Aceitar poder e pontuação vindos da tela seria deixar o cliente escolher a luta.
      const lista = await arenaOpponents(arena, player.characterId, season, 12);
      const alvo = lista.find((o) => (dummyId > 0 ? o.dummyId === dummyId : o.characterId === characterId));
      if (!alvo) {
        this.sendChat(client, "system", "Esse adversário não está mais na lista. Abra a arena de novo.");
        await this.sendArena(player, arena.id);
        return;
      }
      // A entrada avulsa é cobrada antes da luta: pagar depois deixaria quem perde sem cobrança.
      if (paid) {
        if (arena.entryPrice <= 0) {
          this.sendChat(client, "system", "Essa arena não vende entrada avulsa.");
          return;
        }
        if (player.diamonds < arena.entryPrice) {
          this.sendChat(client, "system", `Faltam diamantes: a entrada custa ${arena.entryPrice} 💎.`);
          return;
        }
        player.diamonds = await addDiamonds(player.accountId, -arena.entryPrice);
      }
      const me = await selfOpponent(player.characterId, arena.id, season);
      if (!me) {
        this.sendChat(client, "system", "Abra a arena antes de lutar.");
        return;
      }
      const result = await resolveFight({
        arena, season, dia, characterId: player.characterId, me, opponent: alvo, vipRank, paid,
      });
      if (!this.players.has(player.id)) return;
      if (typeof result === "string") {
        // Entrada paga e luta recusada: devolve o diamante, senão o jogador paga por nada.
        if (paid) player.diamonds = await addDiamonds(player.accountId, arena.entryPrice);
        this.sendChat(client, "system", result);
        return;
      }
      if (result.gold > 0) player.state.gold += result.gold;
      if (result.xp > 0) this.giveXp(player, result.xp);
      this.sendProfile(player);
      player.client.send(ServerMsg.ArenaResult, {
        arena: arena.id, me, opponent: alvo, fight: result.fight, won: result.won, dummy: result.dummy,
        ratingDelta: result.ratingDelta, rating: result.rating, gold: result.gold, xp: result.xp,
        entriesLeft: result.entriesLeft,
      } satisfies ArenaFightEvent);
      await this.sendArena(player, arena.id);
    }).catch(() => this.sendChat(client, "system", "Não foi possível resolver a luta. Tente de novo."));
  }

  /** O painel mexeu nas arenas: quem está com a tela aberta recebe a lista nova. */
  sendArenaList() {
    for (const player of this.players.values()) void this.sendArena(player, "");
  }

  /** O painel mexeu nas regras do PvP. */
  sendPvpRules() {
    for (const player of this.players.values()) this.sendPvp(player);
  }

  /** O painel mexeu nos degraus ou passes do VIP: o que mudou vale na hora. */
  sendVipList() {
    for (const player of this.players.values()) {
      this.refreshVipLook(player);
      void this.sendVip(player);
      this.sendInventory(player);
    }
  }

  sendVocations() {
    for (const player of this.players.values()) {
      if (player.vocation && !vocationById(player.vocation)) player.vocation = "";
      const s = player.state;
      const stats = this.statsOf(player);
      s.maxHp = stats.maxHp;
      s.maxMana = stats.maxMana;
      s.hp = Math.min(s.hp, s.maxHp);
      s.mana = Math.min(s.mana, s.maxMana);
      player.shortcuts = sanitizeShortcuts(player.shortcuts, s.level, vocationFamilies(player.vocation));
      this.sendProfile(player);
    }
  }

  /** Avisa todo mundo que a lista de missões mudou no painel. */
  sendQuestList() {
    for (const player of this.players.values()) this.sendQuests(player);
  }

  private questState(player: PlayerSim, questId: number): QuestProgress {
    let progress = player.questProgress.find((entry) => entry.questId === questId);
    if (!progress) {
      progress = { questId, progress: 0, done: false, readyAt: "", times: 0 };
      player.questProgress.push(progress);
    }
    return progress;
  }

  private saveQuest(player: PlayerSim, progress: QuestProgress) {
    this.enqueue(player, () => saveQuestProgress(player.characterId, progress)).catch(() => undefined);
  }

  /** Missão aberta para este personagem agora (nível, mundo e espera das repetíveis). */
  private questOpen(player: PlayerSim, quest: { id: number; minLevel: number; worldId: number }): boolean {
    if (player.state.level < quest.minLevel) return false;
    if (quest.worldId !== 0 && player.world.def.id !== quest.worldId) return false;
    const progress = questProgressOf(player.questProgress, quest.id);
    return !questWaiting(progress);
  }

  /** Cada monstro derrubado conta para as caçadas de quem causou dano. */
  private creditQuests(player: PlayerSim, monster: MonsterSim) {
    for (const quest of liveQuests()) {
      if (quest.kind !== "kill" || quest.monster !== monster.def.kind) continue;
      if (quest.worldId !== 0 && quest.worldId !== monster.world.def.id) continue;
      if (player.state.level < quest.minLevel) continue;
      const progress = this.questState(player, quest.id);
      if (progress.done || questWaiting(progress)) continue;
      progress.progress += 1;
      if (progress.progress >= quest.amount) {
        progress.progress = quest.amount;
        progress.done = true;
        this.sendChat(player.client, "event", `Missão cumprida: ${quest.name}! Abra as missões (J) para receber.`);
      } else if (progress.progress % 5 === 0 || progress.progress === 1) {
        this.sendChat(player.client, "system", `${quest.name}: ${progress.progress}/${quest.amount}.`);
      }
      this.saveQuest(player, progress);
      this.sendQuests(player);
    }
  }

  /** Entrega: paga XP, ouro e item, e reagenda as repetíveis. */
  private handleQuestClaim(client: Client, message: QuestClaimMessage) {
    const player = this.players.get(client.sessionId);
    const quest = questById(Number(message?.id));
    if (!player || !quest || !quest.enabled) return;
    const progress = this.questState(player, quest.id);
    if (!progress.done) {
      this.sendChat(client, "system", "Essa missão ainda não está pronta.");
      return;
    }
    progress.done = false;
    progress.progress = 0;
    progress.times += 1;
    progress.readyAt = quest.repeatMinutes > 0 ? new Date(Date.now() + quest.repeatMinutes * 60_000).toISOString() : "";
    // Missão de uma vez só: fica travada para sempre.
    if (quest.repeatMinutes === 0) progress.readyAt = new Date(Date.now() + 3650 * 86_400_000).toISOString();
    this.saveQuest(player, progress);

    const rewards: string[] = [];
    if (quest.rewardXp > 0) {
      this.giveXp(player, Math.round(quest.rewardXp));
      rewards.push(`${Math.round(quest.rewardXp).toLocaleString("pt-BR")} de XP`);
    }
    if (quest.rewardGold > 0) {
      player.state.gold += quest.rewardGold;
      rewards.push(`${quest.rewardGold.toLocaleString("pt-BR")} de ouro`);
      void this.persist(player);
    }
    if (quest.rewardItem) {
      const item = gearItem(quest.rewardItem);
      const got = item ? this.grantItem(player, item.id, quest.rewardItemCount) : 0;
      if (item && got > 0) rewards.push(got > 1 ? `${got}× ${item.name}` : item.name);
      else if (item) this.itemNotice(player, false, `A mochila estava cheia: ${item.name} não coube.`);
    }
    this.sendChat(client, "event", `${quest.name}: você recebeu ${rewards.join(", ") || "nada"}.`);
    this.sendQuests(player);
  }

  /** Desafio de chefe: só começa com o grupo todo perto do altar. */
  private handleQuestBoss(client: Client, message: QuestBossMessage) {
    const player = this.players.get(client.sessionId);
    const quest = questById(Number(message?.id));
    if (!player || !quest || !quest.enabled || quest.kind !== "boss") return;
    const sim = player.world;
    if (quest.worldId !== 0 && sim.def.id !== quest.worldId) {
      this.sendChat(client, "system", "Este desafio é em outro mundo.");
      return;
    }
    if (player.state.level < quest.minLevel) {
      this.sendChat(client, "system", `${quest.name} pede nível ${quest.minLevel}.`);
      return;
    }
    if (chebyshev(player.state.x, player.state.y, quest.x, quest.y) > QUEST_ALTAR_RANGE) {
      this.sendChat(client, "system", "Vá até o altar do desafio para invocar o chefe.");
      return;
    }
    const alive = this.bossQuests.get(quest.id);
    if (alive && this.monsters.has(alive)) {
      this.sendChat(client, "system", "O chefe deste desafio já está no mundo.");
      return;
    }
    const now = Date.now();
    const readyAt = this.bossQuestReadyAt.get(quest.id) ?? 0;
    if (now < readyAt) {
      this.sendChat(client, "system", `Espere ${Math.ceil((readyAt - now) / 60_000)} min para invocar de novo.`);
      return;
    }
    // Conta quem está no altar (o próprio incluso).
    const party = [...this.players.values()].filter(
      (other) => other.world === sim && other.state.hp > 0 && chebyshev(other.state.x, other.state.y, quest.x, quest.y) <= QUEST_ALTAR_RANGE,
    );
    if (party.length < quest.players) {
      this.sendChat(
        client,
        "system",
        `${quest.name} precisa de ${quest.players} jogadores no altar (tem ${party.length}). Chame o pessoal!`,
      );
      return;
    }
    const scale = Math.max(1, quest.bossScale * party.length);
    const boss = this.spawnMonster(sim, quest.monster, { x: quest.x, y: quest.y }, { respawns: false, scale, questId: quest.id });
    if (!boss) {
      this.sendChat(client, "system", "Não há espaço no altar para o chefe aparecer.");
      return;
    }
    this.bossQuests.set(quest.id, boss.id);
    this.bossQuestReadyAt.set(quest.id, now + QUEST_BOSS_COOLDOWN_MS);
    this.announce(`${MONSTERS[quest.monster].name} foi invocado em ${sim.def.name} por ${party.length} heróis!`);
  }

  /** O chefe do desafio caiu: todo mundo que bateu nele pode entregar a missão. */
  private finishBossQuest(monster: MonsterSim) {
    const quest = questById(monster.questId);
    this.bossQuests.delete(monster.questId);
    if (!quest) return;
    for (const playerId of monster.damageBy.keys()) {
      const player = this.players.get(playerId);
      if (!player || player.state.level < quest.minLevel) continue;
      const progress = this.questState(player, quest.id);
      if (questWaiting(progress)) continue;
      progress.progress = quest.amount;
      progress.done = true;
      this.saveQuest(player, progress);
      this.sendChat(player.client, "event", `Desafio vencido: ${quest.name}! Abra as missões (J) para receber.`);
      this.sendQuests(player);
    }
  }

  /** Tira do chão o que ninguém pegou a tempo. */
  private sweepLoot(now: number) {
    for (const [id, loot] of this.state.loot) {
      if (now < loot.expiresAt) continue;
      const sim = this.worldBySlug.get(loot.world);
      if (sim) this.removeLoot(sim, id, tileKey(sim, loot.x, loot.y));
      else this.state.loot.delete(id);
    }
  }

  /** Repõe os tesouros fixos do editor que já foram pegos. */
  private refillGroundItems(now: number) {
    for (const sim of this.worlds.values()) {
      for (const item of sim.items) {
        if (sim.itemLoot.has(item.id) || now < (sim.itemReadyAt.get(item.id) ?? 0)) continue;
        this.spawnGroundItem(sim, item);
      }
    }
  }

  // ------------------------------------------------------------ utilidades

  private face(state: { x: number; y: number; dir: number }, target: Point) {
    const dir = dirIndex(target.x - state.x, target.y - state.y);
    if (dir >= 0) state.dir = dir;
  }

  private broadcastHit(target: string, attacker: string, amount: number, kind: HitKind) {
    const event = { target, attacker, amount, kind } satisfies HitEvent;
    // O número do dano nasce em cima de quem apanhou; quem não enxerga o lugar não precisa dele.
    const at = this.viewEntity(target) ?? this.viewEntity(attacker);
    if (at) this.sendNear(at.world, at.x, at.y, ServerMsg.Hit, event);
  }

  private sendProfile(player: PlayerSim) {
    if (!this.players.has(player.id)) return;
    player.client.send(ServerMsg.Profile, {
      diamonds: player.diamonds,
      unlocks: [...player.unlocks],
      shortcuts: player.shortcuts,
      vocation: player.vocation,
      vocationPrice: vocationSettings().changePrice,
    } satisfies ProfileEvent);
  }

  private sendPurchase(player: PlayerSim, ok: boolean, id: string, message: string) {
    if (!this.players.has(player.id)) return;
    player.client.send(ServerMsg.Purchase, { ok, id, message } satisfies PurchaseEvent);
  }

  private sendChat(client: Client, channel: ChatChannel, text: string) {
    client.send(ServerMsg.Chat, { channel, text } satisfies ChatEvent);
  }

  private broadcastChat(channel: ChatChannel, text: string, except?: Client, from?: string) {
    const event: ChatEvent = from ? { channel, text, from } : { channel, text };
    if (except) this.broadcast(ServerMsg.Chat, event, { except });
    else this.broadcast(ServerMsg.Chat, event);
  }
}
