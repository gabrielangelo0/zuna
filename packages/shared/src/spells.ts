// Poderes sem fim: cada família ganha um grau novo de tantos em tantos níveis,
// sempre mais forte e mais caro. O jogador escolhe quais ficam nos atalhos.

export type SpellKind = "heal" | "melee" | "target" | "area" | "leech";

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
    power: 1.2,
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
  },
  {
    family: "quake",
    name: "Tremor",
    short: "Tremor",
    description: "Sacode a terra e atinge tudo em volta",
    kind: "area",
    baseLevel: 14,
    everyLevels: 10,
    mana: 55,
    cooldownMs: 9000,
    range: 2,
    power: 1.4,
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
  },
  {
    family: "storm",
    name: "Tempestade",
    short: "Tempestade",
    description: "Raios caem num raio de 4 tiles",
    kind: "area",
    baseLevel: 30,
    everyLevels: 12,
    mana: 90,
    cooldownMs: 14_000,
    range: 4,
    power: 2.2,
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
export const SHORTCUT_SLOTS = 6;

export const SHORTCUT_KEYS: readonly string[] = ["1", "2", "3", "4", "5", "6"];

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
  // Poder novo entra sozinho numa vaga livre.
  for (const family of SPELL_FAMILIES) {
    const tier = tierFor(family, level);
    if (tier < 1) continue;
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
