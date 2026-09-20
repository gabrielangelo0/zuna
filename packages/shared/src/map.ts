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

/** Jeitos de gerar o terreno de um mundo. O painel escolhe um ao criar o mapa. */
export type MapStyle = "campina" | "caverna" | "ilha" | "vazio";

export const MAP_STYLES: readonly { id: MapStyle; name: string; description: string }[] = [
  { id: "campina", name: "Campina", description: "Cidade de pedra, estradas em cruz, lagos e floresta." },
  { id: "caverna", name: "Caverna", description: "Salões de pedra, veios de terra e paredes de rocha." },
  { id: "ilha", name: "Ilha", description: "Praia em volta, mata no meio, mar até a borda." },
  { id: "vazio", name: "Vazio", description: "Campo liso com uma praça no centro, para desenhar à mão." },
];

/** Tudo de que o gerador precisa para desenhar o terreno de um mundo. */
export interface MapShape {
  width: number;
  height: number;
  seed: number;
  style: MapStyle;
  /** Centro do mundo: praça, ponto de nascimento e de volta à vida. */
  spawnX: number;
  spawnY: number;
  /** Raio (Chebyshev) da zona protegida em volta do centro. */
  townRadius: number;
}

export const DEFAULT_SHAPE: MapShape = {
  width: MAP_W,
  height: MAP_H,
  seed: MAP_SEED,
  style: "campina",
  spawnX: TEMPLE_X,
  spawnY: TEMPLE_Y,
  townRadius: TOWN_RADIUS,
};

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
 * sem precisar trafegar o mapa pela rede. O que foi pintado no painel vem por cima.
 */
export function generateMap(shape: MapShape = DEFAULT_SHAPE): GameMap {
  const { width, height } = shape;
  const map: GameMap = { width, height, ground: new Uint8Array(width * height), objects: new Uint8Array(width * height) };
  const rng = mulberry32(shape.seed);

  if (shape.style === "caverna") paintCave(map, shape, rng);
  else if (shape.style === "ilha") paintIsland(map, shape, rng);
  else if (shape.style === "vazio") paintEmpty(map, shape);
  else paintMeadow(map, shape, rng);

  return map;
}

/** Praça de pedra no centro, sem nada no caminho: vale para todos os estilos. */
function clearPlaza(map: GameMap, shape: MapShape) {
  const { spawnX, spawnY, townRadius } = shape;
  for (let y = spawnY - townRadius; y <= spawnY + townRadius; y++) {
    for (let x = spawnX - townRadius; x <= spawnX + townRadius; x++) {
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      const i = y * map.width + x;
      map.ground[i] = Ground.Stone;
      map.objects[i] = Obj.None;
    }
  }

  // Colunas nos cantos da praça.
  const c = Math.max(1, townRadius - 1);
  for (const [px, py] of [[-c, -c], [c, -c], [-c, c], [c, c]]) {
    const x = spawnX + px;
    const y = spawnY + py;
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
    map.objects[y * map.width + x] = Obj.Pillar;
  }
}

/** Cerca na borda, para ninguém andar até o fim do mundo. */
function fence(map: GameMap, ground: Ground, object: Obj) {
  const { width, height } = map;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue;
      const i = y * width + x;
      map.ground[i] = ground;
      map.objects[i] = object;
    }
  }
}

