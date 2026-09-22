// Poderes sem fim: cada família ganha um grau novo de tantos em tantos níveis,
// sempre mais forte e mais caro. O jogador escolhe quais ficam nos atalhos.

import { DIRS, type Point } from "./geometry.ts";

/**
 * heal: em si mesmo · melee: em volta, colado · target: um alvo · leech: um alvo, cura metade ·
 * area: círculo em volta de quem lança · wave: leque na direção em que olha · blast: círculo em volta do alvo.
 */
export type SpellKind = "heal" | "melee" | "target" | "area" | "leech" | "wave" | "blast";

/** Aparência da explosão em cada casa atingida. */
export type SpellElement = "fire" | "ice" | "energy" | "earth" | "holy" | "death";

/** Id de um poder: família + grau, por exemplo "bolt3". */
export type SpellId = string;

export interface SpellFamily {
  family: string;
  name: string;
  short: string;
  description: string;
  kind: SpellKind;
  /** Nível do primeiro grau. */
  baseLevel: number;
  /** De quantos em quantos níveis abre um grau novo. */
  everyLevels: number;
  /** Mana e força do grau I. */
  mana: number;
  cooldownMs: number;
  /** Alcance em tiles: 0 é em si mesmo, 1 os vizinhos, mais que isso precisa de alvo. */
  range: number;
  /** Dano (ou cura) em múltiplos do golpe normal do nível. */
  power: number;
  /** blast: raio da explosão em volta do alvo. */
  radius?: number;
  element: SpellElement;
}

export const SPELL_FAMILIES: readonly SpellFamily[] = [
  {
    family: "heal",
    name: "Cura",
    short: "Cura",
    description: "Recupera vida na hora",
    kind: "heal",
    baseLevel: 1,
    everyLevels: 6,
    mana: 25,
    cooldownMs: 1000,
    range: 0,
    power: 1,
    element: "holy",
  },
  {
    family: "whirl",
    name: "Golpe Giratório",
    short: "Giratório",
    description: "Fere todos os monstros colados em você",
    kind: "melee",
    baseLevel: 4,
    everyLevels: 8,
    mana: 35,
    cooldownMs: 2000,
    range: 1,
    power: 1.3,
    element: "earth",
  },
  {
    family: "bolt",
    name: "Raio Flamejante",
    short: "Raio",
    description: "Dano forte no alvo, à distância",
    kind: "target",
    baseLevel: 8,
    everyLevels: 8,
    mana: 30,
    cooldownMs: 2500,
    range: 6,
    power: 2,
    element: "fire",
  },
  {
    family: "quake",
    name: "Tremor",
    short: "Tremor",
    description: "Sacode a terra e atinge tudo a 3 casas",
    kind: "area",
    baseLevel: 14,
    everyLevels: 10,
    mana: 55,
    cooldownMs: 8000,
    range: 3,
    power: 1.5,
    element: "earth",
  },
  {
    family: "drain",
    name: "Drenar Vida",
    short: "Drenar",
    description: "Tira vida do alvo e devolve metade para você",
    kind: "leech",
    baseLevel: 20,
    everyLevels: 12,
    mana: 45,
    cooldownMs: 7000,
    range: 5,
    power: 1.6,
    element: "death",
  },
  {
    family: "storm",
    name: "Tempestade",
    short: "Tempestade",
    description: "Raios caem em tudo a 5 casas",
    kind: "area",
    baseLevel: 30,
    everyLevels: 12,
    mana: 90,
    cooldownMs: 12_000,
    range: 5,
    power: 2.2,
    element: "energy",
  },
  {
    family: "flame",
    name: "Onda de Fogo",
    short: "Onda",
    description: "Um leque de chamas de 5 casas na direção em que você olha",
    kind: "wave",
    baseLevel: 10,
    everyLevels: 10,
    mana: 45,
    cooldownMs: 4000,
    range: 5,
    power: 1.8,
    element: "fire",
  },
  {
    family: "frost",
    name: "Chuva de Gelo",
    short: "Gelo",
    description: "Estilhaços de gelo explodem em volta do alvo",
    kind: "blast",
    baseLevel: 18,
    everyLevels: 12,
    mana: 60,
    cooldownMs: 6000,
    range: 6,
    radius: 2,
    power: 1.9,
    element: "ice",
  },
  {
    family: "inferno",
    name: "Inferno",
    short: "Inferno",
    description: "Tudo a 6 casas explode em fogo. O poder mais forte",
    kind: "area",
    baseLevel: 40,
    everyLevels: 15,
    mana: 180,
    cooldownMs: 25_000,
    range: 6,
    power: 3,
    element: "fire",
  },
];

