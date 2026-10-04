import assert from "node:assert/strict";
import { stdout } from "node:process";
import { test } from "node:test";
import { MAP_STYLES, generateMap, isWalkable, reachableTiles, type MapShape, type MapStyle } from "./map.ts";

// O teste que importa aqui não é sobre terreno bonito: é sobre mundo que prende jogador.
// Um gerador que faça bolsões isolados cria um lugar onde o jogador entra e não sai, e isso
// não aparece olhando a tela — aparece no suporte, dias depois.

/** Mundo de teste no tamanho que o painel mais usa. */
function shapeOf(style: MapStyle, seed: number, size = 96): MapShape {
  return { width: size, height: size, seed, style, spawnX: size >> 1, spawnY: size >> 1, townRadius: 6 };
}

/** Fração dos tiles caminháveis que dá para alcançar a pé desde a praça. */
function coverage(style: MapStyle, seed: number, size = 96): number {
  const shape = shapeOf(style, seed, size);
  const map = generateMap(shape);
  const seen = reachableTiles(map, { x: shape.spawnX, y: shape.spawnY });
  let walkable = 0;
  let reached = 0;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!isWalkable(map, x, y)) continue;
      walkable++;
      if (seen[y * map.width + x]) reached++;
    }
  }
  return walkable === 0 ? 0 : reached / walkable;
}

const SEEDS = [1, 7, 99, 1234];

/** Os extremos que o painel aceita (WORLD_MIN_SIZE e WORLD_MAX_SIZE) e o tamanho mais usado. */
const SIZES = [32, 96, 160];

test("a praça é caminhável em todos os estilos", () => {
  for (const { id } of MAP_STYLES) {
    for (const seed of SEEDS) {
      const shape = shapeOf(id, seed);
      const map = generateMap(shape);
      assert.ok(isWalkable(map, shape.spawnX, shape.spawnY), `${id}/${seed}: praça bloqueada`);
    }
  }
});

/**
 * Linha de base medida em 2026-10-04: o pior caso de cada estilo entre os três tamanhos e as
 * quatro sementes, menos cinco pontos de folga para o ruído de semente não gerar falha falsa.
 * Baixar um destes é regressão, não é ajuste.
 *
 * Os números não são redondos de propósito. `abismo` alcança 69%, `vulcao` 76% e `covil` 78%:
 * um limiar único de 80% para todos reprovaria três estilos que já estão em produção. Os 31%
 * inalcançáveis do Abismo são defeito de verdade (chão que o jogador vê e não pisa), mas são
 * anteriores a este teste e consertá-los é outro trabalho.
 */
const PISO: Partial<Record<MapStyle, number>> = {
  campina: 0.86,
  floresta: 0.9,
  pantano: 0.9,
  deserto: 0.94,
  neve: 0.93,
  cripta: 0.88,
  esgoto: 0.82,
  montanha: 0.9,
  vulcao: 0.7,
  covil: 0.72,
  abismo: 0.64,
  caverna: 0.93,
  ilha: 0.92,
  vazio: 0.99,
};

test("nenhum estilo prende o jogador num bolsão", () => {
  const linhas: string[] = [];
  for (const { id } of MAP_STYLES) {
    const piso = PISO[id];
    // Obriga todo estilo novo a declarar o piso dele, em vez de entrar sem ninguém medir.
    assert.ok(piso !== undefined, `${id}: falta a linha de base em PISO`);
    let pior = 1;
    for (const size of SIZES) for (const seed of SEEDS) pior = Math.min(pior, coverage(id, seed, size));
    linhas.push(`${id.padEnd(10)} pior ${(pior * 100).toFixed(1)}%  piso ${(piso * 100).toFixed(0)}%`);
    assert.ok(pior >= piso, `${id}: ${(pior * 100).toFixed(1)}% abaixo do piso de ${(piso * 100).toFixed(0)}%`);
  }
  stdout.write(`${linhas.join("\n")}\n`);
});
