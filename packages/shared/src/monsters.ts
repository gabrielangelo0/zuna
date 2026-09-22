import type { SpellElement } from "./spells.ts";

export type MonsterKind =
  // Zuna, o mundo inicial
  | "rat"
  | "snake"
  | "wolf"
  | "orc"
  | "troll"
  | "cyclops"
  | "orcLeader"
  // Floresta Sombria
  | "fox"
  | "mushroomBrute"
  | "golem"
  | "mushroomKing"
  // Pântano
  | "spikyBlob"
  | "frog"
  | "glub"
  | "frogKing"
  // Deserto
  | "cactus"
  | "wasp"
  | "raptor"
  | "cactusWarrior"
  | "raptorAlpha"
  // Montanhas Geladas
  | "yetiCub"
  | "iceSpirit"
  | "bison"
  | "yetiElder"
  // Cripta
  | "skeleton"
  | "ghostSkull"
  | "skeletonMage"
  | "necroLord"
  // Vulcão
  | "imp"
  | "blueDemon"
  | "dragon"
  // Covil dos Dragões
  | "dragonGreen"
  | "dragonIce"
  | "dragonRed"
  | "dragonLord"
  // Abismo Demoníaco
  | "hellfire"
  | "shadowBeast"
  | "behemoth"
  | "archdemon";

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
  /** Chance (0 a 1) de deixar cair um baú de ouro além das moedas. */
  chestChance: number;
  /** Chance (0 a 1) do Cristal de Zuna, que vale diamantes. */
  crystalChance: number;
  /** Diamantes dentro do cristal. */
  crystalDiamonds: number;
  /** 0 = não renasce (monstros de evento). */
  respawnMs: number;
  /** Chefe: barra de vida maior, nome em destaque e anúncio quando cai. */
  boss?: boolean;
  /** Ataque especial em área (baforada, explosão), com explosões em cada casa atingida. */
  special?: MonsterSpecial;
}

/**
 * wave: leque na direção do alvo (baforada) · blast: círculo em volta do alvo ·
 * area: círculo em volta do próprio monstro.
 */