const POWER_STEP = 1.18;
const MANA_STEP = 1.15;

export interface SpellDef {
  /** `família + grau`, por exemplo "bolt3". */
  id: string;
  family: string;
  tier: number;
  /** "Raio Flamejante III". */
  name: string;
  short: string;
  description: string;
  kind: SpellKind;
  minLevel: number;
  mana: number;
  cooldownMs: number;
  range: number;
  power: number;
  radius: number;
  element: SpellElement;
}

const ROMAN: readonly [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

export function roman(value: number): string {
  let rest = Math.max(1, Math.floor(value));
  let out = "";
  for (const [number, letters] of ROMAN) {
    while (rest >= number) {
      out += letters;
      rest -= number;
    }
  }
  return out;
}

function build(family: SpellFamily, tier: number): SpellDef {
  const acima = tier - 1;
  return {
    id: `${family.family}${tier}`,
    family: family.family,
    tier,
    name: `${family.name} ${roman(tier)}`,
    short: tier > 1 ? `${family.short} ${roman(tier)}` : family.short,
    description: family.description,
    kind: family.kind,
    minLevel: family.baseLevel + acima * family.everyLevels,
    mana: Math.round(family.mana * MANA_STEP ** acima),
    cooldownMs: family.cooldownMs,
    range: family.range,
    power: family.power * POWER_STEP ** acima,
    radius: family.radius ?? 0,
    element: family.element,
  };
}

const cache = new Map<string, SpellDef>();

/** Um poder pelo id ("bolt3"). Qualquer grau existe, mesmo os que ainda vão abrir. */
export function spellById(id: string): SpellDef | undefined {
  const cached = cache.get(id);
  if (cached) return cached;
  const match = /^([a-z]+)(\d+)$/.exec(id);
  if (!match) return undefined;
  const family = SPELL_FAMILIES.find((entry) => entry.family === match[1]);
  const tier = Number(match[2]);
  if (!family || tier < 1 || tier > 999) return undefined;
  const spell = build(family, tier);
  cache.set(id, spell);
  return spell;
}

/** Maior grau já liberado de uma família, ou 0 se ainda nem abriu. */
export function tierFor(family: SpellFamily, level: number): number {
  if (level < family.baseLevel) return 0;
  return Math.floor((level - family.baseLevel) / family.everyLevels) + 1;
}

/** Todos os poderes que o personagem já tem, do mais novo para o mais antigo dentro da família. */
export function spellsUpTo(level: number): SpellDef[] {
  const spells: SpellDef[] = [];
  for (const family of SPELL_FAMILIES) {
    for (let tier = tierFor(family, level); tier >= 1; tier--) spells.push(build(family, tier));
  }
  return spells;
}

/** Poderes que abrem exatamente ao chegar neste nível. */
export function spellsUnlockedAt(level: number): SpellDef[] {
  const spells: SpellDef[] = [];
  for (const family of SPELL_FAMILIES) {
    const tier = tierFor(family, level);
    if (tier >= 1 && family.baseLevel + (tier - 1) * family.everyLevels === level) spells.push(build(family, tier));
  }
  return spells;
}

export function spellUnlocked(spell: SpellDef, level: number): boolean {
  return level >= spell.minLevel;
}

/** Próximo grau de uma família, mesmo que ainda não tenha aberto. */
export function nextTierOf(spell: SpellDef): SpellDef | undefined {
  const family = SPELL_FAMILIES.find((entry) => entry.family === spell.family);
  return family ? build(family, spell.tier + 1) : undefined;
}

/** Quantos atalhos o jogador tem na barra. */
export const SHORTCUT_SLOTS = 8;

export const SHORTCUT_KEYS: readonly string[] = ["1", "2", "3", "4", "5", "6", "7", "8"];

/** Atalhos de quem nunca mexeu neles: o melhor grau de cada família, na ordem em que abriram. */
export function defaultShortcuts(level: number): string[] {
  const slots: string[] = [];
  for (const family of SPELL_FAMILIES) {
    const tier = tierFor(family, level);
    if (tier >= 1 && slots.length < SHORTCUT_SLOTS) slots.push(`${family.family}${tier}`);
  }
  while (slots.length < SHORTCUT_SLOTS) slots.push("");
  return slots;
}

/**
 * Limpa a lista de atalhos: só poderes liberados, sem repetição, no tamanho certo.
 * Graus antigos sobem sozinhos para o melhor grau já liberado da mesma família.
 */
export function sanitizeShortcuts(slots: readonly string[], level: number): string[] {
  const used = new Set<string>();
  const clean: string[] = [];
  for (let i = 0; i < SHORTCUT_SLOTS; i++) {
    const spell = spellById(slots[i] ?? "");
    const family = spell ? SPELL_FAMILIES.find((entry) => entry.family === spell.family) : undefined;
    if (!spell || !family) {
      clean.push("");
      continue;
    }
    const best = tierFor(family, level);
    const id = `${family.family}${Math.min(spell.tier, best)}`;
    if (best < 1 || used.has(id)) {
      clean.push("");
      continue;
    }
    used.add(id);
    clean.push(id);
  }
  // Poder novo entra sozinho numa vaga livre (famílias que ainda não estão na barra).
  const families = new Set([...used].map((id) => spellById(id)?.family));
  for (const family of SPELL_FAMILIES) {
    const tier = tierFor(family, level);
    if (tier < 1 || families.has(family.family)) continue;
    const id = `${family.family}${tier}`;
    if (used.has(id)) continue;
    const free = clean.indexOf("");
    if (free === -1) break;
    clean[free] = id;
    used.add(id);
  }
  return clean;
}

export function healAmount(level: number): number {
  return 30 + level * 5;
}

// ---------------------------------------------------------------- área dos poderes

/** Chance de golpe crítico (poderes e ataques normais) e quanto ele multiplica o dano. */
export const CRIT_CHANCE = 0.12;
export const CRIT_MULTIPLIER = 1.8;

/** Casas de um círculo (quadrado, como no Tibia) em volta de um ponto, sem o centro quando `hollow`. */
function square(center: Point, radius: number, hollow: boolean): Point[] {
  const tiles: Point[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (hollow && dx === 0 && dy === 0) continue;
      // Cantos cortados: fica redondo em vez de quadrado.
      if (radius >= 3 && Math.abs(dx) + Math.abs(dy) > radius + Math.floor(radius / 2)) continue;
      tiles.push({ x: center.x + dx, y: center.y + dy });
    }
  }
  return tiles;
}

