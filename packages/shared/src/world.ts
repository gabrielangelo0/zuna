import { Ground, Obj, generateMap, type GameMap, type MapShape } from "./map.ts";
import { chebyshev } from "./geometry.ts";
import type { LootKind } from "./loot.ts";
import type { MonsterKind } from "./monsters.ts";

// Mundos do jogo: cada um tem seu terreno, seus portais, seus ninhos de monstro
// e seus tesouros no chão. O painel cria e edita; o servidor e o cliente leem daqui.

export const WORLD_MIN_SIZE = 32;
export const WORLD_MAX_SIZE = 160;
export const WORLD_NAME_MAX = 32;
export const PORTAL_NAME_MAX = 32;
/** Quantos ninhos, tesouros e portais cabem num mundo. */
export const WORLD_MAX_PORTALS = 80;
export const WORLD_MAX_SPAWNS = 200;
export const WORLD_MAX_ITEMS = 200;
/** Monstros que um ninho pode manter vivos ao mesmo tempo. */
export const SPAWN_MAX_AMOUNT = 12;
export const SPAWN_MAX_RADIUS = 12;

export interface WorldDef extends MapShape {
  id: number;
  /** Chave curta, sem acento: aparece na URL e no histórico do painel. */
  slug: string;
  name: string;
  /** Mundo onde os personagens novos nascem. Sempre existe exatamente um. */
  isDefault: boolean;
  /** Fechado: ninguém entra e os portais para ele ficam trancados. */
  published: boolean;
  /** Espalha ninhos de monstro sozinho pelo terreno, como no mundo original. */
  autoSpawns: boolean;
}

/** Ligação entre dois pontos do mesmo mundo ou de mundos diferentes. */
export interface PortalDef {
  id: number;
  worldId: number;
  x: number;
  y: number;
  toWorldId: number;
  toX: number;
  toY: number;
  name: string;
  /** Nível mínimo para atravessar (0 = livre). */
  minLevel: number;
}

/** Ninho: mantém até `amount` monstros vivos num raio em volta do ponto. */
export interface SpawnDef {
  id: number;
  worldId: number;
  x: number;
  y: number;
  monster: MonsterKind;
  amount: number;
  radius: number;
  /** 0 usa o tempo padrão do monstro. */
  respawnMs: number;
}

/** Tesouro fixo no chão: volta sozinho depois de alguém pegar. */
export interface GroundItemDef {
  id: number;
  worldId: number;
  x: number;
  y: number;
  loot: LootKind;
  gold: number;
  diamonds: number;
  respawnMs: number;
}

/** Um tile pintado à mão, guardado por cima do terreno gerado. */
export interface TilePatch {
  x: number;
  y: number;
  ground: number;
  object: number;
}

/** Mundo pronto para desenhar: o que o cliente recebe. */
export interface WorldBlueprint {
  world: WorldDef;
  /** Tiles pintados à mão, em trincas [índice, chão, objeto]. */
  tiles: number[];
  portals: PortalDef[];
}

// ---------------------------------------------------------------- paleta

export interface Paint {
  id: number;
  name: string;
  /** Cor no minimapa e no editor. */
  color: string;
}

export const GROUND_PAINTS: readonly Paint[] = [
  { id: Ground.Grass, name: "Grama", color: "#39662f" },
  { id: Ground.GrassDark, name: "Mata", color: "#2d5527" },
  { id: Ground.Dirt, name: "Terra", color: "#6b5334" },
  { id: Ground.Sand, name: "Areia", color: "#b3a06a" },
  { id: Ground.Water, name: "Água", color: "#1f4b7a" },
  { id: Ground.Stone, name: "Pedra", color: "#5c6270" },
  { id: Ground.Snow, name: "Neve", color: "#c9d8e2" },
  { id: Ground.Lava, name: "Lava", color: "#d9531e" },
  { id: Ground.Cave, name: "Cripta", color: "#34323c" },
  { id: Ground.Ash, name: "Cinza", color: "#4a4040" },
  { id: Ground.Mud, name: "Lama", color: "#4f4a2c" },
  { id: Ground.Marble, name: "Mármore", color: "#ded8c8" },
];

