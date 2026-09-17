import type { Appearance } from "./cosmetics.ts";
import type { MonsterKind } from "./monsters.ts";

// Formato dos dados sincronizados pelo Colyseus. O schema do servidor precisa bater com isto.

export interface PlayerData {
  name: string;
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
}

export interface MonsterData {
  kind: MonsterKind;
  x: number;
  y: number;
  dir: number;
  stepMs: number;
  hp: number;
  maxHp: number;
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
