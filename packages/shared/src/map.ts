import { MAP_H, MAP_SEED, MAP_W, TEMPLE_X, TEMPLE_Y, TOWN_RADIUS } from "./constants.ts";
import { chebyshev, type Point } from "./geometry.ts";
import { mulberry32 } from "./rng.ts";

export const Ground = {
  Grass: 0,
  GrassDark: 1,
  Dirt: 2,
  Sand: 3,
  Water: 4,
  Stone: 5,
  Snow: 6,
  Lava: 7,
  /** Chão de pedra escura das masmorras. */
  Cave: 8,
  /** Cinza vulcânica. */
  Ash: 9,
  Mud: 10,
  /** Mármore polido: o piso do templo. */
  Marble: 11,
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
  DeadTree: 7,
  TwistedTree: 8,
  Mushroom: 9,
  SnowPine: 10,
  Crystal: 11,
  LavaRock: 12,
  /** Vitória-régia: fica em cima da água. */
  Lily: 13,
  Fern: 14,
  Barrel: 15,
  /** Peças do templo da praça. */
  Column: 16,
  Altar: 17,
  Brazier: 18,
  /** Mosaico do piso do templo (não atrapalha a passagem). */
  Mosaic: 19,
} as const;
export type Obj = (typeof Obj)[keyof typeof Obj];

const BLOCKING_OBJECTS: ReadonlySet<number> = new Set([
  Obj.Tree,
  Obj.Pine,
  Obj.Rock,
  Obj.Bush,
  Obj.Pillar,
  Obj.DeadTree,
  Obj.TwistedTree,
  Obj.SnowPine,
  Obj.Crystal,
  Obj.LavaRock,
  Obj.Barrel,
  Obj.Column,
  Obj.Altar,
  Obj.Brazier,
]);

/** Chão onde ninguém pisa. */
const BLOCKING_GROUND: ReadonlySet<number> = new Set([Ground.Water, Ground.Lava]);

export interface GameMap {
  width: number;
  height: number;
  ground: Uint8Array;
  objects: Uint8Array;
}

/** Jeitos de gerar o terreno de um mundo. O painel escolhe um ao criar o mapa. */
export type MapStyle =
  | "campina"
  | "caverna"
  | "ilha"
  | "vazio"
  | "floresta"
  | "pantano"
  | "deserto"
  | "neve"
  | "cripta"
  | "esgoto"
  | "montanha"
  | "vulcao"
  | "covil"
  | "abismo";

export const MAP_STYLES: readonly { id: MapStyle; name: string; description: string }[] = [
  { id: "campina", name: "Campina", description: "Cidade de pedra, estradas em cruz, lagos e floresta." },
  { id: "floresta", name: "Floresta Sombria", description: "Mata fechada, árvores retorcidas, trilhas e cogumelos." },
  { id: "pantano", name: "Pântano", description: "Lama, poças, vitórias-régias e árvores mortas." },
  { id: "deserto", name: "Deserto", description: "Dunas, oásis, rochas e ruínas de colunas." },
  { id: "neve", name: "Montanhas Geladas", description: "Neve, pinheiros brancos, lagos e cristais." },
  { id: "cripta", name: "Cripta", description: "Salões escuros, corredores de rocha e cristais." },
  { id: "esgoto", name: "Esgoto", description: "Canais de água, passarelas de pedra, lama e cogumelos." },
  { id: "montanha", name: "Montanha", description: "Platôs de rocha subindo, neve no alto e penhascos." },
  { id: "vulcao", name: "Vulcão", description: "Cinza, rios de lava e rochas queimadas." },
  { id: "covil", name: "Covil dos Dragões", description: "Cânions de rocha, poças de lava e cristais nas paredes." },
  { id: "abismo", name: "Abismo", description: "Pedra escura rachada de lava, cristais e árvores retorcidas." },
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
  return !BLOCKING_GROUND.has(map.ground[i]) && !BLOCKING_OBJECTS.has(map.objects[i]);
}

/**
 * Tiles alcançáveis a pé desde um ponto, em quatro direções. Serve para não nascer monstro
 * preso numa ilha, e para o teste que garante que um mundo novo não tranca jogador num bolsão.
 */
