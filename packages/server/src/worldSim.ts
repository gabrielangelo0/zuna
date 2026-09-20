import {
  buildWorldMap,
  chebyshev,
  inSafeZone,
  isWalkable,
  type GameMap,
  type GroundItemDef,
  type PortalDef,
  type Point,
  type SpawnDef,
  type WorldDef,
} from "@zuna/shared";
import type { WorldContent } from "./worldRepository.ts";

// Um mundo rodando: o terreno montado, quem está em cada tile, os portais,
// os ninhos de monstro e os tesouros que voltam sozinhos.

export interface WorldSim {
  def: WorldDef;
  map: GameMap;
  /** Tiles pintados à mão, do jeito que o cliente recebe. */
  tiles: number[];
  portalList: PortalDef[];
  /** Portal por tile, para saber na hora do passo. */
  portals: Map<number, PortalDef>;
  spawns: SpawnDef[];
  items: GroundItemDef[];
  /** Monstros por tile. */
  monsterAt: Map<number, string>;
  /** Quantos jogadores em cada tile. */
  playersAt: Map<number, number>;
  /** Drops no chão, por tile. */
  lootAt: Map<number, string[]>;
  /** Monstros vivos de cada ninho. */
  nestAlive: Map<number, number>;
  /** Tesouro no chão de cada ponto fixo (id do tesouro → id do drop). */
  itemLoot: Map<number, string>;
  /** Caminho de volta: id do drop → id do tesouro. */
  itemOfLoot: Map<string, number>;
  /** Quando cada tesouro volta ao chão. */
  itemReadyAt: Map<number, number>;
}

export function createSim(content: WorldContent): WorldSim {
  const sim: WorldSim = {
    def: content.world,
    map: buildWorldMap({ world: content.world, tiles: content.tiles, portals: content.portals }),
    tiles: content.tiles,
    portalList: content.portals,
    portals: new Map(),
    spawns: content.spawns,
    items: content.items,
    monsterAt: new Map(),
    playersAt: new Map(),
    lootAt: new Map(),
    nestAlive: new Map(),
    itemLoot: new Map(),
    itemOfLoot: new Map(),
    itemReadyAt: new Map(),
  };
  indexPortals(sim);
  return sim;
}

export function indexPortals(sim: WorldSim) {
  sim.portals.clear();
  for (const portal of sim.portalList) sim.portals.set(tileKey(sim, portal.x, portal.y), portal);
}

export function tileKey(sim: WorldSim, x: number, y: number): number {
  return y * sim.map.width + x;
}

export function walkable(sim: WorldSim, x: number, y: number): boolean {
  return isWalkable(sim.map, x, y);
}

/** Zona protegida da cidade: monstro não entra e a vida volta mais rápido. */
export function inSafe(sim: WorldSim, x: number, y: number): boolean {
  return inSafeZone(sim.def, x, y);
}

/** Jogadores atravessam outros jogadores, mas não monstros. */
export function blockedForPlayer(sim: WorldSim, x: number, y: number): boolean {
  return !walkable(sim, x, y) || sim.monsterAt.has(tileKey(sim, x, y));
}

/** Monstros não entram na cidade nem em tiles ocupados. */
export function blockedForMonster(sim: WorldSim, x: number, y: number, selfId?: string): boolean {
  if (!walkable(sim, x, y) || inSafe(sim, x, y)) return true;
  const key = tileKey(sim, x, y);
  const occupant = sim.monsterAt.get(key);
  if (occupant !== undefined && occupant !== selfId) return true;
  return (sim.playersAt.get(key) ?? 0) > 0;
}

export function occupyPlayer(sim: WorldSim, x: number, y: number, delta: number) {
  const key = tileKey(sim, x, y);
  const count = (sim.playersAt.get(key) ?? 0) + delta;
  if (count <= 0) sim.playersAt.delete(key);
  else sim.playersAt.set(key, count);
}

export function findFreeTile(sim: WorldSim, cx: number, cy: number, forMonster: boolean, maxRadius = 6): Point | null {
  for (let radius = 0; radius <= maxRadius; radius++) {
    const candidates: Point[] = [];
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (chebyshev(x, y, cx, cy) !== radius) continue;
        const blocked = forMonster
          ? blockedForMonster(sim, x, y)
          : blockedForPlayer(sim, x, y) || sim.playersAt.has(tileKey(sim, x, y));
        if (!blocked) candidates.push({ x, y });
      }
    }
    if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)];
  }
  return null;
}

/** Tile andável e ainda sem drop, para dois drops não ficarem um em cima do outro. */
export function freeLootTile(sim: WorldSim, cx: number, cy: number): Point | null {
  for (let radius = 0; radius <= 2; radius++) {
    const candidates: Point[] = [];
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (chebyshev(x, y, cx, cy) !== radius) continue;
        if (!walkable(sim, x, y) || sim.lootAt.has(tileKey(sim, x, y))) continue;
        candidates.push({ x, y });
      }
    }
    if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)];
  }
  return null;
}

export function portalAt(sim: WorldSim, x: number, y: number): PortalDef | undefined {
  return sim.portals.get(tileKey(sim, x, y));
}

/** Ponto de nascimento do mundo. */
export function spawnPoint(sim: WorldSim): Point {
  return { x: sim.def.spawnX, y: sim.def.spawnY };
}
