import { Room, ServerError, type Client } from "colyseus";
import {
  CHASE_LOSE_RANGE,
  CHAT_MAX_LEN,
  ClientMsg,
  DEATH_XP_LOSS,
  DEFAULT_APPEARANCE,
  DIRS,
  LOOT,
  LOOT_OWNER_MS,
  LOOT_TTL_MS,
  MAP_SEED,
  MONSTERS,
  PLAYER_ATTACK_MS,
  PLAYER_STEP_MS,
  SPELLS,
  ServerMsg,
  TEMPLE_X,
  TEMPLE_Y,
  TICK_MS,
  catalogItem,
  chebyshev,
  describeDrop,
  dirIndex,
  findPath,
  generateMap,
  healAmount,
  inTown,
  isWalkable,
  levelForXp,
  ownsItem,
  parseAppearance,
  playerStats,
  randInt,
  rollDrops,
  stepDuration,
  xpForLevel,
  type AnnounceEvent,
  type AppearanceMessage,
  type BuyMessage,
  type ChatChannel,
  type ChatEvent,
  type ChatMessage,
  type DropRoll,
  type EquipMessage,
  type GameMap,
  type GotoMessage,
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
  type PlayerDeathEvent,
  type Point,
  type ProfileEvent,
  type PurchaseEvent,
  type SpellEffectEvent,
  type SpellId,
  type SpellMessage,
  type TargetMessage,
  type XpEvent,
} from "@zuna/shared";
import { accountFromToken } from "./auth.ts";
import { EventManager } from "./events.ts";
import {
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
} from "./repository.ts";
import { LootState, MonsterState, PlayerState, WorldState } from "./schema.ts";
import { generateSpawns } from "./spawns.ts";

/** Multiplicador global de XP ("rate" do servidor). */
const XP_RATE = Number(process.env.XP_RATE) || 1;
/** Comandos de teste no chat (/evento, /xp, /ouro, /diamantes). Ligados só fora de produção; DEV_COMMANDS=0 ou 1 força. */
const DEV_COMMANDS = process.env.DEV_COMMANDS ? process.env.DEV_COMMANDS !== "0" : process.env.NODE_ENV !== "production";
const AUTOSAVE_MS = 60_000;
const MAX_TEST_GRANT = 100_000_000;

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
  accountId: number;
  characterId: number;
  unlocks: Set<string>;
  diamonds: number;
  /** Monstros derrubados (o golpe final vale para quem mais causou dano). */
  kills: number;
  path: Point[];
  moveDir: Point | null;
  nextStepAt: number;
  nextAttackAt: number;
  nextChaseAt: number;
  spellReadyAt: Map<SpellId, number>;
  chatReadyAt: number;
  /** Operações de banco deste personagem, em fila: nunca duas ao mesmo tempo. */
  queue: Promise<void>;
}

export interface MonsterSim {
  id: string;
  def: MonsterDef;
  state: MonsterState;
  home: Point;
  respawns: boolean;
  targetId: string | null;
  path: Point[];
  pathGoal: Point | null;
  nextStepAt: number;
  nextAttackAt: number;
  nextThinkAt: number;
  /** Dano causado por cada jogador: a XP é dividida nessa proporção. */
  damageBy: Map<string, number>;
  onDeath?: () => void;
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

export class WorldRoom extends Room<{ state: WorldState }> {
  maxClients = 150;

  private gameMap!: GameMap;
  private readonly players = new Map<string, PlayerSim>();
  private readonly monsters = new Map<string, MonsterSim>();
  private readonly monsterAt = new Map<number, string>();
  private readonly playersAt = new Map<number, number>();
  /** Drops no chão, por tile. */
  private readonly lootAt = new Map<number, string[]>();
  private nextLootId = 1;
  private nextLootSweepAt = 0;
  private scheduled: Scheduled[] = [];
  private nextMonsterId = 1;
  private nextRegenAt = 0;
  private nextAutosaveAt = Date.now() + AUTOSAVE_MS;
  private eventManager!: EventManager;

