export type MonsterKind = "rat" | "snake" | "wolf" | "orc" | "troll" | "cyclops" | "orcLeader";

export interface MonsterDef {
  kind: MonsterKind;
  name: string;
  hp: number;
  /** XP fixa que o monstro dá ao morrer, dividida pelo dano causado por cada jogador. */
  xp: number;
  armor: number;
  maxHit: number;
  attackMs: number;
  stepMs: number;
  aggroRange: number;
  gold: readonly [number, number];
  /** 0 = não renasce (monstros de evento). */
  respawnMs: number;
}

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  rat: { kind: "rat", name: "Slime Rosa", hp: 20, xp: 5, armor: 0, maxHit: 6, attackMs: 2000, stepMs: 420, aggroRange: 3, gold: [0, 4], respawnMs: 15_000 },
  snake: { kind: "snake", name: "Cogumelo", hp: 25, xp: 10, armor: 1, maxHit: 12, attackMs: 2000, stepMs: 480, aggroRange: 5, gold: [0, 6], respawnMs: 20_000 },
  wolf: { kind: "wolf", name: "Lobo", hp: 40, xp: 20, armor: 2, maxHit: 18, attackMs: 1800, stepMs: 320, aggroRange: 6, gold: [0, 8], respawnMs: 25_000 },
  orc: { kind: "orc", name: "Orc", hp: 80, xp: 35, armor: 3, maxHit: 30, attackMs: 2000, stepMs: 380, aggroRange: 6, gold: [5, 20], respawnMs: 30_000 },
  troll: { kind: "troll", name: "Yeti", hp: 120, xp: 50, armor: 4, maxHit: 40, attackMs: 2000, stepMs: 400, aggroRange: 6, gold: [8, 30], respawnMs: 35_000 },
  cyclops: { kind: "cyclops", name: "Demônio", hp: 300, xp: 150, armor: 6, maxHit: 90, attackMs: 2200, stepMs: 450, aggroRange: 7, gold: [20, 80], respawnMs: 60_000 },
  orcLeader: { kind: "orcLeader", name: "Senhor Esqueleto", hp: 650, xp: 450, armor: 8, maxHit: 70, attackMs: 2000, stepMs: 360, aggroRange: 9, gold: [80, 200], respawnMs: 0 },
};