export interface MonsterSpecial {
  name: string;
  kind: "wave" | "blast" | "area";
  element: SpellElement;
  /** wave: comprimento · area: raio · blast: alcance até o alvo. */
  range: number;
  /** blast: raio em volta do alvo. */
  radius?: number;
  /** Dano médio antes da defesa. */
  power: number;
  cooldownMs: number;
}

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  rat: { kind: "rat", name: "Slime Rosa", hp: 20, xp: 5, armor: 0, maxHit: 6, attackMs: 2000, stepMs: 420, aggroRange: 3, gold: [0, 4], chestChance: 0.02, crystalChance: 0, crystalDiamonds: 0, respawnMs: 15_000 },
  snake: { kind: "snake", name: "Cogumelo", hp: 25, xp: 10, armor: 1, maxHit: 12, attackMs: 2000, stepMs: 480, aggroRange: 5, gold: [0, 6], chestChance: 0.03, crystalChance: 0, crystalDiamonds: 0, respawnMs: 20_000 },
  wolf: { kind: "wolf", name: "Lobo", hp: 40, xp: 20, armor: 2, maxHit: 18, attackMs: 1800, stepMs: 320, aggroRange: 6, gold: [0, 8], chestChance: 0.05, crystalChance: 0.001, crystalDiamonds: 1, respawnMs: 25_000 },
  orc: { kind: "orc", name: "Orc", hp: 80, xp: 35, armor: 3, maxHit: 30, attackMs: 2000, stepMs: 380, aggroRange: 6, gold: [5, 20], chestChance: 0.08, crystalChance: 0.002, crystalDiamonds: 1, respawnMs: 30_000 },
  troll: { kind: "troll", name: "Yeti", hp: 120, xp: 50, armor: 4, maxHit: 40, attackMs: 2000, stepMs: 400, aggroRange: 6, gold: [8, 30], chestChance: 0.1, crystalChance: 0.004, crystalDiamonds: 1, respawnMs: 35_000 },
  cyclops: { kind: "cyclops", name: "Demônio", hp: 300, xp: 150, armor: 6, maxHit: 90, attackMs: 2200, stepMs: 450, aggroRange: 7, gold: [20, 80], chestChance: 0.16, crystalChance: 0.012, crystalDiamonds: 2, respawnMs: 60_000 },
  orcLeader: { kind: "orcLeader", name: "Senhor Esqueleto", hp: 650, xp: 450, armor: 8, maxHit: 70, attackMs: 2000, stepMs: 360, aggroRange: 9, gold: [80, 200], chestChance: 1, crystalChance: 0.5, crystalDiamonds: 5, respawnMs: 0, boss: true },

  // Floresta Sombria (nível 10 a 30)
  fox: { kind: "fox", name: "Raposa Sombria", hp: 160, xp: 70, armor: 3, maxHit: 40, attackMs: 1500, stepMs: 300, aggroRange: 7, gold: [3, 15], chestChance: 0.05, crystalChance: 0.002, crystalDiamonds: 1, respawnMs: 25_000 },
  mushroomBrute: { kind: "mushroomBrute", name: "Cogumelo Venenoso", hp: 210, xp: 95, armor: 5, maxHit: 48, attackMs: 2000, stepMs: 460, aggroRange: 5, gold: [5, 20], chestChance: 0.06, crystalChance: 0.002, crystalDiamonds: 1, respawnMs: 25_000 },
  golem: { kind: "golem", name: "Morcego do Musgo", hp: 360, xp: 160, armor: 9, maxHit: 62, attackMs: 2400, stepMs: 520, aggroRange: 6, gold: [10, 35], chestChance: 0.08, crystalChance: 0.004, crystalDiamonds: 1, respawnMs: 35_000 },
  mushroomKing: { kind: "mushroomKing", name: "Rei Cogumelo", hp: 2400, xp: 1800, armor: 12, maxHit: 110, attackMs: 2200, stepMs: 440, aggroRange: 9, gold: [150, 400], chestChance: 1, crystalChance: 0.5, crystalDiamonds: 3, respawnMs: 300_000, boss: true },

  // Pântano (nível 15 a 35)
  spikyBlob: { kind: "spikyBlob", name: "Gosma Espinhenta", hp: 230, xp: 105, armor: 4, maxHit: 50, attackMs: 1900, stepMs: 500, aggroRange: 5, gold: [5, 22], chestChance: 0.06, crystalChance: 0.002, crystalDiamonds: 1, respawnMs: 25_000 },
  frog: { kind: "frog", name: "Sapo Gigante", hp: 330, xp: 150, armor: 6, maxHit: 64, attackMs: 2000, stepMs: 380, aggroRange: 6, gold: [8, 30], chestChance: 0.07, crystalChance: 0.003, crystalDiamonds: 1, respawnMs: 30_000 },
  glub: { kind: "glub", name: "Glub do Brejo", hp: 420, xp: 200, armor: 8, maxHit: 78, attackMs: 2100, stepMs: 420, aggroRange: 7, gold: [12, 40], chestChance: 0.08, crystalChance: 0.004, crystalDiamonds: 1, respawnMs: 35_000 },
  frogKing: { kind: "frogKing", name: "Sapo Rei", hp: 3200, xp: 2600, armor: 14, maxHit: 130, attackMs: 2200, stepMs: 420, aggroRange: 9, gold: [200, 500], chestChance: 1, crystalChance: 0.55, crystalDiamonds: 3, respawnMs: 300_000, boss: true },

  // Deserto (nível 25 a 50)
  cactus: { kind: "cactus", name: "Cactinho", hp: 330, xp: 145, armor: 8, maxHit: 60, attackMs: 2000, stepMs: 520, aggroRange: 5, gold: [8, 30], chestChance: 0.07, crystalChance: 0.003, crystalDiamonds: 1, respawnMs: 30_000 },
  wasp: { kind: "wasp", name: "Vespa Gigante", hp: 360, xp: 170, armor: 5, maxHit: 80, attackMs: 1600, stepMs: 300, aggroRange: 8, gold: [10, 34], chestChance: 0.07, crystalChance: 0.004, crystalDiamonds: 1, respawnMs: 30_000 },
  raptor: { kind: "raptor", name: "Raptor", hp: 480, xp: 230, armor: 8, maxHit: 92, attackMs: 1800, stepMs: 280, aggroRange: 8, gold: [14, 48], chestChance: 0.09, crystalChance: 0.005, crystalDiamonds: 1, respawnMs: 35_000 },
  cactusWarrior: { kind: "cactusWarrior", name: "Cacto Guerreiro", hp: 600, xp: 300, armor: 12, maxHit: 104, attackMs: 2200, stepMs: 420, aggroRange: 6, gold: [18, 60], chestChance: 0.1, crystalChance: 0.006, crystalDiamonds: 1, respawnMs: 40_000 },
  raptorAlpha: { kind: "raptorAlpha", name: "Raptor Alfa", hp: 5200, xp: 4400, armor: 18, maxHit: 170, attackMs: 1900, stepMs: 300, aggroRange: 10, gold: [300, 800], chestChance: 1, crystalChance: 0.6, crystalDiamonds: 4, respawnMs: 360_000, boss: true },

  // Montanhas Geladas (nível 35 a 65)
  yetiCub: { kind: "yetiCub", name: "Yeti Filhote", hp: 520, xp: 240, armor: 9, maxHit: 90, attackMs: 2000, stepMs: 460, aggroRange: 6, gold: [15, 50], chestChance: 0.09, crystalChance: 0.005, crystalDiamonds: 1, respawnMs: 35_000 },
  iceSpirit: { kind: "iceSpirit", name: "Espírito do Gelo", hp: 560, xp: 290, armor: 7, maxHit: 118, attackMs: 1800, stepMs: 340, aggroRange: 8, gold: [16, 56], chestChance: 0.09, crystalChance: 0.007, crystalDiamonds: 1, respawnMs: 35_000 },
  bison: { kind: "bison", name: "Bisão das Neves", hp: 800, xp: 380, armor: 14, maxHit: 120, attackMs: 2300, stepMs: 360, aggroRange: 6, gold: [22, 70], chestChance: 0.1, crystalChance: 0.007, crystalDiamonds: 1, respawnMs: 45_000 },
  yetiElder: { kind: "yetiElder", name: "Yeti Ancião", hp: 7600, xp: 6800, armor: 22, maxHit: 210, attackMs: 2300, stepMs: 400, aggroRange: 10, gold: [400, 1000], chestChance: 1, crystalChance: 0.7, crystalDiamonds: 5, respawnMs: 420_000, boss: true },

  // Cripta (nível 45 a 80)
  skeleton: { kind: "skeleton", name: "Esqueleto", hp: 680, xp: 330, armor: 12, maxHit: 112, attackMs: 1900, stepMs: 360, aggroRange: 7, gold: [20, 64], chestChance: 0.1, crystalChance: 0.007, crystalDiamonds: 1, respawnMs: 35_000 },
  ghostSkull: { kind: "ghostSkull", name: "Caveira Assombrada", hp: 640, xp: 360, armor: 6, maxHit: 140, attackMs: 1700, stepMs: 320, aggroRange: 9, gold: [20, 66], chestChance: 0.1, crystalChance: 0.009, crystalDiamonds: 1, respawnMs: 40_000 },
  skeletonMage: { kind: "skeletonMage", name: "Esqueleto Mago", hp: 760, xp: 420, armor: 10, maxHit: 150, attackMs: 2000, stepMs: 380, aggroRange: 9, gold: [24, 76], chestChance: 0.11, crystalChance: 0.01, crystalDiamonds: 1, respawnMs: 40_000 },
  necroLord: { kind: "necroLord", name: "Lorde Necromante", hp: 11000, xp: 10500, armor: 26, maxHit: 260, attackMs: 2100, stepMs: 400, aggroRange: 11, gold: [600, 1500], chestChance: 1, crystalChance: 0.8, crystalDiamonds: 7, respawnMs: 480_000, boss: true },

  // Vulcão (nível 60 a 120)
  imp: { kind: "imp", name: "Diabrete", hp: 820, xp: 460, armor: 10, maxHit: 160, attackMs: 1600, stepMs: 300, aggroRange: 9, gold: [26, 84], chestChance: 0.11, crystalChance: 0.01, crystalDiamonds: 1, respawnMs: 40_000 },
  blueDemon: { kind: "blueDemon", name: "Demônio Azul", hp: 1200, xp: 640, armor: 16, maxHit: 185, attackMs: 2200, stepMs: 420, aggroRange: 8, gold: [36, 110], chestChance: 0.12, crystalChance: 0.012, crystalDiamonds: 2, respawnMs: 50_000 },
  dragon: { kind: "dragon", name: "Dragão Ancião", hp: 18000, xp: 18000, armor: 30, maxHit: 320, attackMs: 2400, stepMs: 420, aggroRange: 12, gold: [900, 2200], chestChance: 1, crystalChance: 1, crystalDiamonds: 10, respawnMs: 600_000, boss: true, special: { name: "Sopro de Fogo", kind: "wave", element: "fire", range: 5, power: 300, cooldownMs: 6000 } },

  // Covil dos Dragões (nível 70 a 100): baforadas de fogo e gelo
  dragonGreen: { kind: "dragonGreen", name: "Dragão Verde", hp: 1600, xp: 800, armor: 18, maxHit: 230, attackMs: 2000, stepMs: 380, aggroRange: 9, gold: [40, 130], chestChance: 0.12, crystalChance: 0.014, crystalDiamonds: 2, respawnMs: 45_000, special: { name: "Baforada", kind: "wave", element: "fire", range: 4, power: 200, cooldownMs: 7000 } },
  dragonIce: { kind: "dragonIce", name: "Dragão de Gelo", hp: 1900, xp: 950, armor: 20, maxHit: 240, attackMs: 2100, stepMs: 400, aggroRange: 9, gold: [45, 145], chestChance: 0.13, crystalChance: 0.016, crystalDiamonds: 2, respawnMs: 50_000, special: { name: "Nevasca", kind: "blast", element: "ice", range: 5, radius: 1, power: 210, cooldownMs: 8000 } },
  dragonRed: { kind: "dragonRed", name: "Dragão Vermelho", hp: 2400, xp: 1200, armor: 24, maxHit: 270, attackMs: 2200, stepMs: 400, aggroRange: 10, gold: [60, 180], chestChance: 0.15, crystalChance: 0.02, crystalDiamonds: 2, respawnMs: 55_000, special: { name: "Chamas do Dragão", kind: "wave", element: "fire", range: 5, power: 260, cooldownMs: 6500 } },
  dragonLord: { kind: "dragonLord", name: "Senhor dos Dragões", hp: 30000, xp: 25000, armor: 36, maxHit: 450, attackMs: 2300, stepMs: 400, aggroRange: 13, gold: [1500, 3500], chestChance: 1, crystalChance: 1, crystalDiamonds: 14, respawnMs: 720_000, boss: true, special: { name: "Fúria do Senhor dos Dragões", kind: "wave", element: "fire", range: 7, power: 380, cooldownMs: 5000 } },

  // Abismo Demoníaco (nível 85 a 120): demônios e bestas
  hellfire: { kind: "hellfire", name: "Demônio Infernal", hp: 2600, xp: 1400, armor: 26, maxHit: 280, attackMs: 2100, stepMs: 380, aggroRange: 10, gold: [70, 200], chestChance: 0.15, crystalChance: 0.02, crystalDiamonds: 2, respawnMs: 55_000, special: { name: "Bola de Fogo Infernal", kind: "blast", element: "fire", range: 6, radius: 2, power: 240, cooldownMs: 7000 } },
  shadowBeast: { kind: "shadowBeast", name: "Besta das Trevas", hp: 2300, xp: 1350, armor: 22, maxHit: 300, attackMs: 1700, stepMs: 300, aggroRange: 11, gold: [65, 190], chestChance: 0.14, crystalChance: 0.02, crystalDiamonds: 2, respawnMs: 50_000, special: { name: "Explosão Sombria", kind: "blast", element: "death", range: 4, radius: 1, power: 230, cooldownMs: 6000 } },
  behemoth: { kind: "behemoth", name: "Behemoth", hp: 3000, xp: 1500, armor: 30, maxHit: 320, attackMs: 2400, stepMs: 440, aggroRange: 8, gold: [80, 220], chestChance: 0.16, crystalChance: 0.022, crystalDiamonds: 3, respawnMs: 60_000, special: { name: "Pisão", kind: "area", element: "earth", range: 2, power: 250, cooldownMs: 9000 } },
  archdemon: { kind: "archdemon", name: "Arquidemônio", hp: 45000, xp: 40000, armor: 42, maxHit: 520, attackMs: 2200, stepMs: 400, aggroRange: 13, gold: [2500, 5000], chestChance: 1, crystalChance: 1, crystalDiamonds: 20, respawnMs: 900_000, boss: true, special: { name: "Tempestade do Abismo", kind: "area", element: "energy", range: 4, power: 420, cooldownMs: 6000 } },
};