  onCreate() {
    const state = new WorldState();
    state.eventName = "";
    state.eventEndsAt = 0;
    state.xpMultiplier = 1;
    this.setState(state);

    this.gameMap = generateMap(MAP_SEED);
    for (const spawn of generateSpawns(this.gameMap, MAP_SEED + 1)) this.spawnMonster(spawn.kind, spawn, true);
    this.eventManager = new EventManager(this);

    this.onMessage(ClientMsg.Move, (client, message: MoveMessage) => this.handleMove(client, message));
    this.onMessage(ClientMsg.Goto, (client, message: GotoMessage) => this.handleGoto(client, message));
    this.onMessage(ClientMsg.Target, (client, message: TargetMessage) => this.handleTarget(client, message));
    this.onMessage(ClientMsg.Spell, (client, message: SpellMessage) => this.handleSpell(client, message));
    this.onMessage(ClientMsg.Chat, (client, message: ChatMessage) => this.handleChat(client, message));
    this.onMessage(ClientMsg.Appearance, (client, message: AppearanceMessage) => this.handleAppearance(client, message));
    this.onMessage(ClientMsg.Equip, (client, message: EquipMessage) => this.handleEquip(client, message));
    this.onMessage(ClientMsg.Buy, (client, message: BuyMessage) => this.handleBuy(client, message));
    this.onMessage(ClientMsg.ToggleMount, (client) => this.handleToggleMount(client));

    this.setPatchRate(TICK_MS);
    this.setSimulationInterval(() => this.tick(), TICK_MS);
  }

  /** Valida a sessão e carrega o personagem antes de a pessoa entrar na sala. */
  async onAuth(_client: Client, options: JoinOptions) {
    const account = await accountFromToken(options?.token);
    if (!account) throw new ServerError(401, "Sua sessão expirou. Entre novamente.");
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
    const stats = playerStats(row.level);
    const spot = this.spawnPointFor(row);

    const state = new PlayerState({
      name: row.name,
      x: spot.x,
      y: spot.y,
      dir: 1,
      stepMs: PLAYER_STEP_MS,
      hp: row.hp > 0 ? Math.min(row.hp, stats.maxHp) : stats.maxHp,
      maxHp: stats.maxHp,
      mana: Math.min(Math.max(0, row.mana), stats.maxMana),
      maxMana: stats.maxMana,
      level: row.level,
      xp: row.xp,
      gold: row.gold,
      target: "",
      ...appearance,
      pet,
      mount,
      mounted: mount !== "" && row.mounted,
    });

    const player: PlayerSim = {
      id: client.sessionId,
      client,
      state,
      accountId: auth.accountId,
      characterId: row.id,
      unlocks,
      diamonds: account?.diamonds ?? 0,
      kills: row.kills,
      path: [],
      moveDir: null,
      nextStepAt: 0,
      nextAttackAt: 0,
      nextChaseAt: 0,
      spellReadyAt: new Map(),
      chatReadyAt: 0,
      queue: Promise.resolve(),
    };
    this.players.set(client.sessionId, player);
    this.state.players.set(client.sessionId, state);
    this.occupyPlayer(spot.x, spot.y, 1);

    this.sendProfile(player);
    const greeting = row.lastLoginAt ? "Bem-vindo de volta" : "Bem-vindo";
    this.sendChat(client, "system", `${greeting}, ${row.name}! Aperte O para abrir o guarda-roupa e a loja.`);
    this.broadcastChat("system", `${row.name} entrou no mundo.`, client);
    void this.enqueue(player, () => markLogin(row.id)).catch(() => undefined);
  }

  async onLeave(client: Client) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    this.removePlayer(player);
    this.broadcastChat("system", `${player.state.name} saiu do mundo.`);
    await this.persist(player);
  }

  async onDispose() {
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

  spawnMonster(kind: MonsterKind, at: Point, respawns: boolean): MonsterSim | null {
    const spot = this.findFreeTile(at.x, at.y, true, 3);
    if (!spot) return null;
    const def = MONSTERS[kind];
    const id = `m${this.nextMonsterId++}`;
    const state = new MonsterState({
      kind,
      x: spot.x,
      y: spot.y,
      dir: randInt(Math.random, 0, DIRS.length - 1),
      stepMs: stepDuration(def.stepMs, 1, 0),
      hp: def.hp,
      maxHp: def.hp,
    });
    const monster: MonsterSim = {
      id,
      def,
      state,
      home: { x: at.x, y: at.y },
      respawns,
      targetId: null,
      path: [],
      pathGoal: null,
      nextStepAt: 0,
      nextAttackAt: 0,
      nextThinkAt: 0,
      damageBy: new Map(),
    };
    this.monsters.set(id, monster);
    this.state.monsters.set(id, state);
    this.monsterAt.set(this.tileKey(spot.x, spot.y), id);
    return monster;
  }

  /** Remove sem recompensa (fim de evento). */
  removeMonster(id: string) {
    const monster = this.monsters.get(id);
    if (!monster) return;
    this.monsters.delete(id);
    this.state.monsters.delete(id);
    this.monsterAt.delete(this.tileKey(monster.state.x, monster.state.y));
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
      x: s.x,
      y: s.y,
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
    };
  }

