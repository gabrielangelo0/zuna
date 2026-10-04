import type { CatalogItem, CatalogOverride, ItemKind } from "./cosmetics.ts";
import type { EventDef } from "./events.ts";
import type { MonsterKind } from "./monsters.ts";
import type { RankingRow } from "./protocol.ts";
import type { GroundItemDef, PortalDef, PortalKind, SpawnDef, WorldDef } from "./world.ts";

// Tudo que o painel de administração troca com o servidor.

/** Limites do que o painel aceita, para não estourar o banco nem o jogo. */
export const ADMIN_MAX_LEVEL = 9999;
export const ADMIN_MAX_GOLD = 1_000_000_000;
export const ADMIN_MAX_DIAMONDS = 10_000_000;
export const ADMIN_PAGE_SIZE = 40;
/** Quantos monstros um administrador pode invocar de uma vez. */
export const ADMIN_MAX_SUMMON = 20;
/** Silêncio máximo, em minutos. */
export const ADMIN_MAX_MUTE_MIN = 120;
/** Teto de preço de um item da loja. */
export const ADMIN_MAX_PRICE = 1_000_000;

// ---------------------------------------------------------------- lista de jogadores

export type AdminSort = "level" | "gold" | "kills" | "recent" | "name";

export const ADMIN_SORTS: readonly AdminSort[] = ["level", "gold", "kills", "recent", "name"];