export function reachableTiles(map: GameMap, from: Point): Uint8Array {
  const seen = new Uint8Array(map.width * map.height);
  // A versão antiga marcava a origem sem conferir, e devolvia 1 num tile de parede.
  if (!isWalkable(map, from.x, from.y)) return seen;
  const start = from.y * map.width + from.x;
  const queue = [start];
  seen[start] = 1;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    const x = index % map.width;
    const y = (index - x) / map.width;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isWalkable(map, nx, ny)) continue;
      const next = ny * map.width + nx;
      if (seen[next]) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return seen;
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
  else if (shape.style === "floresta") paintForest(map, shape, rng);
  else if (shape.style === "pantano") paintSwamp(map, shape, rng);
  else if (shape.style === "deserto") paintDesert(map, shape, rng);
  else if (shape.style === "neve") paintSnow(map, shape, rng);
  else if (shape.style === "cripta") paintCrypt(map, shape, rng);
  else if (shape.style === "esgoto") paintSewer(map, shape, rng);
  else if (shape.style === "montanha") paintMountain(map, shape, rng);
  else if (shape.style === "vulcao") paintVolcano(map, shape, rng);
  else if (shape.style === "covil") paintLair(map, shape, rng);
  else if (shape.style === "abismo") paintAbyss(map, shape, rng);
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

  // Bandeiras nos cantos da praça.
  const c = Math.max(1, townRadius - 1);
  for (const [px, py] of [[-c, -c], [c, -c], [-c, c], [c, c]]) {
    const x = spawnX + px;
    const y = spawnY + py;
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
    map.objects[y * map.width + x] = Obj.Pillar;
  }

  templeAt(map, shape);
}

/**
 * O templo no meio da praça: piso de mármore, degrau de granito em volta, quatro colunas
 * nos cantos, o altar do Cristal ao norte e dois braseiros na entrada. O centro (onde o
 * jogador nasce) e as quatro saídas ficam livres.
 */
function templeAt(map: GameMap, shape: MapShape) {
  const { spawnX, spawnY, townRadius } = shape;
  if (townRadius < 4) return;
  const put = (dx: number, dy: number, ground: Ground, object?: Obj) => {
    const x = spawnX + dx;
    const y = spawnY + dy;
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
    const i = y * map.width + x;
    map.ground[i] = ground;
    if (object !== undefined) map.objects[i] = object;
  };

  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const edge = Math.max(Math.abs(dx), Math.abs(dy)) === 3;
      put(dx, dy, edge ? Ground.Stone : Ground.Marble, Obj.None);
    }
  }
  for (const [dx, dy] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) put(dx, dy, Ground.Marble, Obj.Column);
  put(0, -2, Ground.Marble, Obj.Altar);
  // Os braseiros ficam na entrada, no degrau: dentro do templo eles tapariam o mosaico.
  // Na tela isométrica o par simétrico é (a, b) e (b, a) — é isso que deixa um de cada lado.
  for (const [dx, dy] of [[-2, 3], [3, -2]]) put(dx, dy, Ground.Stone, Obj.Brazier);
  put(0, 0, Ground.Marble, Obj.Mosaic);
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

// ---------------------------------------------------------------- mundos temáticos
// Todos seguem a mesma receita: um chão base com manchas de ruído, o que bloqueia
// (água, lava, paredes), a vegetação, quatro estradas sinuosas saindo da praça até
// a borda (para o mapa inteiro ficar alcançável) e a cerca em volta.

interface Painter {
  map: GameMap;
  shape: MapShape;
  rng: () => number;
}

function each(map: GameMap, draw: (x: number, y: number, i: number) => void) {
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) draw(x, y, y * map.width + x);
}

/** Distância até a praça, para deixar a volta da cidade mais limpa. */
function fromPlaza(shape: MapShape, x: number, y: number): number {
  return Math.hypot(x - shape.spawnX, y - shape.spawnY);
}

/**
 * Estradas sinuosas da praça até a borda, nas quatro direções. Passam por cima de água
 * e lava (viram ponte do próprio chão da estrada) e tiram o que estiver no caminho.
 */
