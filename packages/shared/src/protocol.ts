import type { Appearance, ItemKind } from "./cosmetics.ts";
import type { LootKind } from "./loot.ts";
import type { MonsterKind } from "./monsters.ts";
import type { SpellId } from "./spells.ts";

// ---------------------------------------------------------------- API HTTP

export interface AuthRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  username: string;
}

export interface CharacterSummary {
  id: number;
  name: string;
  level: number;
  appearance: Appearance;
}

export interface CharactersResponse {
  username: string;
  diamonds: number;
  maxCharacters: number;
  characters: CharacterSummary[];
}

export interface CreateCharacterRequest {
  name: string;
  appearance: Appearance;
}

export interface CreateCharacterResponse {
  character: CharacterSummary;
}

export interface ApiErrorBody {
  message: string;
}

// ---------------------------------------------------------------- cliente → servidor (sala)

export interface JoinOptions {
  token: string;
  characterId: number;
}

/** Direção segurada no teclado, em coordenadas de tile. (0, 0) para. */
export interface MoveMessage {
  dx: number;
  dy: number;
}

export interface GotoMessage {
  x: number;
  y: number;
}

/** `id` vazio limpa o alvo. */
export interface TargetMessage {
  id: string;
}

export interface SpellMessage {
  id: SpellId;
}

export interface ChatMessage {
  text: string;
}

/** Tudo da aparência que é gratuito trocar (a roupa é equipada à parte). */
export type AppearanceMessage = Omit<Appearance, "outfit">;

/** `id` vazio desequipa mascote ou montaria. */
export interface EquipMessage {
  kind: ItemKind;
  id: string;
}

export interface BuyMessage {
  id: string;
}

// ---------------------------------------------------------------- ranking

export type RankingBoard = "level" | "gold" | "kills";

export const RANKING_BOARDS: readonly RankingBoard[] = ["level", "gold", "kills"];

export const RANKING_SIZE = 50;

export interface RankingRow {
  rank: number;
  name: string;
  level: number;
  /** Experiência, ouro ou caçadas, conforme a lista. */
  value: number;
}

export interface RankingResponse {
  board: RankingBoard;
  entries: RankingRow[];
  /** Quando o servidor montou esta lista (as listas são atualizadas a cada 30 s). */
  updatedAt: number;
}

export const ClientMsg = {
  Move: "move",
  Goto: "goto",
  Target: "target",
  Spell: "spell",
  Chat: "chat",
  Appearance: "appearance",
  Equip: "equip",
  Buy: "buy",
  ToggleMount: "toggleMount",
} as const;

// ---------------------------------------------------------------- servidor → clientes

export type HitKind = "damage" | "heal" | "block";

export interface HitEvent {
  target: string;
  attacker: string;
  amount: number;
  kind: HitKind;
}

export interface XpEvent {
  id: string;
  amount: number;
}

export interface LevelUpEvent {
  id: string;
  level: number;
}

export interface MonsterDeathEvent {
  id: string;
  kind: MonsterKind;
  x: number;
  y: number;
}

export interface PlayerDeathEvent {
  id: string;
  x: number;
  y: number;
  xpLost: number;
}

export interface SpellEffectEvent {
  caster: string;
  spell: SpellId;
  x: number;
  y: number;
}

/** Alguém pegou um drop do chão. */
export interface LootEvent {
  /** Jogador que pegou. */
  id: string;
  kind: LootKind;
  gold: number;
  diamonds: number;
  x: number;
  y: number;
}

export type ChatChannel = "player" | "system" | "event" | "loot";

export interface ChatEvent {
  channel: ChatChannel;
  from?: string;
  /** Id de quem falou, para o balão aparecer acima do personagem. */
  id?: string;
  text: string;
}

export interface AnnounceEvent {
  text: string;
}

/** Dados privados do jogador: só ele recebe. */
export interface ProfileEvent {
  diamonds: number;
  unlocks: string[];
}

export interface PurchaseEvent {
  ok: boolean;
  id: string;
  message: string;
}

export const ServerMsg = {
  Hit: "hit",
  Xp: "xp",
  LevelUp: "levelUp",
  MonsterDeath: "monsterDeath",
  Loot: "loot",
  PlayerDeath: "playerDeath",
  SpellEffect: "spellEffect",
  Chat: "chat",
  Announce: "announce",
  Profile: "profile",
  Purchase: "purchase",
} as const;
