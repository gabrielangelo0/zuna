import { DIAGONAL_COST, TEMPLE_X, TEMPLE_Y, TICK_MS, TOWN_RADIUS } from "./constants.ts";

export interface Point {
  x: number;
  y: number;
}

/** As 8 direções em coordenadas de tile. O índice é o `dir` sincronizado. */
export const DIRS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
];

export function dirIndex(dx: number, dy: number): number {
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  return DIRS.findIndex((d) => d.x === sx && d.y === sy);
}

export function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function stepCost(dx: number, dy: number): number {
  return dx !== 0 && dy !== 0 ? DIAGONAL_COST : 1;
}

/** Duração de um passo arredondada para múltiplos do tick, para o movimento não "engasgar". */
export function stepDuration(baseMs: number, dx: number, dy: number): number {
  return Math.max(TICK_MS, Math.round((baseMs * stepCost(dx, dy)) / TICK_MS) * TICK_MS);
}

export function inTown(x: number, y: number): boolean {
  return chebyshev(x, y, TEMPLE_X, TEMPLE_Y) <= TOWN_RADIUS;
}