function carveRoads({ map, shape }: Painter, road: Ground, width = 1) {
  const { spawnX, spawnY, seed } = shape;
  const directions: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  directions.forEach(([dx, dy], index) => {
    let x = spawnX;
    let y = spawnY;
    for (let step = 0; step < Math.max(map.width, map.height); step++) {
      // Balança para os lados conforme anda, como uma trilha de verdade.
      const sway = Math.round(Math.sin(step / 7 + seed * 0.001 + index * 1.7) * 2.4 + Math.sin(step / 3.1 + index) * 0.8);
      const cx = x + (dy !== 0 ? sway : 0);
      const cy = y + (dx !== 0 ? sway : 0);
      if (cx < 1 || cy < 1 || cx >= map.width - 1 || cy >= map.height - 1) break;
      for (let oy = -width; oy <= width; oy++) {
        for (let ox = -width; ox <= width; ox++) {
          const tx = cx + ox;
          const ty = cy + oy;
          if (tx < 1 || ty < 1 || tx >= map.width - 1 || ty >= map.height - 1) continue;
          if (Math.abs(ox) + Math.abs(oy) > width + 1) continue;
          const i = ty * map.width + tx;
          if (chebyshev(tx, ty, spawnX, spawnY) <= shape.townRadius) continue;
          map.ground[i] = road;
          map.objects[i] = Obj.None;
        }
      }
      x += dx;
      y += dy;
    }
  });
}

/** Clareiras espalhadas: quebram a mata fechada em salas, como nos mapas feitos à mão. */
function clearings({ map, shape, rng }: Painter, count: number, ground: Ground | null) {
  for (let n = 0; n < count; n++) {
    const cx = Math.floor(rng() * map.width);
    const cy = Math.floor(rng() * map.height);
    if (fromPlaza(shape, cx, cy) < shape.townRadius + 6) continue;
    const radius = 3 + rng() * 4;
    for (let y = Math.floor(cy - radius); y <= cy + radius; y++) {
      for (let x = Math.floor(cx - radius); x <= cx + radius; x++) {
        if (x < 1 || y < 1 || x >= map.width - 1 || y >= map.height - 1) continue;
        if (Math.hypot(x - cx, (y - cy) * 1.1) > radius) continue;
        const i = y * map.width + x;
        if (BLOCKING_GROUND.has(map.ground[i])) continue;
        if (BLOCKING_OBJECTS.has(map.objects[i])) map.objects[i] = Obj.None;
        if (ground !== null) map.ground[i] = ground;
      }
    }
  }
}

/** Floresta Sombria: mata fechada de árvores retorcidas, lagos escuros, trilhas e cogumelos. */
function paintForest(map: GameMap, shape: MapShape, rng: () => number) {
  const painter = { map, shape, rng };
  const { seed } = shape;
  each(map, (x, y, i) => {
    const lush = fbm(x / 9, y / 9, seed + 11);
    const wet = fbm(x / 13, y / 13, seed + 29);
    const near = fromPlaza(shape, x, y) < shape.townRadius + 3;
    map.ground[i] = lush > 0.34 ? Ground.GrassDark : Ground.Grass;
    if (!near && wet < 0.25) {
      map.ground[i] = Ground.Water;
      return;
    }
    if (!near && wet < 0.29) map.ground[i] = Ground.Mud;
    if (near) return;

    const r = rng();
    const dense = lush > 0.5;
    if (r < (dense ? 0.3 : 0.1)) map.objects[i] = rng() < 0.65 ? Obj.TwistedTree : Obj.Pine;
    else if (r < (dense ? 0.34 : 0.13)) map.objects[i] = Obj.Bush;
    else if (r < (dense ? 0.4 : 0.17)) map.objects[i] = Obj.Fern;
    else if (r < (dense ? 0.43 : 0.2)) map.objects[i] = Obj.Mushroom;
    else if (r < 0.215) map.objects[i] = Obj.Rock;
  });
  clearings(painter, Math.round((map.width * map.height) / 700), null);
  carveRoads(painter, Ground.Dirt);
  fence(map, Ground.GrassDark, Obj.TwistedTree);
  clearPlaza(map, shape);
}

/** Pântano: lama e poças por toda parte, vitórias-régias, árvores mortas e cogumelos. */
function paintSwamp(map: GameMap, shape: MapShape, rng: () => number) {
  const painter = { map, shape, rng };
  const { seed } = shape;
  each(map, (x, y, i) => {
    const wet = fbm(x / 7, y / 7, seed + 5);
    const moss = fbm(x / 10, y / 10, seed + 61);
    const near = fromPlaza(shape, x, y) < shape.townRadius + 3;
    if (!near && wet < 0.36) {
      map.ground[i] = Ground.Water;
      if (rng() < 0.12) map.objects[i] = Obj.Lily;
      return;
    }
    map.ground[i] = moss > 0.52 ? Ground.GrassDark : Ground.Mud;
    if (near) return;

    const r = rng();
    if (r < 0.06) map.objects[i] = Obj.DeadTree;
    else if (r < 0.1) map.objects[i] = Obj.TwistedTree;
    else if (r < 0.16) map.objects[i] = Obj.Fern;
    else if (r < 0.21) map.objects[i] = Obj.Mushroom;
    else if (r < 0.23) map.objects[i] = Obj.Bush;
  });
  clearings(painter, Math.round((map.width * map.height) / 900), null);
  carveRoads(painter, Ground.Dirt);
  fence(map, Ground.Mud, Obj.DeadTree);
  clearPlaza(map, shape);
}

