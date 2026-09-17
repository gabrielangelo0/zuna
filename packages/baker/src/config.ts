import type { BakedDir } from "@zuna/shared";

/** Pixels por unidade do mundo. 1 tile = 1 unidade; o losango do tile tem 64 px de largura (√2 unidades). */
export const PPU = 64 / Math.SQRT2;
/** Inclinação da câmera: 30° faz um quadrado no chão virar o losango 2:1 dos tiles. */
export const PITCH = Math.PI / 6;
/** Renderiza em tamanho maior e reduz depois: bordas suaves sem serrilhado. */
export const SUPERSAMPLE = 3;

/** Partes tingíveis viram cinza com este brilho médio; o cliente multiplica pela cor escolhida × 1/TINT_REF. */
export const TINT_REF = 0.8;

export const OUTLINE_COLOR: [number, number, number] = [24, 18, 32];
export const OUTLINE_STRENGTH = 0.78;
export const SHADOW_COLOR = 0x1c1426;
export const SHADOW_OPACITY = 0.34;
/** Sombra de contato (elipse escura sob os pés), para "assentar" o personagem no chão. */
export const CONTACT_SHADOW_OPACITY = 0.3;

export const ATLAS_MAX_WIDTH = 2048;

/** Rotação do modelo para cada direção desenhada (o modelo olha para +Z, que é a câmera). */
export const DIR_YAW: Record<BakedDir, number> = { S: 0, SE: 45, E: 90, NE: 135, N: 180 };

/** Grade das texturas de paleta da KayKit: 8 colunas × 4 linhas. */
export const PALETTE_COLS = 8;
export const PALETTE_ROWS = 4;