export const OBJECT_PAINTS: readonly Paint[] = [
  { id: Obj.None, name: "Nada", color: "transparent" },
  { id: Obj.Tree, name: "Árvore", color: "#1f4a24" },
  { id: Obj.Pine, name: "Pinheiro", color: "#1b4030" },
  { id: Obj.Rock, name: "Rocha", color: "#4a4f5c" },
  { id: Obj.Bush, name: "Arbusto", color: "#2c5a2c" },
  { id: Obj.Pillar, name: "Coluna", color: "#8a5a3c" },
  { id: Obj.Flowers, name: "Flores", color: "#4d7a3a" },
  { id: Obj.DeadTree, name: "Árvore morta", color: "#5a4632" },
  { id: Obj.TwistedTree, name: "Árvore retorcida", color: "#6a3a2a" },
  { id: Obj.Mushroom, name: "Cogumelos", color: "#b0503c" },
  { id: Obj.SnowPine, name: "Pinheiro nevado", color: "#e8f0f4" },
  { id: Obj.Crystal, name: "Cristal", color: "#8a7dff" },
  { id: Obj.LavaRock, name: "Rocha queimada", color: "#2a2020" },
  { id: Obj.Lily, name: "Vitória-régia", color: "#3f8a4a" },
  { id: Obj.Fern, name: "Samambaia", color: "#3f7a36" },
  { id: Obj.Barrel, name: "Barril", color: "#8a6a3a" },
  { id: Obj.Column, name: "Coluna do templo", color: "#d9d3c2" },
  { id: Obj.Altar, name: "Altar", color: "#2fdc84" },
  { id: Obj.Brazier, name: "Braseiro", color: "#d3a948" },
  { id: Obj.Mosaic, name: "Mosaico", color: "#c9b06a" },
];

/** Maior id de chão e de cenário: o painel recusa o que passar disso. */
export const MAX_GROUND = Math.max(...GROUND_PAINTS.map((paint) => paint.id));
export const MAX_OBJECT = Math.max(...OBJECT_PAINTS.map((paint) => paint.id));

export function groundColor(ground: number): string {
  return GROUND_PAINTS.find((paint) => paint.id === ground)?.color ?? "#000000";
}

export function objectColor(object: number): string {
  return OBJECT_PAINTS.find((paint) => paint.id === object)?.color ?? "transparent";
}

// ---------------------------------------------------------------- montagem do mapa

/** Terreno gerado + tudo o que foi pintado no painel. */
export function buildWorldMap(blueprint: WorldBlueprint): GameMap {
  const map = generateMap(shapeOf(blueprint.world));
  applyTiles(map, blueprint.tiles);
  return map;
}

export function shapeOf(world: WorldDef): MapShape {
  return {
    width: world.width,
    height: world.height,
    seed: world.seed,
    style: world.style,
    spawnX: world.spawnX,
    spawnY: world.spawnY,
    townRadius: world.townRadius,
  };
}

/** Aplica trincas [índice, chão, objeto] no mapa já gerado. */
export function applyTiles(map: GameMap, tiles: readonly number[]) {
  const limit = map.width * map.height;
  for (let i = 0; i + 2 < tiles.length; i += 3) {
    const index = tiles[i];
    if (!Number.isInteger(index) || index < 0 || index >= limit) continue;
    map.ground[index] = tiles[i + 1];
    map.objects[index] = tiles[i + 2];
  }
}

/** Zona protegida: monstros não entram e a vida volta mais rápido. */
export function inSafeZone(world: Pick<WorldDef, "spawnX" | "spawnY" | "townRadius">, x: number, y: number): boolean {
  return chebyshev(x, y, world.spawnX, world.spawnY) <= world.townRadius;
}

/** Nome → chave curta: "Ilha do Norte" vira "ilha-do-norte". */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

export function validateWorldName(name: string): string | null {
  if (name.trim().length < 3) return "O nome do mundo precisa de pelo menos 3 letras.";
  if (name.length > WORLD_NAME_MAX) return `O nome do mundo passa de ${WORLD_NAME_MAX} letras.`;
  if (!slugify(name)) return "Escolha um nome com letras ou números.";
  return null;
}