/** O mundo clássico do Zuna: cidade no centro, estradas em cruz, lagos e floresta. */
function paintMeadow(map: GameMap, shape: MapShape, rng: () => number) {
  const { width, height, seed, spawnX, spawnY, townRadius } = shape;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const dx = x - spawnX;
      const dy = y - spawnY;
      if (chebyshev(x, y, spawnX, spawnY) <= townRadius) {
        map.ground[i] = Ground.Stone;
        continue;
      }

      const dist = Math.hypot(dx, dy);
      const onRoad = Math.abs(dx) <= 1 || Math.abs(dy) <= 1;
      const nearRoad = Math.abs(dx) <= 2 || Math.abs(dy) <= 2;
      const north = dx < 0 && dy < 0;
      const west = dx < 0 && dy > 0;
      const wet = fbm(x / 11, y / 11, seed) - (west ? 0.1 : 0);
      const lush = fbm(x / 8, y / 8, seed + 101) + (north ? 0.12 : 0);
      const farFromTown = dist > townRadius + 5;

      if (onRoad) map.ground[i] = Ground.Dirt;
      else if (farFromTown && wet < 0.3) map.ground[i] = Ground.Water;
      else if (farFromTown && wet < 0.35) map.ground[i] = Ground.Sand;
      else map.ground[i] = lush > 0.55 ? Ground.GrassDark : Ground.Grass;

      const grassy = map.ground[i] === Ground.Grass || map.ground[i] === Ground.GrassDark;
      if (grassy && !nearRoad && dist > townRadius + 2) {
        const forest = lush > 0.62;
        const r = rng();
        if (r < (forest ? 0.36 : 0.035)) map.objects[i] = north || rng() < 0.3 ? Obj.Pine : Obj.Tree;
        else if (r < (forest ? 0.41 : 0.05)) map.objects[i] = Obj.Bush;
        else if (r < (forest ? 0.43 : 0.065)) map.objects[i] = Obj.Rock;
        else if (r < (forest ? 0.46 : 0.1)) map.objects[i] = Obj.Flowers;
      } else if (map.ground[i] === Ground.Sand && rng() < 0.05) {
        map.objects[i] = Obj.Rock;
      }
    }
  }
  fence(map, Ground.GrassDark, Obj.Pine);
  clearPlaza(map, shape);
}

/** Caverna: salões de pedra ligados por veios de terra, com paredes de rocha. */
function paintCave(map: GameMap, shape: MapShape, rng: () => number) {
  const { width, height, seed, spawnX, spawnY, townRadius } = shape;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const dist = Math.hypot(x - spawnX, y - spawnY);
      const rock = fbm(x / 9, y / 9, seed);
      const vein = fbm(x / 6, y / 6, seed + 53);

      if (vein > 0.62) map.ground[i] = Ground.Dirt;
      else if (rock < 0.28 && dist > townRadius + 6) map.ground[i] = Ground.Water;
      else map.ground[i] = Ground.Stone;

      if (map.ground[i] === Ground.Water || dist <= townRadius + 2) continue;
      // Paredes: manchas fechadas de rocha, deixando corredores no meio.
      if (rock > 0.68) map.objects[i] = rng() < 0.75 ? Obj.Rock : Obj.Pillar;
      else if (rock > 0.64 && rng() < 0.3) map.objects[i] = Obj.Bush;
    }
  }
  fence(map, Ground.Stone, Obj.Rock);
  clearPlaza(map, shape);
}

/** Ilha: mar até a borda, praia em volta e mata no miolo. */
function paintIsland(map: GameMap, shape: MapShape, rng: () => number) {
  const { width, height, seed, spawnX, spawnY, townRadius } = shape;
  const radius = Math.min(width, height) / 2 - 3;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const dx = (x - spawnX) / radius;
      const dy = (y - spawnY) / radius;
      // A linha da praia é irregular: o ruído empurra a borda para dentro e para fora.
      const edge = Math.hypot(dx, dy) + (fbm(x / 10, y / 10, seed) - 0.5) * 0.35;

      if (edge > 1) {
        map.ground[i] = Ground.Water;
        continue;
      }
      if (edge > 0.86) {
        map.ground[i] = Ground.Sand;
        if (rng() < 0.05) map.objects[i] = Obj.Rock;
        continue;
      }

      const lush = fbm(x / 7, y / 7, seed + 91);
      map.ground[i] = lush > 0.55 ? Ground.GrassDark : Ground.Grass;
      if (Math.hypot(x - spawnX, y - spawnY) <= townRadius + 2) continue;
      const r = rng();
      if (r < 0.14) map.objects[i] = Obj.Pine;
      else if (r < 0.19) map.objects[i] = Obj.Bush;
      else if (r < 0.24) map.objects[i] = Obj.Flowers;
    }
  }
  clearPlaza(map, shape);
}

/** Campo liso: o mapa em branco, para desenhar tudo no editor. */
function paintEmpty(map: GameMap, shape: MapShape) {
  map.ground.fill(Ground.Grass);
  fence(map, Ground.GrassDark, Obj.Pine);
  clearPlaza(map, shape);
}
