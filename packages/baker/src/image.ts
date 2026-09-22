// Tratamento 2D das imagens renderizadas: redução, contorno, recorte e montagem do atlas.

export interface Rgba {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

export function createRgba(width: number, height: number): Rgba {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function readCanvas(source: CanvasImageSource, width: number, height: number): Rgba {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, width, height);
  return { width, height, data: image.data };
}

/** Média de blocos `factor`×`factor`, ponderada pelo alfa (sem halo escuro nas bordas). */
export function downsample(source: Rgba, factor: number): Rgba {
  const width = Math.floor(source.width / factor);
  const height = Math.floor(source.height / factor);
  const out = createRgba(width, height);
  const samples = factor * factor;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < factor; sy++) {
        let i = ((y * factor + sy) * source.width + x * factor) * 4;
        for (let sx = 0; sx < factor; sx++, i += 4) {
          const alpha = source.data[i + 3];
          r += source.data[i] * alpha;
          g += source.data[i + 1] * alpha;
          b += source.data[i + 2] * alpha;
          a += alpha;
        }
      }
      const o = (y * width + x) * 4;
      if (a > 0) {
        out.data[o] = r / a;
        out.data[o + 1] = g / a;
        out.data[o + 2] = b / a;
        out.data[o + 3] = a / samples;
      }
    }
  }
  return out;
}

/**
 * Redução do mapa de grupos: cada pixel recebe o grupo mais frequente do bloco (entre as amostras opacas).
 * O grupo está no canal R como índice × 40.
 */
export function downsampleIds(source: Rgba, factor: number): Rgba {
  const width = Math.floor(source.width / factor);
  const height = Math.floor(source.height / factor);
  const out = createRgba(width, height);
  const votes = new Uint16Array(8);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      votes.fill(0);
      let any = false;
      for (let sy = 0; sy < factor; sy++) {
        let i = ((y * factor + sy) * source.width + x * factor) * 4;
        for (let sx = 0; sx < factor; sx++, i += 4) {
          if (source.data[i + 3] < 128) continue;
          votes[Math.min(7, Math.round(source.data[i] / 40))]++;
          any = true;
        }
      }
      if (!any) continue;
      let best = 0;
      for (let k = 1; k < votes.length; k++) if (votes[k] > votes[best]) best = k;
      const o = (y * width + x) * 4;
      out.data[o] = best * 40;
      out.data[o + 3] = 255;
    }
  }
  return out;
}

/** Contorno escuro de 1 px em volta da silhueta (desenhado por baixo do modelo). */
export function outline(model: Rgba, color: [number, number, number], strength: number): Rgba {
  const { width, height, data } = model;
  const out = createRgba(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let alpha = 0;
      for (let oy = -1; oy <= 1; oy++) {
        const ny = y + oy;
        if (ny < 0 || ny >= height) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const nx = x + ox;
          if (nx < 0 || nx >= width) continue;
          // Vizinhos na diagonal contam menos: o contorno fica mais suave.
          const weight = ox !== 0 && oy !== 0 ? 0.6 : 1;
          alpha = Math.max(alpha, data[(ny * width + nx) * 4 + 3] * weight);
        }
      }
      const o = (y * width + x) * 4;
      out.data[o] = color[0];
      out.data[o + 1] = color[1];
      out.data[o + 2] = color[2];
      out.data[o + 3] = alpha * strength;
    }
  }
  return out;
}

/** Mantém de `image` só o que está sob a máscara (alfa de `mask`, alargado em 1 px para levar o contorno junto). */
export function maskBy(image: Rgba, mask: Rgba): Rgba {
  const { width, height } = image;
  const out = createRgba(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let alpha = 0;
      for (let oy = -1; oy <= 1; oy++) {
        const ny = y + oy;
        if (ny < 0 || ny >= height) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const nx = x + ox;
          if (nx >= 0 && nx < width) alpha = Math.max(alpha, mask.data[(ny * width + nx) * 4 + 3]);
        }
      }
      if (alpha === 0) continue;
      const i = (y * width + x) * 4;
      out.data[i] = image.data[i];
      out.data[i + 1] = image.data[i + 1];
      out.data[i + 2] = image.data[i + 2];
      out.data[i + 3] = (image.data[i + 3] * alpha) / 255;
    }
  }
  return out;
}

