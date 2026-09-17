export type SpellId = "heal" | "whirl";

export interface SpellDef {
  id: SpellId;
  name: string;
  mana: number;
  cooldownMs: number;
  key: string;
}

export const SPELLS: Record<SpellId, SpellDef> = {
  heal: { id: "heal", name: "Cura", mana: 25, cooldownMs: 1000, key: "1" },
  whirl: { id: "whirl", name: "Golpe Giratório", mana: 35, cooldownMs: 2000, key: "2" },
};

export function healAmount(level: number): number {
  return 30 + level * 5;
}
