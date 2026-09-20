import {
  MAP_W,
  chebyshev,
  inSafeZone,
  isWalkable,
  mulberry32,
  type GameMap,
  type MonsterKind,
  type Point,
  type WorldDef,
} from "@zuna/shared";

export interface SpawnPoint extends Point {
  kind: MonsterKind;
}

type Quadrant = "north" | "east" | "south" | "west";

interface Zone {
  kind: MonsterKind;
  count: number;
  minDist: number;
  maxDist: number;
  quadrant?: Quadrant;
}

/** Quanto mais longe da cidade, mais perigoso. As distâncias são do mapa original (96 tiles). */
const ZONES: Zone[] = [
  { kind: "rat", count: 26, minDist: 9, maxDist: 20 },
  { kind: "snake", count: 16, minDist: 16, maxDist: 32, quadrant: "west" },
  { kind: "wolf", count: 18, minDist: 18, maxDist: 36, quadrant: "north" },
  { kind: "orc", count: 16, minDist: 22, maxDist: 44, quadrant: "east" },
  { kind: "troll", count: 12, minDist: 26, maxDist: 46, quadrant: "south" },
  { kind: "cyclops", count: 5, minDist: 42, maxDist: 70 },
];

/** Quadrante na tela isométrica: −x−y é o topo da tela (norte), +x−y a direita (leste). */
function quadrantOf(dx: number, dy: number): Quadrant {
  if (dx <= 0 && dy <= 0) return "north";
  if (dx >= 0 && dy <= 0) return "east";
  if (dx >= 0 && dy >= 0) return "south";
  return "west";
}

/** Tiles alcançáveis a pé a partir da praça, para não nascer monstro preso numa ilha. */
function reachableTiles(map: GameMap, from: Point): Uint8Array {
  const seen = new Uint8Array(map.width * map.height);
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

/** Ninhos espalhados sozinhos pelo terreno, para os mundos marcados como automáticos. */
export function generateSpawns(world: WorldDef, map: GameMap): SpawnPoint[] {
  const rng = mulberry32(world.seed + 1);
  const center = { x: world.spawnX, y: world.spawnY };
  const reachable = reachableTiles(map, center);
  const spawns: SpawnPoint[] = [];
  // Mapas menores que o original recebem menos monstros, e mais perto da cidade.
  const scale = Math.min(map.width, map.height) / MAP_W;

  for (const zone of ZONES) {
    const minDist = Math.max(world.townRadius + 2, zone.minDist * scale);
    const maxDist = Math.max(minDist + 3, zone.maxDist * scale);
    const wanted = Math.max(1, Math.round(zone.count * scale));
    const candidates: Point[] = [];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!reachable[y * map.width + x] || inSafeZone(world, x, y)) continue;
        const dx = x - center.x;
        const dy = y - center.y;
        const dist = Math.hypot(dx, dy);
        if (dist < minDist || dist > maxDist) continue;
        if (zone.quadrant && quadrantOf(dx, dy) !== zone.quadrant) continue;
        candidates.push({ x, y });
      }
    }

    let placed = 0;
    for (let attempt = 0; placed < wanted && attempt < wanted * 40 && candidates.length > 0; attempt++) {
      const candidate = candidates[Math.floor(rng() * candidates.length)];
      if (spawns.some((s) => chebyshev(s.x, s.y, candidate.x, candidate.y) < 3)) continue;
      spawns.push({ kind: zone.kind, x: candidate.x, y: candidate.y });
      placed++;
    }
  }
  return spawns;
}
