import type { ItemKind } from "./cosmetics.ts";
import type { MonsterKind } from "./monsters.ts";
import type { RankingRow } from "./protocol.ts";

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

// ---------------------------------------------------------------- comandos do mestre

export type AdminCommandKind =
  "announce" | "event" | "stopEvent" | "whisper" | "kick" | "teleport" | "heal" | "summon" | "mute";

export interface AdminCommandRequest {
  kind: AdminCommandKind;
  /** Texto do anúncio ou do recado. */
  text?: string;
  characterId?: number;
  event?: "xp" | "invasion";
  x?: number;
  y?: number;
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
