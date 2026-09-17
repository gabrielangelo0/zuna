import { MAP_H, MAP_SEED, MAP_W, TEMPLE_X, TEMPLE_Y, TOWN_RADIUS } from "./constants.ts";
import { chebyshev } from "./geometry.ts";
import { mulberry32 } from "./rng.ts";

export const Ground = {
  Grass: 0,
  GrassDark: 1,
  Dirt: 2,
  Sand: 3,
  Water: 4,
  Stone: 5,
} as const;
export type Ground = (typeof Ground)[keyof typeof Ground];

export const Obj = {
  None: 0,
  Tree: 1,
  Pine: 2,
  Rock: 3,
  Bush: 4,
  Pillar: 5,
  Flowers: 6,
} as const;
export type Obj = (typeof Obj)[keyof typeof Obj];

const BLOCKING_OBJECTS: ReadonlySet<number> = new Set([Obj.Tree, Obj.Pine, Obj.Rock, Obj.Bush, Obj.Pillar]);

export interface GameMap {
  width: number;
  height: number;
  ground: Uint8Array;
  objects: Uint8Array;
}

export function isWalkable(map: GameMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  const i = y * map.width + x;
  return map.ground[i] !== Ground.Water && !BLOCKING_OBJECTS.has(map.objects[i]);
}

function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = hash2(ix, iy, seed) + (hash2(ix + 1, iy, seed) - hash2(ix, iy, seed)) * sx;
  const bottom = hash2(ix, iy + 1, seed) + (hash2(ix + 1, iy + 1, seed) - hash2(ix, iy + 1, seed)) * sx;
  return top + (bottom - top) * sy;
}

function fbm(x: number, y: number, seed: number): number {
  return valueNoise(x, y, seed) * 0.65 + valueNoise(x * 2.1, y * 2.1, seed + 17) * 0.35;
}

/**
 * Gera o mapa de forma determinística: cliente e servidor chegam ao mesmo resultado
 * sem precisar trafegar o mapa pela rede.
 *
 * Cidade de pedra no centro, estradas em cruz, lagos a oeste e floresta ao norte
 * (norte/oeste em relação à tela isométrica).
 */
export function generateMap(seed: number = MAP_SEED): GameMap {
  const width = MAP_W;
  const height = MAP_H;
  const ground = new Uint8Array(width * height);
  const objects = new Uint8Array(width * height);
  const rng = mulberry32(seed);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const dx = x - TEMPLE_X;
      const dy = y - TEMPLE_Y;

      if (chebyshev(x, y, TEMPLE_X, TEMPLE_Y) <= TOWN_RADIUS) {
        ground[i] = Ground.Stone;
        continue;
      }

      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        ground[i] = Ground.GrassDark;
        objects[i] = Obj.Pine;
        continue;
      }

      const dist = Math.hypot(dx, dy);
      const onRoad = Math.abs(dx) <= 1 || Math.abs(dy) <= 1;
      const nearRoad = Math.abs(dx) <= 2 || Math.abs(dy) <= 2;
      const north = dx < 0 && dy < 0;
      const west = dx < 0 && dy > 0;
      const wet = fbm(x / 11, y / 11, seed) - (west ? 0.1 : 0);
      const lush = fbm(x / 8, y / 8, seed + 101) + (north ? 0.12 : 0);
      const farFromTown = dist > TOWN_RADIUS + 5;

      if (onRoad) ground[i] = Ground.Dirt;
      else if (farFromTown && wet < 0.3) ground[i] = Ground.Water;
      else if (farFromTown && wet < 0.35) ground[i] = Ground.Sand;
      else ground[i] = lush > 0.55 ? Ground.GrassDark : Ground.Grass;

      const grassy = ground[i] === Ground.Grass || ground[i] === Ground.GrassDark;
      if (grassy && !nearRoad && dist > TOWN_RADIUS + 2) {
        const forest = lush > 0.62;
        const r = rng();
        if (r < (forest ? 0.36 : 0.035)) objects[i] = north || rng() < 0.3 ? Obj.Pine : Obj.Tree;
        else if (r < (forest ? 0.41 : 0.05)) objects[i] = Obj.Bush;
        else if (r < (forest ? 0.43 : 0.065)) objects[i] = Obj.Rock;
        else if (r < (forest ? 0.46 : 0.1)) objects[i] = Obj.Flowers;
      } else if (ground[i] === Ground.Sand && rng() < 0.05) {
        objects[i] = Obj.Rock;
      }
    }
  }

  // Colunas nos cantos da praça do templo.
  const c = TOWN_RADIUS - 1;
  for (const [px, py] of [[-c, -c], [c, -c], [-c, c], [c, c]]) {
    objects[(TEMPLE_Y + py) * width + (TEMPLE_X + px)] = Obj.Pillar;
  }

  return { width, height, ground, objects };
}
