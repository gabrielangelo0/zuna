import Phaser from "phaser";
import { TILE_H, TILE_W } from "@zuna/shared";

// Água desenhada pixel a pixel no próprio cliente.
//
// As ondas são uma função da posição na TELA, não do tile: cada losango pinta o seu pedaço
// do mesmo desenho contínuo, e por isso não aparece a grade entre um tile e outro. O desenho
// se repete a cada 4 tiles, então bastam 16 variações (x % 4, y % 4) para cobrir o mapa todo.
// Por cima vêm a água rasa (um degradê que clareia perto da terra e atravessa dois tiles
// sem emenda) e a espuma da praia.

/** Célula do atlas: 1 px a mais de cada lado, igual ao chão, para os losangos se sobreporem. */
const CELL_W = TILE_W + 2;
const CELL_H = TILE_H + 2;

/** O desenho das ondas se repete a cada 4 tiles (128 × 64 px na tela). */
export const WATER_PERIOD = 4;
const PERIOD_X = (WATER_PERIOD * TILE_W) / 2;
const PERIOD_Y = (WATER_PERIOD * TILE_H) / 2;

export const WATER_FRAMES = 8;
export const FOAM_FRAMES = 6;
/** O degradê da água rasa vai da terra até dois tiles mar adentro. */
export const SHALLOW_BANDS = 2;

/** Mar aberto; a água rasa clareia isto por cima. */
const SEA: [number, number, number] = [36, 108, 172];
const CREST: [number, number, number] = [196, 236, 250];
const SHALLOW: [number, number, number] = [132, 220, 232];
/** Quanto a água rasa cobre o mar, bem na beira. */
const SHALLOW_ALPHA = 0.55;

/** Lados do losango e as quinas, na ordem usada pelos nomes dos quadros. */
export const FOAM_EDGES = ["ne", "se", "sw", "nw"] as const;
export const FOAM_CORNERS = ["n", "e", "s", "w"] as const;

/** Começo do nome do quadro de um tile de água; o número do quadro da animação vem no fim. */
export function waterFramePrefix(x: number, y: number): string {
  const i = ((x % WATER_PERIOD) + WATER_PERIOD) % WATER_PERIOD;
  const j = ((y % WATER_PERIOD) + WATER_PERIOD) % WATER_PERIOD;
  return `w${i}_${j}_`;
}

/** Degradê de água rasa vindo de um lado do losango: `band` 0 encosta na terra, 1 é o tile seguinte. */
export function shallowEdgeName(edge: string, band: number): string {
  return `${edge}_${band}`;
}

export function foamFrameName(part: string, frame: number): string {
  return `${part}_${frame}`;
}

