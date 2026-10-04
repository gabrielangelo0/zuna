import assert from "node:assert/strict";
import { test } from "node:test";
import { PORTAL_KINDS, clampDepth, floorLabel, returnKind } from "./world.ts";

test("o rótulo do andar diz onde o jogador está", () => {
  assert.equal(floorLabel("Zuna", 0), "Zuna");
  assert.equal(floorLabel("Esgoto de Zuna", -1), "Esgoto de Zuna · −1");
  assert.equal(floorLabel("Pico Gelado", 2), "Pico Gelado · +2");
});

test("a escada de volta inverte o sentido", () => {
  assert.equal(returnKind("stairsDown"), "stairsUp");
  assert.equal(returnKind("stairsUp"), "stairsDown");
  assert.equal(returnKind("ladderDown"), "ladderUp");
  assert.equal(returnKind("ladderUp"), "ladderDown");
  // Buraco é de mão única: por buraco não se sobe, então a volta dele é escada.
  assert.equal(returnKind("hole"), "stairsUp");
  assert.equal(returnKind("portal"), "portal");
});

test("toda ligação tem volta, e a volta é uma ligação válida", () => {
  for (const kind of PORTAL_KINDS) {
    assert.ok(PORTAL_KINDS.includes(returnKind(kind)), `${kind}: volta inválida`);
  }
});

test("a volta da volta devolve o original, menos no buraco", () => {
  for (const kind of PORTAL_KINDS) {
    if (kind === "hole") continue;
    assert.equal(returnKind(returnKind(kind)), kind, `${kind}: ida e volta não fecham`);
  }
});

test("a profundidade fica nos limites", () => {
  assert.equal(clampDepth(0), 0);
  assert.equal(clampDepth(-3), -3);
  assert.equal(clampDepth(999), 20);
  assert.equal(clampDepth(-999), -20);
  assert.equal(clampDepth(1.7), 2);
  assert.equal(clampDepth(Number.NaN), 0);
  assert.equal(clampDepth("abc"), 0);
  assert.equal(clampDepth(undefined), 0);
});
