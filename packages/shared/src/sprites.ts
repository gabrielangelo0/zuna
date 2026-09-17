// Formato das folhas de sprites geradas pelo baker (packages/baker) e lidas pelo cliente.

export type AnimName = "idle" | "walk" | "attack" | "cast" | "hit" | "death" | "ride";

/**
 * Direções desenhadas no baker, em ordem. As outras três são espelhadas no cliente:
 * SW = SE espelhado, W = E espelhado, NW = NE espelhado.
 */
export const BAKED_DIRS = ["S", "SE", "E", "NE", "N"] as const;
export type BakedDir = (typeof BAKED_DIRS)[number];

/** Grupos de cor que o jogador escolhe. O índice 0 (base) nunca é tingido. */
export const TINT_GROUPS = ["base", "skin", "hair", "primary", "secondary", "detail"] as const;
export type TintGroup = (typeof TINT_GROUPS)[number];

export interface SpriteAnimMeta {
  frames: number;
  fps: number;
  loop: boolean;
}

/** Retângulo no atlas e posição desse recorte dentro da célula (a célula tem o pé em `anchor`). */
export interface SpriteFrameMeta {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Deslocamento do recorte em relação ao canto da célula. */
  dx: number;
  dy: number;
  /**
   * Ponto de encaixe relativo ao pé, quando o sprite tem um: a sela nas montarias,
   * o quadril nos personagens (usado para sentar na sela).
   */
  sx?: number;
  sy?: number;
}

export interface SpriteSheetMeta {
  id: string;
  /** Arquivo do atlas colorido, na mesma pasta do JSON. */
  image: string;
  /** Arquivo do mapa de grupos de cor (só sprites tingíveis). */
  idsImage?: string;
  /** Tamanho da célula lógica (antes do recorte). Todas as molduras compartilham a mesma célula. */
  cellW: number;
  cellH: number;
  /** Ponto do chão (pé) dentro da célula, em pixels. */
  anchorX: number;
  anchorY: number;
  /** Altura da cabeça acima do pé, para nome e barra de vida. */
  headHeight: number;
  /** Quando verdadeiro, `idsImage` tem o grupo de cor de cada pixel (canal R = índice × 40). */
  tintable: boolean;
  /** Multiplicador aplicado à cor escolhida nas partes tingíveis (as partes cinza têm brilho médio 1/tintGain). */
  tintGain: number;
  anims: Partial<Record<AnimName, SpriteAnimMeta>>;
  /** Chave: `${anim}/${dir}/${frame}`. */
  frames: Record<string, SpriteFrameMeta>;
  /** Largura e altura do atlas. */
  width: number;
  height: number;
}

export function frameKey(anim: AnimName, dir: BakedDir, frame: number): string {
  return `${anim}/${dir}/${frame}`;
}

/**
 * Nas montarias: a parte que fica na frente do cavaleiro (cabeça e pescoço, vistos de frente).
 * Desenhada por cima do cavaleiro. Só existe nos quadros em que há algo na frente.
 */
export function frontKey(key: string): string {
  return `${key}#front`;
}

/**
 * Converte a direção do jogo (índice em DIRS) na direção desenhada e se precisa espelhar.
 * DIRS: 0=(1,0) SE · 1=(1,1) S · 2=(0,1) SW · 3=(−1,1) W · 4=(−1,0) NW · 5=(−1,−1) N · 6=(0,−1) NE · 7=(1,−1) E
 */
export function bakedDirFor(dir: number): { dir: BakedDir; flip: boolean } {
  switch (dir) {
    case 0:
      return { dir: "SE", flip: false };
    case 1:
      return { dir: "S", flip: false };
    case 2:
      return { dir: "SE", flip: true };
    case 3:
      return { dir: "E", flip: true };
    case 4:
      return { dir: "NE", flip: true };
    case 5:
      return { dir: "N", flip: false };
    case 6:
      return { dir: "NE", flip: false };
    default:
      return { dir: "E", flip: false };
  }
}