/** Deserto: dunas de areia, trechos de terra batida, oásis, rochas e ruínas de colunas. */
function paintDesert(map: GameMap, shape: MapShape, rng: () => number) {
  const painter = { map, shape, rng };
  const { seed } = shape;
  each(map, (x, y, i) => {
    const dune = fbm(x / 12, y / 12, seed + 3);
    const oasis = fbm(x / 16, y / 16, seed + 71);
    const near = fromPlaza(shape, x, y) < shape.townRadius + 3;
    map.ground[i] = dune > 0.6 ? Ground.Dirt : Ground.Sand;
    if (!near && oasis > 0.74) {
      map.ground[i] = Ground.Water;
      return;
    }
    if (!near && oasis > 0.68) {
      map.ground[i] = Ground.Grass;
      if (rng() < 0.25) map.objects[i] = rng() < 0.5 ? Obj.Fern : Obj.Bush;
      return;
    }
    if (near) return;
    const r = rng();
    if (r < 0.025) map.objects[i] = Obj.Rock;
    else if (r < 0.04) map.objects[i] = Obj.DeadTree;
  });

  // Ruínas: quadrados de pedra com rochas nos cantos, espalhados longe da praça.
  const ruins = Math.round((map.width * map.height) / 1500);
  for (let n = 0; n < ruins; n++) {
    const cx = 4 + Math.floor(rng() * (map.width - 8));
    const cy = 4 + Math.floor(rng() * (map.height - 8));
    if (fromPlaza(shape, cx, cy) < shape.townRadius + 8) continue;
    const half = 2 + Math.floor(rng() * 2);
    for (let y = cy - half; y <= cy + half; y++) {
      for (let x = cx - half; x <= cx + half; x++) {
        const i = y * map.width + x;
        map.ground[i] = rng() < 0.85 ? Ground.Stone : Ground.Sand;
        map.objects[i] = Obj.None;
      }
    }
    for (const [px, py] of [[-half, -half], [half, -half], [-half, half], [half, half]]) {
      if (rng() < 0.8) map.objects[(cy + py) * map.width + cx + px] = Obj.Rock;
    }
  }
  carveRoads(painter, Ground.Dirt);
  fence(map, Ground.Sand, Obj.Rock);
  clearPlaza(map, shape);
}

/** Montanhas Geladas: neve, afloramentos de pedra, lagos, pinheiros brancos e cristais. */
function paintSnow(map: GameMap, shape: MapShape, rng: () => number) {
  const painter = { map, shape, rng };
  const { seed } = shape;
  each(map, (x, y, i) => {
    const rock = fbm(x / 10, y / 10, seed + 17);
    const lake = fbm(x / 14, y / 14, seed + 43);
    const near = fromPlaza(shape, x, y) < shape.townRadius + 3;
    map.ground[i] = rock > 0.62 ? Ground.Stone : Ground.Snow;
    if (!near && lake < 0.24) {
      map.ground[i] = Ground.Water;
      return;
    }
    if (near) return;
    const forest = fbm(x / 8, y / 8, seed + 97) > 0.55;
    const r = rng();
    if (map.ground[i] === Ground.Stone) {
      if (r < 0.18) map.objects[i] = Obj.Rock;
      else if (r < 0.2) map.objects[i] = Obj.Crystal;
      return;
    }
    if (r < (forest ? 0.3 : 0.05)) map.objects[i] = Obj.SnowPine;
    else if (r < (forest ? 0.32 : 0.065)) map.objects[i] = Obj.Rock;
  });
  clearings(painter, Math.round((map.width * map.height) / 900), null);
  carveRoads(painter, Ground.Stone);
  fence(map, Ground.Snow, Obj.SnowPine);
  clearPlaza(map, shape);
}

