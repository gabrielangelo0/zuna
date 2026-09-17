/**
 * XP total necessária para alcançar um nível. Curva cúbica no estilo Tibia:
 * nível 2 = 100, nível 10 = 9.300, nível 100 ≈ 15,7 milhões. Sem limite de nível.
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round((50 / 3) * (level ** 3 - 6 * level ** 2 + 17 * level - 12));
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

export function playerStats(level: number): PlayerStats {
  return {
    maxHp: 150 + 15 * (level - 1),
    maxMana: 50 + 10 * (level - 1),
    maxDamage: 12 + 3 * level,
    armor: 2 + Math.floor(level * 0.6),
  };
}