export interface AdminPlayerRow {
  accountId: number;
  username: string;
  isAdmin: boolean;
  banned: boolean;
  diamonds: number;
  /** Personagem, quando a conta tem algum. */
  characterId: number | null;
  name: string;
  level: number;
  xp: number;
  gold: number;
  kills: number;
  outfit: string;
  online: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminPlayersResponse {
  players: AdminPlayerRow[];
  total: number;
  limit: number;
  offset: number;
  /** Quem está usando o painel. */
  username: string;
}

// ---------------------------------------------------------------- ficha do jogador

export interface AdminAccountInfo {
  accountId: number;
  username: string;
  diamonds: number;
  isAdmin: boolean;
  banned: boolean;
  banReason: string;
  createdAt: string;
}

export interface AdminCharacterInfo {
  characterId: number;
  name: string;
  level: number;
  xp: number;
  /** Experiência que falta para o próximo nível. */
  xpToNext: number;
  gold: number;
  kills: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  x: number;
  y: number;
  outfit: string;
  pet: string;
  mount: string;
  shortcuts: string[];
  createdAt: string;
  lastLoginAt: string | null;
  online: boolean;
}

export interface AdminUnlockRow {
  itemId: string;
  name: string;
  kind: ItemKind;
  acquiredAt: string;
}

export interface AdminPurchaseRow {
  id: number;
  itemId: string;
  name: string;
  currency: string;
  price: number;
  at: string;
}

export interface AdminDetailResponse {
  account: AdminAccountInfo;
  characters: AdminCharacterInfo[];
  unlocks: AdminUnlockRow[];
  purchases: AdminPurchaseRow[];
  log: AdminLogRow[];
}

// ---------------------------------------------------------------- mudanças

/** Mudanças num personagem. Campo ausente = não mexe. */
export interface AdminCharacterPatch {
  characterId: number;
  name?: string;
  level?: number;
  xp?: number;
  gold?: number;
  kills?: number;
  outfit?: string;
  pet?: string;
  mount?: string;
  x?: number;
  y?: number;
}

/** Mudanças numa conta. */
export interface AdminAccountPatch {
  accountId: number;
  diamonds?: number;
  isAdmin?: boolean;
  banned?: boolean;
  /** Motivo do bloqueio, mostrado a quem tenta entrar. */
  banReason?: string;
  /** Libera um item do catálogo (roupa, mascote ou montaria). */
  unlock?: string;
  /** Tira um item já liberado. */
  revoke?: string;
  /** Senha nova, quando o administrador precisa devolver o acesso a alguém. */
  password?: string;
}

// ---------------------------------------------------------------- mundo ao vivo

export interface AdminWorldPlayer {
  characterId: number;
  /** Mundo onde o personagem está agora. */
  world: string;
  accountId: number;
  name: string;
  username: string;
  level: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  x: number;
  y: number;
  gold: number;
  outfit: string;
  mounted: boolean;
  mutedMs: number;
}

export interface AdminWorld {
  players: AdminWorldPlayer[];
  monsters: number;
  /** Quanta gente e quantos monstros em cada mundo aberto. */
  worlds: AdminWorldLive[];
  /** Evento em andamento ("" quando não há nenhum). */
  event: string;
  eventEndsAt: number;
  xpMultiplier: number;
  rooms: number;
  uptimeMs: number;
}

export interface AdminWorldResponse {
  world: AdminWorld;
}

/** Retrato de um mundo em funcionamento. */
export interface AdminWorldLive {
  worldId: number;
  slug: string;
  name: string;
  players: number;
  monsters: number;
  loot: number;
}

// ---------------------------------------------------------------- comandos do mestre

export type AdminCommandKind =
  | "announce"
  | "event"
  | "stopEvent"
  | "whisper"
  | "kick"
  | "teleport"
  | "heal"
  | "summon"
  | "mute";

export interface AdminCommandRequest {
  kind: AdminCommandKind;
  /** Texto do anúncio ou do recado. */
  text?: string;
  characterId?: number;
  /** Chave do evento a começar (aba Eventos). */
  event?: string;
  x?: number;
  y?: number;
  /** Mundo do teleporte (0 = onde o jogador já está). */
  worldId?: number;
  monster?: MonsterKind;
  count?: number;
  minutes?: number;
}

export interface AdminCommandResponse {
  /** Mensagem pronta para mostrar no painel. */
  message: string;
}

// ---------------------------------------------------------------- visão geral

export interface AdminStats {
  accounts: number;
  admins: number;
  banned: number;
  characters: number;
  accountsToday: number;
  accountsWeek: number;
  charactersToday: number;
  online: number;
  gold: number;
  diamonds: number;
  kills: number;
  topLevel: number;
  purchases: number;
  spentGold: number;
  spentDiamonds: number;
}

/** Um dia da série de cadastros (do mais antigo para o mais novo). */
export interface AdminDay {
  day: string;
  accounts: number;
  characters: number;
}

export interface AdminOverviewResponse {
  username: string;
  stats: AdminStats;
  days: AdminDay[];
  top: RankingRow[];
  log: AdminLogRow[];
  world: AdminWorld;
}

// ---------------------------------------------------------------- histórico

export interface AdminLogRow {
  id: number;
  admin: string;
  action: string;
  detail: string;
  target: string;
  at: string;
}

export interface AdminLogResponse {
  entries: AdminLogRow[];
}


// ---------------------------------------------------------------- mundos e mapas

/** Uma linha da lista de mundos do painel. */
export interface AdminWorldRow {
  world: WorldDef;
  /** Tiles pintados à mão. */
  painted: number;
  portals: number;
  spawns: number;
  items: number;
  /** Personagens que estão nesse mundo agora. */
  online: number;
  /** Personagens cujo ponto de volta é esse mundo. */
  characters: number;
}

export interface AdminWorldsResponse {
  worlds: AdminWorldRow[];
}

/** Tudo de um mundo, para abrir no editor. */
export interface AdminMapResponse {
  world: WorldDef;
  /** Trincas [índice, chão, objeto] do que foi pintado. */
  tiles: number[];
  portals: PortalDef[];
  spawns: SpawnDef[];
  items: GroundItemDef[];
}

/** Mudanças nos dados do mundo. Campo ausente = não mexe. */
export interface AdminWorldPatch {
  worldId?: number;
  name?: string;
  style?: WorldDef["style"];
  seed?: number;
  width?: number;
  height?: number;
  spawnX?: number;
  spawnY?: number;
  townRadius?: number;
  published?: boolean;
  autoSpawns?: boolean;
  isDefault?: boolean;
  depth?: number;
}

/** Um tile do pincel. `reset` devolve o tile ao que o gerador tinha feito. */
export interface AdminTileEdit {
  x: number;
  y: number;
  ground: number;
  object: number;
  reset?: boolean;
}

export interface AdminTilesRequest {
  worldId: number;
  tiles: AdminTileEdit[];
}

/** Portal, ninho ou tesouro: `id` 0 cria, `remove` apaga. */
export interface AdminPlacementRequest {
  worldId: number;
  id?: number;
  remove?: boolean;
  x?: number;
  y?: number;
  /** Portal. */
  toWorldId?: number;
  toX?: number;
  toY?: number;
  name?: string;
  minLevel?: number;
  /** Desenho da ligação (escada, rampa, buraco). */
  kind?: PortalKind;
  /** Cria junto a ligação de volta no destino. Só vale ao criar. */
  withReturn?: boolean;
  /** Ninho. */
  monster?: MonsterKind;
  amount?: number;
  radius?: number;
  respawnMs?: number;
  /** Tesouro. */
  loot?: string;
  gold?: number;
  diamonds?: number;
}

// ---------------------------------------------------------------- eventos

export interface AdminEventsResponse {
  events: EventDef[];
  /** Evento em andamento agora, se houver. */
  running: string;
  runningEndsAt: number;
}

/** Salva um evento: `id` 0 cria. */
export interface AdminEventRequest extends Partial<EventDef> {
  remove?: boolean;
}

// ---------------------------------------------------------------- loja

export interface AdminItemRow {
  item: CatalogItem;
  /** Valores de fábrica, para o painel mostrar o que mudou. */
  base: CatalogItem;
  /** Quantas contas já compraram. */
  sold: number;
  /** Quanto foi gasto nesse item. */
  revenue: number;
  /** Quantas contas têm o item liberado. */
  owners: number;
}

export interface AdminItemsResponse {
  items: AdminItemRow[];
}

export interface AdminItemRequest extends CatalogOverride {
  /** Desfaz as mudanças e volta ao preço de fábrica. */
  reset?: boolean;
}