/** Cripta: salões escuros ligados por corredores, paredes de rocha e cristais que brilham. */
function paintCrypt(map: GameMap, shape: MapShape, rng: () => number) {
  const painter = { map, shape, rng };
  const { seed } = shape;
  each(map, (x, y, i) => {
    const wall = fbm(x / 7, y / 7, seed + 7);
    const near = fromPlaza(shape, x, y) < shape.townRadius + 3;
    map.ground[i] = Ground.Cave;
    if (near) return;
    if (wall > 0.62) {
      map.objects[i] = rng() < 0.82 ? Obj.Rock : Obj.Crystal;
      return;
    }
    if (wall < 0.24 && rng() < 0.5) {
      map.ground[i] = Ground.Water;
      return;
    }
    const r = rng();
    if (r < 0.025) map.objects[i] = Obj.Crystal;
    else if (r < 0.035) map.objects[i] = Obj.Barrel;
  });
  clearings(painter, Math.round((map.width * map.height) / 600), null);
  carveRoads(painter, Ground.Cave);
  fence(map, Ground.Cave, Obj.Rock);
  clearPlaza(map, shape);
}

/**
 * Esgoto: canais de água em grade, passarelas de pedra nas margens, lama nos cantos sujos.
 * Os canais levam travessia (`cruza`) de propósito: `clearings` não abre água (ele pula chão
 * bloqueante) e só as quatro estradas atravessam, então uma grade sem travessia cortaria o
 * mapa em bolsões e quem descesse ficaria preso entre dois canais.
 */
function paintSewer(map: GameMap, shape: MapShape, rng: () => number) {
  const painter = { map, shape, rng };
  const { seed } = shape;
  each(map, (x, y, i) => {
    map.ground[i] = Ground.Stone;
    if (fromPlaza(shape, x, y) < shape.townRadius + 3) return;
    // A grade anda com o ruído, senão o esgoto vira papel quadriculado.
    const drift = fbm(x / 16, y / 16, seed + 5) * 4;
    const canal = Math.abs(((x + drift) % 9) - 4.5) < 1.2 || Math.abs(((y + drift) % 9) - 4.5) < 1.2;
    // 0,46 é medido, não escolhido: 0,58 dava 71% de alcançabilidade (bolsões) e 0,38 dava
    // 99,9% abrindo tanta travessia que o canal desaparecia. Mexer aqui exige medir de novo.
    const cruza = fbm(x / 4.5, y / 4.5, seed + 131) > 0.46;
    if (canal && !cruza) {
      map.ground[i] = Ground.Water;
      return;
    }
    const grime = fbm(x / 6, y / 6, seed + 61);
    if (grime > 0.6) map.ground[i] = Ground.Mud;
    const r = rng();
    // Tijolo e abóbada não existem na paleta: coluna e rocha fazem o papel de parede.
    if (grime > 0.72 && r < 0.3) map.objects[i] = r < 0.18 ? Obj.Pillar : Obj.Rock;
    else if (r < 0.03) map.objects[i] = Obj.Mushroom;
    else if (r < 0.042) map.objects[i] = Obj.Barrel;
  });
  clearings(painter, Math.round((map.width * map.height) / 700), Ground.Stone);
  carveRoads(painter, Ground.Stone);
  fence(map, Ground.Stone, Obj.Rock);
  clearPlaza(map, shape);
}

/**
 * Montanha: a altitude sobe conforme afasta da praça, então terra vira pedra e pedra vira
 * neve. Os penhascos são linhas finas de rocha de propósito — paredão largo fecharia platô e
 * deixaria jogador sem rota.
 */
function paintMountain(map: GameMap, shape: MapShape, rng: () => number) {
  const painter = { map, shape, rng };
  const { seed } = shape;
  const alcance = Math.max(map.width, map.height) * 0.42;
  each(map, (x, y, i) => {
    const subida = Math.min(1, fromPlaza(shape, x, y) / alcance);
    const altura = subida * 0.75 + fbm(x / 13, y / 13, seed + 29) * 0.45;
    map.ground[i] = altura > 0.72 ? Ground.Snow : altura > 0.38 ? Ground.Stone : Ground.Dirt;
    if (fromPlaza(shape, x, y) < shape.townRadius + 3) return;
    // 0,032 é medido: 0,055 fechava platô e dava 72% de alcançabilidade. Mexer exige medir.
    if (Math.abs(fbm(x / 9, y / 9, seed + 53) - 0.5) < 0.032) {
      map.objects[i] = Obj.Rock;
      return;
    }
    const r = rng();
    if (map.ground[i] === Ground.Snow) {
      if (r < 0.1) map.objects[i] = Obj.SnowPine;
      else if (r < 0.125) map.objects[i] = Obj.Crystal;
      return;
    }
    if (map.ground[i] === Ground.Stone) {
      if (r < 0.08) map.objects[i] = Obj.Rock;
      else if (r < 0.095) map.objects[i] = Obj.Crystal;
      return;
    }
    if (r < 0.16) map.objects[i] = Obj.Pine;
    else if (r < 0.19) map.objects[i] = Obj.Fern;
  });
  clearings(painter, Math.round((map.width * map.height) / 800), null);
  carveRoads(painter, Ground.Dirt);
  fence(map, Ground.Stone, Obj.Rock);
  clearPlaza(map, shape);
}

