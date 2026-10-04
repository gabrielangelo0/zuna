import assert from "node:assert/strict";
import { test } from "node:test";
import type { OwnedItem } from "./items.ts";
import {
  DEFAULT_PVP_SETTINGS,
  canAttack,
  marksAttacker,
  droppableItems,
  hasProtection,
  type Fighter,
  type PvpSettings,
} from "./pvp.ts";

const AGORA = 1_700_000_000_000;
const S: PvpSettings = { ...DEFAULT_PVP_SETTINGS };

function lutador(nivel: number, extra: Partial<Fighter> = {}): Fighter {
  return { level: nivel, markedUntil: 0, inSafe: false, attackedAt: 0, ...extra };
}

test("abaixo do nível mínimo ninguém ataca e ninguém é atacado", () => {
  assert.match(canAttack(lutador(20), lutador(25), S, AGORA) ?? "", /nível 30/);
  assert.match(canAttack(lutador(40), lutador(20), S, AGORA) ?? "", /nível 30/);
});

test("dentro da faixa de nível pode, fora não", () => {
  assert.equal(canAttack(lutador(40), lutador(50), S, AGORA), null);
  assert.equal(canAttack(lutador(60), lutador(40), S, AGORA), null);
  // 40 × 1,5 = 60; 61 já passa.
  assert.match(canAttack(lutador(61), lutador(40), S, AGORA) ?? "", /faixa de n[íi]vel/i);
  assert.match(canAttack(lutador(40), lutador(61), S, AGORA) ?? "", /faixa de n[íi]vel/i);
});

test("zona segura protege os dois lados", () => {
  assert.match(canAttack(lutador(40, { inSafe: true }), lutador(40), S, AGORA) ?? "", /zona segura/i);
  assert.match(canAttack(lutador(40), lutador(40, { inSafe: true }), S, AGORA) ?? "", /zona segura/i);
});

test("marcado é atacável fora da faixa de nível", () => {
  const marcado = lutador(40, { markedUntil: AGORA + 60_000 });
  assert.equal(canAttack(lutador(90), marcado, S, AGORA), null);
  // Mas a marca vencida não vale mais.
  const vencido = lutador(40, { markedUntil: AGORA - 1 });
  assert.match(canAttack(lutador(90), vencido, S, AGORA) ?? "", /faixa de n[íi]vel/i);
});

test("marcado não ganha licença para bater em quem quiser", () => {
  const marcado = lutador(90, { markedUntil: AGORA + 60_000 });
  assert.match(canAttack(marcado, lutador(40), S, AGORA) ?? "", /faixa de n[íi]vel/i);
});

test("com o PvP desligado no painel, nada passa", () => {
  const off = { ...S, enabled: false };
  assert.match(canAttack(lutador(40), lutador(40), off, AGORA) ?? "", /desligado/i);
});

test("ninguém ataca a si mesmo", () => {
  const eu = lutador(40);
  assert.ok(canAttack(eu, eu, S, AGORA));
});

// ---------------------------------------------------------------- o que cai

function item(uid: number, id: string, extra: Partial<OwnedItem> & { bound?: boolean } = {}): OwnedItem & { bound?: boolean } {
  return { uid, itemId: id, count: 1, equipped: "", position: uid, ...extra };
}

test("só cai item solto na mochila", () => {
  const mochila = [item(1, "espada"), item(2, "elmo", { equipped: "helmet", position: -1 })];
  const caem = droppableItems(mochila, 5, false);
  assert.deepEqual(caem.map((i) => i.uid), [1]);
});

test("item comprado com diamante nunca cai", () => {
  const mochila = [item(1, "espada", { bound: true }), item(2, "escudo"), item(3, "bota", { bound: true })];
  assert.deepEqual(droppableItems(mochila, 5, false).map((i) => i.uid), [2]);
});

test("mochila vazia ou só com vinculado não derruba nada", () => {
  assert.deepEqual(droppableItems([], 3, false), []);
  assert.deepEqual(droppableItems([item(1, "x", { bound: true })], 3, false), []);
});

test("marcado derruba uma casa a mais", () => {
  const mochila = [item(1, "a"), item(2, "b"), item(3, "c"), item(4, "d")];
  assert.equal(droppableItems(mochila, 1, false).length, 1);
  assert.equal(droppableItems(mochila, 1, true).length, 2);
});

test("cai no máximo o que existe", () => {
  assert.equal(droppableItems([item(1, "a")], 5, true).length, 1);
});

test("o amuleto equipado salva tudo", () => {
  const comAmuleto = [item(1, "a"), item(9, "amuleto-protecao", { equipped: "amulet", position: -1 })];
  assert.ok(hasProtection(comAmuleto));
  assert.deepEqual(droppableItems(comAmuleto, 5, true), []);
  // Na mochila, sem equipar, não salva.
  assert.ok(!hasProtection([item(9, "amuleto-protecao")]));
});

// ---------------------------------------------------------------- a marca

test("atacar quem não te atacou deixa marca", () => {
  assert.ok(marksAttacker(lutador(40), lutador(40), S, AGORA));
});

test("revidar dentro da janela não marca", () => {
  // O alvo bateu no atacante há 2 minutos: isto é revide.
  const atacante = lutador(40, { attackedAt: AGORA - 2 * 60_000 });
  assert.ok(!marksAttacker(atacante, lutador(40), S, AGORA));
  // Passados 11 minutos, a janela de 10 fechou e volta a marcar.
  const tarde = lutador(40, { attackedAt: AGORA - 11 * 60_000 });
  assert.ok(marksAttacker(tarde, lutador(40), S, AGORA));
});

test("bater em quem já está marcado não marca", () => {
  const marcado = lutador(40, { markedUntil: AGORA + 60_000 });
  assert.ok(!marksAttacker(lutador(40), marcado, S, AGORA));
});
