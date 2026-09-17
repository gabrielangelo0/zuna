export type SpellId = "heal" | "whirl" | "bolt" | "quake" | "drain";

export interface SpellDef {
  id: SpellId;
  name: string;
  /** Nome curto, para caber na barra de poderes. */
  short: string;
  /** Uma linha para a barra de poderes e para o aviso de desbloqueio. */
  description: string;
  mana: number;
  cooldownMs: number;
  /** Tecla de atalho. */
  key: string;
  /** Nível em que o poder é liberado. */
  minLevel: number;
  /** Alcance em tiles: 0 atinge quem lança, 1 os vizinhos, mais que isso precisa de alvo. */
  range: number;
}

export const SPELLS: Record<SpellId, SpellDef> = {
  heal: {
    id: "heal",
    name: "Cura",
    short: "Cura",
    description: "Recupera vida na hora",
    mana: 25,
    cooldownMs: 1000,
    key: "1",
    minLevel: 1,
    range: 0,
  },
  whirl: {
    id: "whirl",
    name: "Golpe Giratório",
    short: "Giratório",
    description: "Fere todos os monstros colados em você",
    mana: 35,
    cooldownMs: 2000,
    key: "2",
    minLevel: 4,
    range: 1,
  },
  bolt: {
    id: "bolt",
    name: "Raio Flamejante",
    short: "Raio",
    description: "Dano forte no alvo, à distância",
    mana: 30,
    cooldownMs: 2500,
    key: "3",
    minLevel: 8,
    range: 6,
  },
  quake: {
    id: "quake",
    name: "Tremor",
    short: "Tremor",
    description: "Sacode a terra e atinge tudo em volta",
    mana: 55,
    cooldownMs: 9000,
    key: "4",
    minLevel: 14,
    range: 2,
  },
  drain: {
    id: "drain",
    name: "Drenar Vida",
    short: "Drenar",
    description: "Tira vida do alvo e devolve metade para você",
    mana: 45,
    cooldownMs: 7000,
    key: "5",
    minLevel: 20,
    range: 5,
  },
};

/** Na ordem das teclas. */
export const SPELL_LIST: readonly SpellDef[] = Object.values(SPELLS).sort((a, b) => a.minLevel - b.minLevel);

export function spellUnlocked(spell: SpellDef, level: number): boolean {
  return level >= spell.minLevel;
}

/** Poderes que abrem exatamente ao chegar neste nível. */
export function spellsUnlockedAt(level: number): SpellDef[] {
  return SPELL_LIST.filter((spell) => spell.minLevel === level);
}

export function healAmount(level: number): number {
  return 30 + level * 5;
}