/** Desenha `top` sobre `bottom` (alfa normal, "source-over"). */
export function composite(bottom: Rgba, top: Rgba): Rgba {
  const out = createRgba(bottom.width, bottom.height);
  const b = bottom.data;
  const t = top.data;
  for (let i = 0; i < b.length; i += 4) {
    const ta = t[i + 3] / 255;
    const ba = b[i + 3] / 255;
    const a = ta + ba * (1 - ta);
    if (a <= 0) continue;
    for (let c = 0; c < 3; c++) out.data[i + c] = (t[i + c] * ta + b[i + c] * ba * (1 - ta)) / a;
    out.data[i + 3] = a * 255;
  }
  return out;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Menor retângulo com pixels visíveis, ou null se a imagem estiver vazia. */
export function opaqueBounds(image: Rgba, threshold = 2): Bounds | null {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] <= threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Verdadeiro quando algo encosta na borda: sinal de que a célula está pequena e cortou o desenho. */
export function touchesEdge(image: Rgba): boolean {
  const { width, height, data } = image;
  for (let x = 0; x < width; x++) {
    if (data[x * 4 + 3] > 8 || data[((height - 1) * width + x) * 4 + 3] > 8) return true;
  }
  for (let y = 0; y < height; y++) {
    if (data[y * width * 4 + 3] > 8 || data[(y * width + width - 1) * 4 + 3] > 8) return true;
  }
  return false;
}

export function crop(image: Rgba, bounds: Bounds): Rgba {
  const out = createRgba(bounds.w, bounds.h);
  for (let y = 0; y < bounds.h; y++) {
    const start = ((bounds.y + y) * image.width + bounds.x) * 4;
    out.data.set(image.data.subarray(start, start + bounds.w * 4), y * bounds.w * 4);
  }
  return out;
}

export function blit(target: Rgba, source: Rgba, x: number, y: number) {
  for (let row = 0; row < source.height; row++) {
    const from = row * source.width * 4;
    target.data.set(source.data.subarray(from, from + source.width * 4), ((y + row) * target.width + x) * 4);
  }
}

export interface PackItem {
  key: string;
  w: number;
  h: number;
}

export interface Packed {
  width: number;
  height: number;
  positions: Map<string, { x: number; y: number }>;
}

/** Empacota em prateleiras, das mais altas para as mais baixas. */
export function pack(items: PackItem[], maxWidth: number, padding = 2): Packed {
  const sorted = [...items].sort((a, b) => b.h - a.h || b.w - a.w);
  const positions = new Map<string, { x: number; y: number }>();
  let x = padding;
  let y = padding;
  let rowHeight = 0;
  let width = 0;
  for (const item of sorted) {
    if (x + item.w + padding > maxWidth) {
      x = padding;
      y += rowHeight + padding;
      rowHeight = 0;
    }
    positions.set(item.key, { x, y });
    x += item.w + padding;
    rowHeight = Math.max(rowHeight, item.h);
    width = Math.max(width, x);
  }
  const height = y + rowHeight + padding;
  // Largura em potência de dois (as linhas encaixam certinho); a altura só arredonda para um
  // múltiplo de 128. Dobrar a altura desperdiçava metade do atlas nos sprites grandes.
  return { width: nextPowerOfTwo(width), height: Math.ceil(height / 128) * 128, positions };
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(1, value)));
}

export async function toImage(image: Rgba, type: "image/png" | "image/webp", quality?: number): Promise<Blob> {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  return canvas.convertToBlob({ type, quality });
}
