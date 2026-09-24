import { VIEW_MARGIN, VIEW_U_MAX, VIEW_U_MIN, VIEW_V_MAX, VIEW_V_MIN } from "@zuna/shared";

// Quem vê o quê. A tela do jogo é um losango: o que cabe nela não é um quadrado de tiles,
// é uma faixa nos eixos (x − y) e (x + y). Medir nesses dois eixos manda exatamente o que
// aparece na tela, sem sobra nos cantos.

export interface ViewWindow {
  /** Meia-largura da tela, em tiles, no eixo (x − y), com a folga já somada. */
  u: number;
  /** Meia-altura da tela, em tiles, no eixo (x + y), com a folga já somada. */
  v: number;
}

/** Janela de quem ainda não disse o tamanho da tela: uma tela de 1600 × 900 com zoom 1. */
export const DEFAULT_VIEW: ViewWindow = { u: 25 + VIEW_MARGIN, v: 28 + VIEW_MARGIN };

/** Limita o que o cliente pediu: ninguém puxa o mapa inteiro nem fica com buraco na borda. */
export function clampView(u: unknown, v: unknown): ViewWindow {
  const width = Number(u);
  const height = Number(v);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return DEFAULT_VIEW;
  return {
    u: Math.min(VIEW_U_MAX, Math.max(VIEW_U_MIN, Math.round(width))) + VIEW_MARGIN,
    v: Math.min(VIEW_V_MAX, Math.max(VIEW_V_MIN, Math.round(height))) + VIEW_MARGIN,
  };
}

/** O ponto (ex, ey) aparece na tela de quem está em (px, py)? */
export function inView(window: ViewWindow, px: number, py: number, ex: number, ey: number): boolean {
  const dx = ex - px;
  const dy = ey - py;
  return Math.abs(dx - dy) <= window.u && Math.abs(dx + dy) <= window.v;
}