  private removePlayer(player: PlayerSim) {
    this.occupyPlayer(player.state.x, player.state.y, -1);
    this.players.delete(player.id);
    this.state.players.delete(player.id);
    for (const monster of this.monsters.values()) {
      if (monster.targetId === player.id) monster.targetId = null;
    }
  }

  private spawnPointFor(row: CharacterRow): Point {
    if (!this.blockedForPlayer(row.x, row.y)) return { x: row.x, y: row.y };
    return (
      this.findFreeTile(row.x, row.y, false) ?? this.findFreeTile(TEMPLE_X, TEMPLE_Y, false) ?? { x: TEMPLE_X, y: TEMPLE_Y }
    );
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

    const blocked = (tx: number, ty: number) => this.blockedForPlayer(tx, ty);
    const { width, height } = this.gameMap;
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
    if (id && !this.monsters.has(id)) return;
    player.state.target = id;
    player.path = [];
    player.nextChaseAt = 0;
  }

  private handleSpell(client: Client, message: SpellMessage) {
    const player = this.players.get(client.sessionId);
    const spell = SPELLS[message?.id];
    if (!player || !spell) return;

    const now = Date.now();
    const s = player.state;
    if ((player.spellReadyAt.get(spell.id) ?? 0) > now) return;
    if (s.mana < spell.mana) {
      this.sendChat(client, "system", "Mana insuficiente.");
      return;
    }

    const neighbors = spell.id === "whirl" ? this.adjacentMonsters(s) : [];
    if (spell.id === "whirl" && neighbors.length === 0) {
      this.sendChat(client, "system", "Nenhum monstro ao seu redor.");
      return;
    }

    s.mana -= spell.mana;
    player.spellReadyAt.set(spell.id, now + spell.cooldownMs);
    this.broadcast(ServerMsg.SpellEffect, { caster: player.id, spell: spell.id, x: s.x, y: s.y } satisfies SpellEffectEvent);

    if (spell.id === "heal") {
      const healed = Math.min(healAmount(s.level) + randInt(Math.random, 0, 10), s.maxHp - s.hp);
      s.hp += healed;
      this.broadcastHit(player.id, player.id, healed, "heal");
      return;
    }

    const { maxDamage } = playerStats(s.level);
    for (const monster of neighbors) {
      const roll = Math.round(maxDamage * (0.8 + Math.random() * 0.7));
      this.damageMonster(monster, player, roll - monster.def.armor);
    }
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

    if (text.startsWith("/")) {
      this.runCommand(player, text);
      return;
    }
    this.broadcastChat("player", text, undefined, player.state.name);
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
    if (!item || item.price === 0) {
      this.sendPurchase(player, false, "", "Item indisponível.");
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
            ? "Comandos: /online · teste: /evento xp · /evento invasao · /xp 500 · /ouro 2000 · /diamantes 1000"
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
        const started =
          argument === "xp" ? this.eventManager.startDoubleXp()
          : argument === "invasao" || argument === "invasão" ? this.eventManager.startInvasion()
          : null;
        if (started === null) this.sendChat(player.client, "system", "Use /evento xp ou /evento invasao.");
        else if (!started) this.sendChat(player.client, "system", "Já existe um evento em andamento.");
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
      default:
        this.sendChat(player.client, "system", "Comando desconhecido. Digite /ajuda.");
    }
  }

  // ------------------------------------------------------------ simulação

