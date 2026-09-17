import { TILE_H, TILE_W } from "@game/shared";

/** Centro do tile na tela (coordenadas de mundo do Phaser). */
export function tileToScreen(tx: number, ty: number): { x: number; y: number } {
  return { x: (tx - ty) * (TILE_W / 2), y: (tx + ty) * (TILE_H / 2) };
}

/** Tile sob um ponto da tela. No espaço de tile o losango vira quadrado, então basta arredondar. */
export function screenToTile(sx: number, sy: number): { x: number; y: number } {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { x: Math.round((a + b) / 2), y: Math.round((b - a) / 2) };
}
