import Phaser from "phaser";
import { TILE_H, TILE_W } from "@zuna/shared";

// O mundo dividido em blocos, para desenhar só o que está na tela.
//
// O Phaser não corta nada sozinho: um Blitter percorre todos os seus bobs e monta a matriz de
// cada um, esteja o bob na tela ou não, e a lista de exibição é reordenada inteira sempre que
// alguém muda de profundidade — o que acontece a cada passo de cada personagem. Num mundo de
// 136 × 136 isso dá 22 mil losangos e 4,6 mil objetos de cenário por quadro, com menos de
// dois mil deles visíveis. Aqui cada bloco vira um Blitter próprio e um punhado de imagens,
// que entram e saem de cena conforme a câmera anda.

/** Lado do bloco, em tiles. Blocos pequenos recortam melhor; blocos grandes trocam menos de estado. */
export const CHUNK = 8;

/** Folga em volta da câmera, para o bloco já estar montado quando encostar na borda. */
const MARGIN = TILE_W;

export interface ChunkBox {
  /** Cantos do bloco em tiles, inclusivos. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Os blocos de um mundo e quais deles a câmera alcança. Não guarda nada de Phaser: quem usa
 * decide o que montar em cada bloco.
 */
export class ChunkGrid {
  readonly cols: number;
  readonly rows: number;
  readonly boxes: ChunkBox[] = [];
  /** Blocos visíveis no último cálculo. */
  private visible = new Set<number>();
  private lastScrollX = Number.NaN;
  private lastScrollY = Number.NaN;
  private lastZoom = Number.NaN;
  private readonly tall: number;

  /** `tall` é a altura do sprite mais alto do mundo: um bloco entra em cena antes da borda por causa dele. */
  constructor(width: number, height: number, tall: number) {
    this.tall = tall;
    this.cols = Math.ceil(width / CHUNK);
    this.rows = Math.ceil(height / CHUNK);
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const x0 = col * CHUNK;
        const y0 = row * CHUNK;
        this.boxes.push({ x0, y0, x1: Math.min(width - 1, x0 + CHUNK - 1), y1: Math.min(height - 1, y0 + CHUNK - 1) });
      }
    }
  }

  /** Em que bloco cai este tile. */
  chunkOf(x: number, y: number): number {
    return Math.floor(y / CHUNK) * this.cols + Math.floor(x / CHUNK);
  }

  /**
   * Recalcula os blocos visíveis quando a câmera mexeu e avisa quem entrou e quem saiu.
   * Devolve falso quando nada mudou, que é o caso da maioria dos quadros.
   */
  update(camera: Phaser.Cameras.Scene2D.Camera, onEnter: (chunk: number) => void, onLeave: (chunk: number) => void): boolean {
    if (camera.scrollX === this.lastScrollX && camera.scrollY === this.lastScrollY && camera.zoom === this.lastZoom) {
      return false;
    }
    this.lastScrollX = camera.scrollX;
    this.lastScrollY = camera.scrollY;
    this.lastZoom = camera.zoom;

    // A tela vira uma faixa nos eixos do losango: a = x − y anda com o x da tela, b = x + y
    // com o y. Nesses eixos a tela é um retângulo e o bloco é um losango, e comparar os dois
    // exige olhar os quatro eixos — a caixa retangular do bloco pegaria o dobro de mundo.
    const view = camera.worldView;
    const aMin = (view.x - MARGIN) / (TILE_W / 2);
    const aMax = (view.right + MARGIN) / (TILE_W / 2);
    const bMin = (view.y - this.tall) / (TILE_H / 2);
    const bMax = (view.bottom + TILE_H) / (TILE_H / 2);
    // Os mesmos cantos lidos como tile, para os dois eixos do bloco.
    const xMin = (aMin + bMin) / 2;
    const xMax = (aMax + bMax) / 2;
    const yMin = (bMin - aMax) / 2;
    const yMax = (bMax - aMin) / 2;

    const next = new Set<number>();
    for (let i = 0; i < this.boxes.length; i++) {
      const { x0, y0, x1, y1 } = this.boxes[i];
      if (x1 - y0 < aMin || x0 - y1 > aMax) continue;
      if (x1 + y1 < bMin || x0 + y0 > bMax) continue;
      if (x1 < xMin || x0 > xMax) continue;
      if (y1 < yMin || y0 > yMax) continue;
      next.add(i);
      if (!this.visible.has(i)) onEnter(i);
    }
    for (const i of this.visible) if (!next.has(i)) onLeave(i);
    this.visible = next;
    return true;
  }

  /** Este bloco está na tela agora? */
  isVisible(chunk: number): boolean {
    return this.visible.has(chunk);
  }

  /** Os blocos na tela, para quem só quer mexer no que aparece. */
  visibleChunks(): Iterable<number> {
    return this.visible;
  }

  /** Esquece o que estava visível: usado ao trocar de mundo. */
  reset() {
    this.visible.clear();
    this.lastScrollX = Number.NaN;
    this.lastScrollY = Number.NaN;
    this.lastZoom = Number.NaN;
  }

  get visibleCount(): number {
    return this.visible.size;
  }
}
