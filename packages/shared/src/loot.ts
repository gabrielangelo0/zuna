import type { MonsterDef } from "./monsters.ts";
import { randInt } from "./rng.ts";

// O que os monstros deixam cair no chão. O servidor sorteia; o cliente só desenha.

export type LootKind = "coins" | "chest" | "crystal" | "item";

export type LootRarity = "comum" | "raro" | "lendario";

export interface LootDef {
  kind: LootKind;
  name: string;
  rarity: LootRarity;
  /** Cor do brilho no chão e do texto que sobe ao pegar. */
  color: number;
  /** Anuncia para o servidor inteiro quando alguém pega. */
  announce: boolean;
}

export const LOOT: Record<LootKind, LootDef> = {
  coins: { kind: "coins", name: "Moedas", rarity: "comum", color: 0xf2c94c, announce: false },
  chest: { kind: "chest", name: "Baú de Ouro", rarity: "raro", color: 0xffd479, announce: false },
  crystal: { kind: "crystal", name: "Cristal de Zuna", rarity: "lendario", color: 0x5ef08f, announce: true },
  // Equipamento: nome, cor e anúncio vêm da raridade do item (items.ts).
  item: { kind: "item", name: "Equipamento", rarity: "raro", color: 0x4aa8ff, announce: false },
};

export const LOOT_KINDS = Object.keys(LOOT) as LootKind[];

/** Quanto tempo o drop fica no chão antes de sumir. */
export const LOOT_TTL_MS = 90_000;
/** Nos primeiros segundos, só quem derrubou o monstro pega. */
export const LOOT_OWNER_MS = 20_000;

export function lootSpriteId(kind: LootKind): string {
  return `loot_${kind}`;
}

export interface DropRoll {
  kind: LootKind;
  gold: number;
  diamonds: number;
  /** Id do equipamento (kind "item"). */
  item?: string;
}

/** Sorteia o que um monstro deixa cair. O bônus de ouro do mascote entra aqui. */
export function rollDrops(random: () => number, def: MonsterDef, goldBonus = 0): DropRoll[] {
  const drops: DropRoll[] = [];
  const withBonus = (gold: number) => Math.round(gold * (1 + goldBonus));

  const coins = randInt(random, def.gold[0], def.gold[1]);
  if (coins > 0) drops.push({ kind: "coins", gold: withBonus(coins), diamonds: 0 });

  if (random() < def.chestChance) {
    const gold = randInt(random, def.gold[1] * 3, def.gold[1] * 6);
    drops.push({ kind: "chest", gold: withBonus(Math.max(25, gold)), diamonds: 0 });
  }

  if (def.crystalChance > 0 && random() < def.crystalChance) {
    drops.push({ kind: "crystal", gold: 0, diamonds: def.crystalDiamonds });
  }
  return drops;
}

/** Texto do drop: "32 moedas de ouro", "2 diamantes". */
export function describeDrop(drop: { gold: number; diamonds: number }): string {
  const parts: string[] = [];
  if (drop.gold > 0) parts.push(`${drop.gold} ${drop.gold === 1 ? "moeda de ouro" : "moedas de ouro"}`);
  if (drop.diamonds > 0) parts.push(`${drop.diamonds} ${drop.diamonds === 1 ? "diamante" : "diamantes"}`);
  return parts.join(" e ") || "nada";
}
