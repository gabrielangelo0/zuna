import { vocationStats } from "./vocations.ts";

/**
 * XP total necessária para alcançar um nível. Sem limite de nível.
 * nível 10 = 4.095, nível 50 = 430.628, nível 100 ≈ 3,4 milhões.
 *
 * A curva antiga era a do Tibia (cúbica cheia) e pedia 280 mortes para subir no nível 50 e
 * 323 no nível 100 — quase duas horas por nível. Aqui o degrau fica em torno de 60 a 70
 * mortes do melhor monstro da faixa, que é um nível a cada 10 ou 15 minutos. A curva nova é
 * mais barata em todos os níveis, então ninguém perde nível na troca: quem já jogava sobe.
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  const steps = level - 1;
  return Math.round((10 / 3) * steps ** 3 + 15 * steps ** 2 + 50 * steps);
}

export function levelForXp(xp: number): number {
  let low = 1;
  let high = 2;
  while (xpForLevel(high) <= xp) high *= 2;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (xpForLevel(mid) <= xp) low = mid;
    else high = mid;
  }
  return low;
}

export function levelProgress(xp: number, level: number): { current: number; needed: number; ratio: number } {
  const start = xpForLevel(level);
  const needed = xpForLevel(level + 1) - start;
  const current = xp - start;
  return { current, needed, ratio: Math.min(1, Math.max(0, current / needed)) };
}

export interface PlayerStats {
  maxHp: number;
  maxMana: number;
  maxDamage: number;
  armor: number;
}

/** Atributos do nível, já com a classe. Sem classe valem os números de antes delas. */
export function playerStats(level: number, vocation = ""): PlayerStats {
  const stats = vocationStats(vocation);
  return {
    maxHp: Math.round(stats.hpBase + stats.hpPerLevel * (level - 1)),
    maxMana: Math.round(stats.manaBase + stats.manaPerLevel * (level - 1)),
    maxDamage: Math.round((12 + 3 * level) * stats.attackFactor),
    armor: Math.round((2 + level * 0.6) * stats.armorFactor),
  };
}