function hash(x: number, y: number): number {
  let h = Math.imul(x + 1013, 374761393) ^ Math.imul(y + 7919, 668265263);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(from: number, to: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

/** O pixel cai dentro do losango? Um pouco para fora, para os vizinhos se cobrirem sem fresta. */
function insideDiamond(px: number, py: number): boolean {
  const nx = Math.abs(px + 0.5 - CELL_W / 2) / (CELL_W / 2);
  const ny = Math.abs(py + 0.5 - CELL_H / 2) / (CELL_H / 2);
  return nx + ny <= 1.04;
}

/**
 * O pixel cai no losango exato do tile (64 × 32), sem sobra? As camadas semitransparentes
 * usam este: se os vizinhos se sobrepusessem, a borda somaria duas vezes e viraria um risco.
 * Pelo centro do pixel nenhum ponto fica em cima da linha, então cada pixel tem um dono só.
 */
function insideTile(px: number, py: number): boolean {
  return Math.abs(px + 0.5 - CELL_W / 2) / (TILE_W / 2) + Math.abs(py + 0.5 - CELL_H / 2) / (TILE_H / 2) <= 1;
}

/**
 * Onda num ponto da tela. Só usa frequências inteiras do período, no espaço e no tempo:
 * o desenho emenda nas bordas do tile e o último quadro emenda no primeiro.
 *
 * Uma onda principal quase horizontal, entortada por outras duas: as cristas viram riscos
 * compridos e sinuosos (somar as três daria picos em grade, que parecem bolinhas).
 */
function wave(gx: number, gy: number, phase: number): { height: number; crest: number } {
  const u = (gx / PERIOD_X) * Math.PI * 2;
  const v = (gy / PERIOD_Y) * Math.PI * 2;
  const warp = 1.1 * Math.sin(2 * u - v + phase) + 0.6 * Math.sin(3 * u + 2 * v - phase + 1.7);
  const height = Math.sin(u + 3 * v + warp + phase);
  // Os riscos se partem em pedaços que andam devagar, em vez de linhas sem fim.
  const dash = smoothstep(0.35, 0.75, 0.5 + 0.5 * Math.sin(3 * u - v + 2 * phase + 0.4));
  const swell = 0.05 * Math.sin(u - 2 * v + phase);
  return { height: height + swell, crest: smoothstep(0.8, 0.97, height) * dash };
}

function createWaterAtlas(scene: Phaser.Scene) {
  const variants = WATER_PERIOD * WATER_PERIOD;
  const cells = variants * WATER_FRAMES;
  const columns = 24;
  const rows = Math.ceil(cells / columns);
  const texture = scene.textures.createCanvas("water", columns * CELL_W, rows * CELL_H);
  if (!texture) throw new Error("Não foi possível criar a textura da água");
  const image = texture.context.createImageData(columns * CELL_W, rows * CELL_H);
  const stride = columns * CELL_W;

  const frames: { name: string; ox: number; oy: number }[] = [];
  const place = (name: string) => {
    const slot = { name, ox: (frames.length % columns) * CELL_W, oy: Math.floor(frames.length / columns) * CELL_H };
    frames.push(slot);
    return slot;
  };

  for (let i = 0; i < WATER_PERIOD; i++) {
    for (let j = 0; j < WATER_PERIOD; j++) {
      // Onde o canto da célula cai na tela, dentro do período do desenho.
      const sx = (i - j) * (TILE_W / 2) - CELL_W / 2;
      const sy = (i + j) * (TILE_H / 2) - CELL_H / 2;

      for (let frame = 0; frame < WATER_FRAMES; frame++) {
        const phase = (frame / WATER_FRAMES) * Math.PI * 2;
        const { ox, oy } = place(`w${i}_${j}_${frame}`);

        for (let py = 0; py < CELL_H; py++) {
          for (let px = 0; px < CELL_W; px++) {
            if (!insideDiamond(px, py)) continue;
            const gx = (((sx + px) % PERIOD_X) + PERIOD_X) % PERIOD_X;
            const gy = (((sy + py) % PERIOD_Y) + PERIOD_Y) % PERIOD_Y;
            const w = wave(gx, gy, phase);

            // Crista clara, vale levemente mais escuro: ondas com cara de desenho.
            const light = 1 + 0.1 * w.height;
            const crest = w.crest * 0.55;

            // Poucos brilhos soltos, cada um aceso só num pedaço da animação.
            // A célula de 16 × 8 px é do tamanho de um quarto de tile: um brilho a cada ~10 tiles.
            const cx = gx >> 4;
            const cy = gy >> 3;
            const seed = hash(cx, cy);
            let glint = 0;
            if (seed < 0.025) {
              const spotX = 3 + Math.floor(hash(cy, cx) * 10);
              const spotY = 2 + Math.floor(hash(cx + 31, cy) * 4);
              const dx = (gx & 15) - spotX;
              const dy = (gy & 7) - spotY;
              // Uma cruzinha de 5 px na horizontal e 3 px na vertical.
              const shape = dy === 0 ? 1 - Math.abs(dx) / 3 : dx === 0 && Math.abs(dy) === 1 ? 0.5 : 0;
              const blink = Math.sin(phase + seed * 250);
              if (shape > 0 && blink > 0.7) glint = shape * ((blink - 0.7) / 0.3);
            }

            const at = ((oy + py) * stride + ox + px) * 4;
            const mix = Math.min(1, crest + glint);
            for (let c = 0; c < 3; c++) {
              const shaded = SEA[c] * light;
              image.data[at + c] = Math.max(0, Math.min(255, Math.round(shaded + (CREST[c] - shaded) * mix)));
            }
            image.data[at + 3] = 255;
          }
        }
      }
    }
  }

  texture.context.putImageData(image, 0, 0);
  for (const slot of frames) texture.add(slot.name, 0, slot.ox, slot.oy, CELL_W, CELL_H);
  texture.refresh();
}

/**
 * Espuma da praia: uma faixa branca rente ao lado que encosta na terra, com a borda de dentro
 * ondulando, e uma segunda linha que vem chegando do mar e some ao bater na areia.
 */
function foamAlpha(part: string, nx: number, ny: number, frame: number): number {
  const t = frame / FOAM_FRAMES;
  const phase = t * Math.PI * 2;

  if ((FOAM_CORNERS as readonly string[]).includes(part)) {
    const [vx, vy] = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] }[part as "n"]!;
    const distance = Math.hypot(nx - vx, (ny - vy) * 0.9);
    const edge = 0.3 + 0.04 * Math.sin(phase);
    return distance < edge ? Math.min(1, (edge - distance) / 0.12) * 0.85 : 0;
  }

  // Distância até o lado (0 no lado, cresce para dentro) e a posição ao longo dele.
  const sides: Record<string, [number, number]> = {
    ne: [1 - (nx - ny), nx + ny],
    se: [1 - (nx + ny), nx - ny],
    sw: [1 - (-nx + ny), nx + ny],
    nw: [1 - (-nx - ny), nx - ny],
  };
  const [distance, along] = sides[part];

  const ripple = 0.035 * Math.sin(along * 9 + phase) + 0.02 * Math.sin(along * 23 - phase * 2);
  const band = 0.17 + ripple;
  let alpha = distance < band ? Math.min(1, (band - distance) / 0.07) * 0.9 : 0;

  // A linha que chega: nasce mais para dentro e vem até a areia, apagando.
  const incoming = 0.46 - 0.26 * t + 0.02 * Math.sin(along * 7 + phase);
  const line = 1 - Math.abs(distance - incoming) / 0.028;
  if (line > 0) alpha = Math.max(alpha, line * 0.32 * Math.sin(Math.PI * Math.min(1, t * 1.1)));
  return alpha;
}