  private tick() {
    const now = Date.now();
    this.runScheduled(now);
    for (const player of this.players.values()) this.updatePlayer(player, now);
    for (const monster of this.monsters.values()) this.updateMonster(monster, now);
    if (now >= this.nextRegenAt) {
      this.nextRegenAt = now + 1000;
      this.regenerate();
    }
    if (now >= this.nextLootSweepAt) {
      this.nextLootSweepAt = now + 1000;
      this.sweepLoot(now);
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

  /** Bônus do mascote e da montaria. A velocidade da montaria só vale montado. */
  private bonusesOf(player: PlayerSim): Bonuses {
    const s = player.state;
    const bonuses: Bonuses = { xp: 0, gold: 0, stepFactor: 1 };
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
    const target = s.target ? this.monsters.get(s.target) : undefined;
    if (s.target && !target) s.target = "";

    if (isReady(player.nextStepAt, now)) {
      if (player.moveDir) {
        this.tryPlayerStep(player, player.moveDir.x, player.moveDir.y, now);
      } else if (player.path.length > 0) {
        const next = player.path[0];
        if (this.blockedForPlayer(next.x, next.y)) {
          const goal = player.path[player.path.length - 1];
          player.path =
            findPath(this.gameMap.width, this.gameMap.height, s, goal, (x, y) => this.blockedForPlayer(x, y), { maxNodes: 3000 }) ?? [];
        } else {
          player.path.shift();
          this.movePlayer(player, next.x, next.y, now);
        }
      } else if (target && chebyshev(s.x, s.y, target.state.x, target.state.y) > 1 && now >= player.nextChaseAt) {
        player.nextChaseAt = now + 200;
        const path = findPath(
          this.gameMap.width,
          this.gameMap.height,
          s,
          target.state,
          (x, y) => this.blockedForPlayer(x, y),
          { adjacent: true, maxNodes: 1500 },
        );
        if (path && path.length > 0) this.movePlayer(player, path[0].x, path[0].y, now);
      }
    }

    if (target && now >= player.nextAttackAt && chebyshev(s.x, s.y, target.state.x, target.state.y) <= 1) {
      player.nextAttackAt = now + PLAYER_ATTACK_MS;
      const { maxDamage } = playerStats(s.level);
      const roll = Math.round(maxDamage * (0.35 + Math.random() * 0.65));
      this.face(s, target.state);
      this.damageMonster(target, player, roll - target.def.armor);
    }

    if (this.lootAt.size > 0) this.collectLoot(player, now);
  }

  /** Anda na direção pedida; numa diagonal bloqueada, desliza pelo eixo livre. */
  private tryPlayerStep(player: PlayerSim, dx: number, dy: number, now: number) {
    const s = player.state;
    const options = dx !== 0 && dy !== 0 ? [[dx, dy], [dx, 0], [0, dy]] : [[dx, dy]];
    for (const [ox, oy] of options) {
      const nx = s.x + ox;
      const ny = s.y + oy;
      if (this.blockedForPlayer(nx, ny)) continue;
      if (ox !== 0 && oy !== 0 && (this.blockedForPlayer(s.x + ox, s.y) || this.blockedForPlayer(s.x, s.y + oy))) continue;
      this.movePlayer(player, nx, ny, now);
      return;
    }
    const facing = dirIndex(dx, dy);
    if (facing >= 0) s.dir = facing;
  }

  private movePlayer(player: PlayerSim, x: number, y: number, now: number) {
    const s = player.state;
    const dx = x - s.x;
    const dy = y - s.y;
    const duration = stepDuration(PLAYER_STEP_MS * this.bonusesOf(player).stepFactor, dx, dy);
    this.occupyPlayer(s.x, s.y, -1);
    s.x = x;
    s.y = y;
    s.dir = dirIndex(dx, dy);
    s.stepMs = duration;
    this.occupyPlayer(x, y, 1);
    player.nextStepAt = nextStepTime(player.nextStepAt, now, duration);
  }

  private updateMonster(monster: MonsterSim, now: number) {
    const s = monster.state;
    let target = monster.targetId ? this.players.get(monster.targetId) : undefined;
    if (
      target &&
      (inTown(target.state.x, target.state.y) || chebyshev(s.x, s.y, target.state.x, target.state.y) > CHASE_LOSE_RANGE)
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
    if (this.blockedForMonster(x + dx, y + dy, monster.id)) return false;
    if (dx !== 0 && dy !== 0) {
      return !this.blockedForMonster(x + dx, y, monster.id) && !this.blockedForMonster(x, y + dy, monster.id);
    }
    return true;
  }

  private stepMonsterTowards(monster: MonsterSim, goal: Point, adjacent: boolean, now: number) {
    const s = monster.state;
    const goalChanged = !monster.pathGoal || monster.pathGoal.x !== goal.x || monster.pathGoal.y !== goal.y;
    if (goalChanged || monster.path.length === 0) {
      monster.pathGoal = { x: goal.x, y: goal.y };
      monster.path =
        findPath(this.gameMap.width, this.gameMap.height, s, goal, (x, y) => this.blockedForMonster(x, y, monster.id), {
          adjacent,
          maxNodes: 600,
        }) ?? [];
      if (monster.path.length === 0) {
        this.greedyStep(monster, goal, now);
        return;
      }
    }

    const next = monster.path[0];
    if (this.blockedForMonster(next.x, next.y, monster.id)) {
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
    const dx = x - s.x;
    const dy = y - s.y;
    const duration = stepDuration(monster.def.stepMs, dx, dy);
    this.monsterAt.delete(this.tileKey(s.x, s.y));
    s.x = x;
    s.y = y;
    s.dir = dirIndex(dx, dy);
    s.stepMs = duration;
    this.monsterAt.set(this.tileKey(x, y), monster.id);
    monster.nextStepAt = nextStepTime(monster.nextStepAt, now, duration);
  }

  private findAggroTarget(monster: MonsterSim): PlayerSim | undefined {
    const s = monster.state;
    let best: PlayerSim | undefined;
    let bestDistance = Infinity;
    for (const player of this.players.values()) {
      const p = player.state;
      if (inTown(p.x, p.y)) continue;
      const distance = chebyshev(s.x, s.y, p.x, p.y);
      if (distance <= monster.def.aggroRange && distance < bestDistance) {
        best = player;
        bestDistance = distance;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ combate

  private monsterAttack(monster: MonsterSim, player: PlayerSim) {
    // Revida sozinho quando está parado e sem alvo; não atrapalha quem está fugindo.
    if (!player.state.target && !player.moveDir && player.path.length === 0) player.state.target = monster.id;
    const { armor } = playerStats(player.state.level);
    const damage = Math.max(0, randInt(Math.random, 0, monster.def.maxHit) - armor);
    if (damage === 0) {
      this.broadcastHit(player.id, monster.id, 0, "block");
      return;
    }
    player.state.hp -= damage;
    this.broadcastHit(player.id, monster.id, damage, "damage");
    if (player.state.hp <= 0) this.killPlayer(player, monster);
  }

  private damageMonster(monster: MonsterSim, attacker: PlayerSim, amount: number) {
    if (!this.monsters.has(monster.id)) return;
    const s = monster.state;

    if (amount <= 0) {
      this.broadcastHit(monster.id, attacker.id, 0, "block");
    } else {
      const dealt = Math.min(amount, s.hp);
      monster.damageBy.set(attacker.id, (monster.damageBy.get(attacker.id) ?? 0) + dealt);
      s.hp = Math.max(0, s.hp - amount);
      this.broadcastHit(monster.id, attacker.id, amount, "damage");
    }

    if (!monster.targetId && !inTown(attacker.state.x, attacker.state.y)) {
      monster.targetId = attacker.id;
      monster.nextAttackAt = Math.max(monster.nextAttackAt, Date.now() + 500);
    }
    if (s.hp <= 0) this.killMonster(monster);
  }

  private killMonster(monster: MonsterSim) {
    const { def, state: s } = monster;
    this.removeMonster(monster.id);
    this.broadcast(ServerMsg.MonsterDeath, { id: monster.id, kind: def.kind, x: s.x, y: s.y } satisfies MonsterDeathEvent);

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
      const multiplier = XP_RATE * this.state.xpMultiplier * (1 + this.bonusesOf(player).xp);
      this.giveXp(player, Math.max(1, Math.round((def.xp * multiplier * damage) / totalDamage)));
    }

    if (topDamager) {
      topDamager.kills += 1;
      for (const drop of rollDrops(Math.random, def, this.bonusesOf(topDamager).gold)) {
        this.dropLoot(drop, s.x, s.y, topDamager.id);
      }
    }

    if (monster.respawns) this.after(def.respawnMs, () => this.respawn(def.kind, monster.home));
    monster.onDeath?.();
  }

  private respawn(kind: MonsterKind, home: Point) {
    if (!this.spawnMonster(kind, home, true)) this.after(5000, () => this.respawn(kind, home));
  }

  private giveXp(player: PlayerSim, amount: number) {
    const s = player.state;
    s.xp += amount;
    this.broadcast(ServerMsg.Xp, { id: player.id, amount } satisfies XpEvent);

    const newLevel = levelForXp(s.xp);
    if (newLevel <= s.level) return;
    const oldLevel = s.level;
    const stats = playerStats(newLevel);
    s.level = newLevel;
    s.maxHp = stats.maxHp;
    s.maxMana = stats.maxMana;
    s.hp = stats.maxHp;
    s.mana = stats.maxMana;
    this.broadcast(ServerMsg.LevelUp, { id: player.id, level: newLevel } satisfies LevelUpEvent);
    this.sendChat(player.client, "system", `Você avançou do nível ${oldLevel} para o nível ${newLevel}.`);
    if (Math.floor(newLevel / 10) > Math.floor(oldLevel / 10)) {
      this.broadcastChat("event", `${s.name} alcançou o nível ${newLevel}!`);
    }
    void this.persist(player);
  }

  private killPlayer(player: PlayerSim, killer: MonsterSim) {
    const s = player.state;
    const levelFloor = xpForLevel(s.level);
    const xpLost = Math.max(0, Math.min(Math.round(s.xp * DEATH_XP_LOSS), s.xp - levelFloor));
    s.xp -= xpLost;

    this.broadcast(ServerMsg.PlayerDeath, { id: player.id, x: s.x, y: s.y, xpLost } satisfies PlayerDeathEvent);
    this.sendChat(
      player.client,
      "system",
      `Você foi morto por ${killer.def.name}${xpLost > 0 ? ` e perdeu ${xpLost} de experiência` : ""}.`,
    );

    for (const monster of this.monsters.values()) {
      if (monster.targetId === player.id) monster.targetId = null;
    }

    const spot = this.findFreeTile(TEMPLE_X, TEMPLE_Y, false) ?? { x: TEMPLE_X, y: TEMPLE_Y };
    this.occupyPlayer(s.x, s.y, -1);
    s.x = spot.x;
    s.y = spot.y;
    this.occupyPlayer(s.x, s.y, 1);
    s.hp = s.maxHp;
    s.mana = s.maxMana;
    s.target = "";
    player.path = [];
    player.moveDir = null;
  }

  private regenerate() {
    for (const player of this.players.values()) {
      const s = player.state;
      const boost = inTown(s.x, s.y) ? 3 : 1;
      s.hp = Math.min(s.maxHp, s.hp + boost * (1 + Math.floor(s.level / 5)));
      s.mana = Math.min(s.maxMana, s.mana + boost * (2 + Math.floor(s.level / 4)));
    }
  }

  private adjacentMonsters(center: Point): MonsterSim[] {
    const result: MonsterSim[] = [];
    for (const d of DIRS) {
      const id = this.monsterAt.get(this.tileKey(center.x + d.x, center.y + d.y));
      const monster = id ? this.monsters.get(id) : undefined;
      if (monster) result.push(monster);
    }
    return result;
  }

  // ------------------------------------------------------------ drops

  /** Põe um drop no chão, no tile da morte ou no mais perto que estiver livre. */
  private dropLoot(drop: DropRoll, x: number, y: number, owner: string) {
    const spot = this.freeLootTile(x, y);
    if (!spot) return;
    const now = Date.now();
    const id = `l${this.nextLootId++}`;
    const state = new LootState({
      kind: drop.kind,
      x: spot.x,
      y: spot.y,
      gold: drop.gold,
      diamonds: drop.diamonds,
      owner,
      freeAt: now + LOOT_OWNER_MS,
      expiresAt: now + LOOT_TTL_MS,
    });
    this.state.loot.set(id, state);
    const key = this.tileKey(spot.x, spot.y);
    const ids = this.lootAt.get(key);
    if (ids) ids.push(id);
    else this.lootAt.set(key, [id]);
  }

  /** Tile andável e ainda sem drop, para dois drops não ficarem um em cima do outro. */
  private freeLootTile(cx: number, cy: number): Point | null {
    for (let radius = 0; radius <= 2; radius++) {
      const candidates: Point[] = [];
      for (let y = cy - radius; y <= cy + radius; y++) {
        for (let x = cx - radius; x <= cx + radius; x++) {
          if (chebyshev(x, y, cx, cy) !== radius) continue;
          if (!isWalkable(this.gameMap, x, y) || this.lootAt.has(this.tileKey(x, y))) continue;
          candidates.push({ x, y });
        }
      }
      if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)];
    }
    return null;
  }

  /** Quem está pisando no drop leva. Nos primeiros segundos, só quem derrubou o monstro. */
  private collectLoot(player: PlayerSim, now: number) {
    const key = this.tileKey(player.state.x, player.state.y);
    const ids = this.lootAt.get(key);
    if (!ids) return;
    for (const id of [...ids]) {
      const loot = this.state.loot.get(id);
      if (!loot) {
        this.removeLoot(id, key);
        continue;
      }
      if (loot.owner && loot.owner !== player.id && now < loot.freeAt) continue;
      this.removeLoot(id, key);
      this.giveLoot(player, loot);
    }
  }

  private removeLoot(id: string, key: number) {
    this.state.loot.delete(id);
    const ids = this.lootAt.get(key)?.filter((other) => other !== id) ?? [];
    if (ids.length > 0) this.lootAt.set(key, ids);
    else this.lootAt.delete(key);
  }

  private giveLoot(player: PlayerSim, loot: LootState) {
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

    this.broadcast(ServerMsg.Loot, {
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

  /** Tira do chão o que ninguém pegou a tempo. */
  private sweepLoot(now: number) {
    for (const [id, loot] of this.state.loot) {
      if (now >= loot.expiresAt) this.removeLoot(id, this.tileKey(loot.x, loot.y));
    }
  }

  // ------------------------------------------------------------ utilidades

  private tileKey(x: number, y: number): number {
    return y * this.gameMap.width + x;
  }

  private occupyPlayer(x: number, y: number, delta: number) {
    const key = this.tileKey(x, y);
    const count = (this.playersAt.get(key) ?? 0) + delta;
    if (count <= 0) this.playersAt.delete(key);
    else this.playersAt.set(key, count);
  }

  /** Jogadores atravessam outros jogadores, mas não monstros. */
  private blockedForPlayer(x: number, y: number): boolean {
    return !isWalkable(this.gameMap, x, y) || this.monsterAt.has(this.tileKey(x, y));
  }

  /** Monstros não entram na cidade nem em tiles ocupados. */
  private blockedForMonster(x: number, y: number, selfId?: string): boolean {
    if (!isWalkable(this.gameMap, x, y) || inTown(x, y)) return true;
    const key = this.tileKey(x, y);
    const occupant = this.monsterAt.get(key);
    if (occupant !== undefined && occupant !== selfId) return true;
    return (this.playersAt.get(key) ?? 0) > 0;
  }

  private findFreeTile(cx: number, cy: number, forMonster: boolean, maxRadius = 6): Point | null {
    for (let radius = 0; radius <= maxRadius; radius++) {
      const candidates: Point[] = [];
      for (let y = cy - radius; y <= cy + radius; y++) {
        for (let x = cx - radius; x <= cx + radius; x++) {
          if (chebyshev(x, y, cx, cy) !== radius) continue;
          const blocked = forMonster
            ? this.blockedForMonster(x, y)
            : this.blockedForPlayer(x, y) || this.playersAt.has(this.tileKey(x, y));
          if (!blocked) candidates.push({ x, y });
        }
      }
      if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)];
    }
    return null;
  }

  private face(state: { x: number; y: number; dir: number }, target: Point) {
    const dir = dirIndex(target.x - state.x, target.y - state.y);
    if (dir >= 0) state.dir = dir;
  }

  private broadcastHit(target: string, attacker: string, amount: number, kind: HitKind) {
    this.broadcast(ServerMsg.Hit, { target, attacker, amount, kind } satisfies HitEvent);
  }

  private sendProfile(player: PlayerSim) {
    if (!this.players.has(player.id)) return;
    player.client.send(ServerMsg.Profile, { diamonds: player.diamonds, unlocks: [...player.unlocks] } satisfies ProfileEvent);
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