/**
 * Leque na direção `dir` (índice de DIRS), abrindo como o fogo do Tibia: 1, 3, 3, 5, 5 casas de largura.
 * Funciona nas 8 direções pela projeção de cada casa sobre a direção.
 */
function cone(origin: Point, dir: number, length: number): Point[] {
  const d = DIRS[dir] ?? DIRS[2]!;
  const norm = Math.hypot(d.x, d.y);
  const ux = d.x / norm;
  const uy = d.y / norm;
  const tiles: Point[] = [];
  for (let dy = -length; dy <= length; dy++) {
    for (let dx = -length; dx <= length; dx++) {
      const along = dx * ux + dy * uy;
      if (along < 0.5 || along > length + 0.5) continue;
      const side = Math.abs(dx * uy - dy * ux);
      if (side <= Math.floor((along + 0.5) / 2) + 0.35) tiles.push({ x: origin.x + dx, y: origin.y + dy });
    }
  }
  return tiles;
}

/** Casas atingidas por um poder. `target` é o alvo (target, leech, blast); `dir` é para onde quem lança olha. */
export function spellArea(spell: SpellDef, caster: Point, dir: number, target?: Point): Point[] {
  switch (spell.kind) {
    case "melee":
      return square(caster, 1, true);
    case "area":
      return square(caster, spell.range, true);
    case "wave":
      return cone(caster, dir, spell.range);
    case "blast":
      return target ? square(target, spell.radius, false) : [];
    case "target":
    case "leech":
      return target ? [target] : [];
    default:
      return [];
  }
}