/** Covil dos Dragões: cânions de pedra com paredões de rocha, lama queimada, poças de lava e cristais. */
function paintLair(map: GameMap, shape: MapShape, rng: () => number) {
  const painter = { map, shape, rng };
  const { seed } = shape;
  each(map, (x, y, i) => {
    const ridge = Math.abs(fbm(x / 11, y / 11, seed + 23) - 0.5);
    const floor = fbm(x / 8, y / 8, seed + 71);
    const pool = fbm(x / 7, y / 7, seed + 97);
    const near = fromPlaza(shape, x, y) < shape.townRadius + 4;
    map.ground[i] = floor > 0.55 ? Ground.Mud : Ground.Cave;
    if (near) return;
    if (ridge < 0.05) {
      map.objects[i] = rng() < 0.85 ? Obj.Rock : Obj.Crystal;
      return;
    }
    if (pool > 0.76) {
      map.ground[i] = Ground.Lava;
      return;
    }
    const r = rng();
    if (r < 0.05) map.objects[i] = Obj.LavaRock;
    else if (r < 0.065) map.objects[i] = Obj.Crystal;
    else if (r < 0.075) map.objects[i] = Obj.DeadTree;
  });
  clearings(painter, Math.round((map.width * map.height) / 800), null);
  carveRoads(painter, Ground.Ash);
  fence(map, Ground.Cave, Obj.Rock);
  clearPlaza(map, shape);
}

/** Abismo: pedra escura rachada por veios de lava, cristais e árvores retorcidas. */
function paintAbyss(map: GameMap, shape: MapShape, rng: () => number) {
  const painter = { map, shape, rng };
  const { seed } = shape;
  each(map, (x, y, i) => {
    const crack = Math.abs(fbm(x / 9, y / 9, seed + 41) - 0.5);
    const glow = fbm(x / 5, y / 5, seed + 13);
    const near = fromPlaza(shape, x, y) < shape.townRadius + 4;
    map.ground[i] = glow > 0.62 ? Ground.Ash : Ground.Cave;
    if (!near && crack < 0.045) {
      map.ground[i] = Ground.Lava;
      return;
    }
    if (near) return;
    const r = rng();
    if (r < 0.035) map.objects[i] = Obj.Crystal;
    else if (r < 0.06) map.objects[i] = Obj.TwistedTree;
    else if (r < 0.085) map.objects[i] = Obj.LavaRock;
  });
  clearings(painter, Math.round((map.width * map.height) / 800), null);
  carveRoads(painter, Ground.Cave);
  fence(map, Ground.Cave, Obj.Crystal);
  clearPlaza(map, shape);
}

/** Vulcão: cinza, rios e lagos de lava, rochas queimadas e árvores mortas. */
function paintVolcano(map: GameMap, shape: MapShape, rng: () => number) {
  const painter = { map, shape, rng };
  const { seed } = shape;
  each(map, (x, y, i) => {
    const river = Math.abs(fbm(x / 14, y / 14, seed + 19) - 0.5);
    const pool = fbm(x / 9, y / 9, seed + 53);
    const crust = fbm(x / 6, y / 6, seed + 31);
    const near = fromPlaza(shape, x, y) < shape.townRadius + 4;
    map.ground[i] = crust > 0.6 ? Ground.Cave : Ground.Ash;
    if (!near && (river < 0.03 || pool > 0.73)) {
      map.ground[i] = Ground.Lava;
      return;
    }
    if (near) return;
    const r = rng();
    if (r < 0.06) map.objects[i] = Obj.LavaRock;
    else if (r < 0.085) map.objects[i] = Obj.DeadTree;
    else if (r < 0.09) map.objects[i] = Obj.Crystal;
  });
  clearings(painter, Math.round((map.width * map.height) / 900), null);
  carveRoads(painter, Ground.Cave);
  fence(map, Ground.Ash, Obj.LavaRock);
  clearPlaza(map, shape);
}
