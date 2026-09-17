// Utilitários de desenho em canvas 2D (chão, efeitos e marcadores gerados no próprio cliente).

export type Ctx = CanvasRenderingContext2D;

/** Fonte dos textos desenhados no jogo (nomes e números), a mesma da interface. */
export const GAME_FONT = '"Montserrat Variable", system-ui, sans-serif';

export function rgba(color: number, alpha = 1): string {
  return `rgba(${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}, ${alpha})`;
}

/** factor > 0 clareia, < 0 escurece. */
export function shade(color: number, factor: number): number {
  const channel = (v: number) =>
    Math.max(0, Math.min(255, Math.round(factor >= 0 ? v + (255 - v) * factor : v * (1 + factor))));
  return (channel((color >> 16) & 255) << 16) | (channel((color >> 8) & 255) << 8) | channel(color & 255);
}

export function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, fill: string | CanvasGradient) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}