function createFoamAtlas(scene: Phaser.Scene) {
  const parts = [...FOAM_EDGES, ...FOAM_CORNERS];
  const texture = scene.textures.createCanvas("foam", FOAM_FRAMES * CELL_W, parts.length * CELL_H);
  if (!texture) throw new Error("Não foi possível criar a textura da espuma");
  const image = texture.context.createImageData(FOAM_FRAMES * CELL_W, parts.length * CELL_H);
  const stride = FOAM_FRAMES * CELL_W;

  parts.forEach((part, row) => {
    for (let frame = 0; frame < FOAM_FRAMES; frame++) {
      const ox = frame * CELL_W;
      const oy = row * CELL_H;
      for (let py = 0; py < CELL_H; py++) {
        for (let px = 0; px < CELL_W; px++) {
          if (!insideTile(px, py)) continue;
          const nx = (px + 0.5 - CELL_W / 2) / (TILE_W / 2);
          const ny = (py + 0.5 - CELL_H / 2) / (TILE_H / 2);
          const alpha = foamAlpha(part, nx, ny, frame);
          if (alpha <= 0) continue;
          const at = ((oy + py) * stride + ox + px) * 4;
          image.data[at] = 236;
          image.data[at + 1] = 249;
          image.data[at + 2] = 255;
          image.data[at + 3] = Math.round(Math.min(1, alpha) * 255);
        }
      }
      texture.add(foamFrameName(part, frame), 0, ox, oy, CELL_W, CELL_H);
    }
  });

  texture.context.putImageData(image, 0, 0);
  texture.refresh();
}

/**
 * Água rasa: um véu claro que sai do lado encostado na terra e some dois tiles depois.
 * O tile da beira vai do forte ao médio e o seguinte do médio ao zero, então a cor
 * continua de um losango para o outro sem degrau.
 */
function shallowAlpha(part: string, nx: number, ny: number): number {
  if ((FOAM_CORNERS as readonly string[]).includes(part)) {
    const [vx, vy] = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] }[part as "n"]!;
    const reach = Math.min(1, Math.abs(nx - vx) + Math.abs(ny - vy));
    return SHALLOW_ALPHA * Math.pow(1 - reach, 1.6);
  }
  const [edge, band] = part.split("_");
  const distance = { ne: 1 - (nx - ny), se: 1 - (nx + ny), sw: 1 - (-nx + ny), nw: 1 - (-nx - ny) }[edge]!;
  // Ao longo de dois tiles o caminho vai de 0 a 1: metade em cada losango.
  const along = Math.min(1, (Number(band) * 2 + distance) / (SHALLOW_BANDS * 2));
  return SHALLOW_ALPHA * Math.pow(1 - along, 1.6);
}

function createShallowAtlas(scene: Phaser.Scene) {
  const parts = [
    ...FOAM_EDGES.flatMap((edge) => Array.from({ length: SHALLOW_BANDS }, (_, band) => shallowEdgeName(edge, band))),
    ...FOAM_CORNERS,
  ];
  const texture = scene.textures.createCanvas("shallow", parts.length * CELL_W, CELL_H);
  if (!texture) throw new Error("Não foi possível criar a textura da água rasa");
  const image = texture.context.createImageData(parts.length * CELL_W, CELL_H);
  const stride = parts.length * CELL_W;

  parts.forEach((part, column) => {
    const ox = column * CELL_W;
    for (let py = 0; py < CELL_H; py++) {
      for (let px = 0; px < CELL_W; px++) {
        if (!insideTile(px, py)) continue;
        const nx = (px + 0.5 - CELL_W / 2) / (TILE_W / 2);
        const ny = (py + 0.5 - CELL_H / 2) / (TILE_H / 2);
        const alpha = shallowAlpha(part, nx, ny);
        if (alpha <= 0) continue;
        const at = (py * stride + ox + px) * 4;
        image.data[at] = SHALLOW[0];
        image.data[at + 1] = SHALLOW[1];
        image.data[at + 2] = SHALLOW[2];
        image.data[at + 3] = Math.round(alpha * 255);
      }
    }
    texture.add(part, 0, ox, 0, CELL_W, CELL_H);
  });

  texture.context.putImageData(image, 0, 0);
  texture.refresh();
}

export function createWaterTextures(scene: Phaser.Scene) {
  createWaterAtlas(scene);
  createShallowAtlas(scene);
  createFoamAtlas(scene);
}
