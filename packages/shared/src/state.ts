import type { Appearance } from "./cosmetics.ts";
import type { LootKind } from "./loot.ts";
import type { MonsterKind } from "./monsters.ts";

// Formato dos dados sincronizados pelo Colyseus. O schema do servidor precisa bater com isto.

export interface PlayerData {
  name: string;
  /** Mundo onde o personagem está (chave do mundo). */
  world: string;
  x: number;
  y: number;
  dir: number;
  stepMs: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  level: number;
  xp: number;
  gold: number;
  /** Id do monstro sendo atacado, ou vazio. */
  target: string;
  skin: number;
  hairColor: number;
  outfit: string;
  primary: number;
  secondary: number;
  detail: number;
  /** Mascote equipado, ou vazio. */
  pet: string;
  /** Montaria equipada, ou vazio. */
  mount: string;
  mounted: boolean;
  /** Aparência do que está vestido (ícones em VISIBLE_SLOTS, separados por vírgula). */
  looks: string;
  /** Marcado como agressor em PvP: quem está perto vê a caveira em cima dele. */
  marked: boolean;
  /** Degrau de VIP ativo (0 = não é VIP). A cor e o título saem da tabela de degraus. */
  vip: number;
  /** Título do degrau, mostrado acima do nome. */
  title: string;
}

export interface MonsterData {
  kind: MonsterKind;
  world: string;
  x: number;
  y: number;
  dir: number;
  stepMs: number;
  hp: number;
  maxHp: number;
}

/** Um drop no chão, esperando alguém passar por cima. */
export interface LootData {
  kind: LootKind;
  world: string;
  x: number;
  y: number;
  gold: number;
  diamonds: number;
  /** Item no chão (kind "item"), ou vazio. */
  item: string;
  /** Quantos (poções e flechas vêm em montinhos). */
  count: number;
  /** Id de quem derrubou o monstro: só ele pega até `freeAt`. */
  owner: string;
  /** Instante em que o drop libera para todo mundo. */
  freeAt: number;
  /** Instante em que o drop some do chão. */
  expiresAt: number;
}

export function appearanceOf(player: PlayerData): Appearance {
  return {
    skin: player.skin,
    hairColor: player.hairColor,
    outfit: player.outfit,
    primary: player.primary,
    secondary: player.secondary,
    detail: player.detail,
  };
}
