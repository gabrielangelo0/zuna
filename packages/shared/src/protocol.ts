import type { Appearance, CatalogOverride, ItemKind } from "./cosmetics.ts";
import type { EquipSlot, GearDef } from "./items.ts";
import type { LootKind } from "./loot.ts";
import type { MonsterKind } from "./monsters.ts";
import type { SpellElement, SpellId } from "./spells.ts";
import type { WorldBlueprint } from "./world.ts";

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

/** Mundos abertos e os preços em vigor: o cliente pede isso antes de entrar no jogo. */
export interface WorldsResponse {
  worlds: WorldBlueprint[];
  catalog: CatalogOverride[];
  /** Equipamentos em vigor (nomes, ícones e atributos editados no painel). */
  gear: GearDef[];
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

/** Troca os atalhos da barra de poderes: uma lista com SHORTCUT_SLOTS ids (vazio = slot livre). */
export interface ShortcutsMessage {
  slots: string[];
}

// ---------------------------------------------------------------- ranking

export type RankingBoard = "level" | "gold" | "kills";

export const RANKING_BOARDS: readonly RankingBoard[] = ["level", "gold", "kills"];

export const RANKING_SIZE = 50;

export interface RankingRow {
  rank: number;
  name: string;
  level: number;
  /** Roupa equipada: o painel usa para mostrar o retrato da classe. */
  outfit: string;
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
  Shortcuts: "shortcuts",
  ToggleMount: "toggleMount",
  /** Equipamentos: vestir, tirar, vender e comprar. */
  ItemEquip: "itemEquip",
  ItemMove: "itemMove",
  ItemUse: "itemUse",
  ItemSell: "itemSell",
  ItemBuy: "itemBuy",
  QuickPotion: "quickPotion",
  /** Missões: entregar e invocar o chefe do desafio. */
  QuestClaim: "questClaim",
  QuestBoss: "questBoss",
  /** Check-in diário: abrir o presente do dia. */
  CheckinClaim: "checkinClaim",
} as const;

/** Clique duplo: veste (ou tira) o item, ou usa a poção. */
export interface ItemEquipMessage {
  uid: number;
}

/** Arrastar e soltar: para um espaço do corpo ou uma casa da mochila. `count` divide a pilha. */
export interface ItemMoveMessage {
  uid: number;
  to: EquipSlot | "bag";
  index?: number;
  count?: number;
}

export interface ItemUseMessage {
  uid: number;
}

/** Teclas Q (vida) e E (mana). */
export interface QuickPotionMessage {
  kind: "hp" | "mana";
}

export interface ItemSellMessage {
  uid: number;
  count?: number;
}

export interface ItemBuyMessage {
  id: string;
  currency: "gold" | "diamonds";
  count?: number;
}

/** Ataque especial de monstro (baforada, explosão): explosão em cada casa atingida. */
export interface MonsterSpellEvent {
  caster: string;
  element: SpellElement;
  kind: "wave" | "blast" | "area";
  /** Casas atingidas (x, y, x, y…). */
  tiles: number[];
  x: number;
  y: number;
}

/** Disparo de besta, para o cliente desenhar a flecha voando. */
export interface ShotEvent {
  attacker: string;
  target: string;
}

// ---------------------------------------------------------------- servidor → clientes

export type HitKind = "damage" | "heal" | "block" | "crit";

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
  /** Casas atingidas (x, y, x, y…): cada uma ganha uma explosão. */
  tiles?: number[];
}

/** Alguém pegou um drop do chão. */
export interface LootEvent {
  /** Jogador que pegou. */
  id: string;
  kind: LootKind;
  /** Equipamento pego (kind "item"). */
  item?: string;
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
  /** Poderes na barra de atalhos, na ordem das teclas. */
  shortcuts: string[];
}

export interface PurchaseEvent {
  ok: boolean;
  id: string;
  message: string;
}

/** O jogador atravessou um portal (ou foi levado pelo painel) e trocou de mundo. */
export interface TravelEvent {
  world: string;
  x: number;
  y: number;
  /** Nome do mundo, para o aviso na tela. */
  name: string;
}

/** Um mundo foi editado no painel: o cliente redesenha o terreno na hora. */
export interface WorldPatchEvent {
  blueprint: WorldBlueprint;
}

/** Os preços da loja mudaram no painel: a vitrine de quem está jogando acompanha. */
export interface CatalogEvent {
  catalog: CatalogOverride[];
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
  Travel: "travel",
  WorldPatch: "worldPatch",
  Catalog: "catalog",
  /** Itens do jogador (só ele recebe). */
  Inventory: "inventory",
  /** Catálogo de equipamentos mudou no painel. */
  Gear: "gear",
  Shot: "shot",
  MonsterSpell: "monsterSpell",
  /** Missões do jogador (só ele recebe). */
  Quests: "quests",
  /** Check-in diário do jogador (só ele recebe). */
  Checkin: "checkin",
  /** Baús de marco: a lista e os que este personagem já pegou (só ele recebe). */
  Milestones: "milestones",
} as const;
