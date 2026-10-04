import assert from "node:assert/strict";
import { test } from "node:test";
import { BAG_BASE, BAG_MAX, bagCapacity, type OwnedItem } from "./items.ts";
import {
  FACTORY_VIP_PASSES,
  FACTORY_VIP_TIERS,
  tierById,
  upgradeDays,
  vipDaysLeft,
  vipPurchase,
  vipRank,
  type VipState,
} from "./vip.ts";

const AGORA = 1_700_000_000_000;
const DIA = 86_400_000;
const TIERS = FACTORY_VIP_TIERS;
const ouro = tierById(TIERS, "ouro")!;
const diamante = tierById(TIERS, "diamante")!;
const passeOuro = FACTORY_VIP_PASSES.find((p) => p.id === "ouro-30")!;
const passeDiamante = FACTORY_VIP_PASSES.find((p) => p.id === "diamante-30")!;

const semVip: VipState = { tier: "", untilMs: 0 };

test("quem não é VIP compra e começa agora", () => {
  const novo = vipPurchase(semVip, TIERS, passeOuro, AGORA);
  assert.notEqual(typeof novo, "string");
  assert.deepEqual(novo, { tier: "ouro", untilMs: AGORA + 30 * DIA });
});

test("o VIP vencido recomeça do zero, não soma ao passado", () => {
  const vencido: VipState = { tier: "ouro", untilMs: AGORA - 5 * DIA };
  assert.deepEqual(vipPurchase(vencido, TIERS, passeOuro, AGORA), { tier: "ouro", untilMs: AGORA + 30 * DIA });
});

test("o mesmo degrau soma os dias", () => {
  const tem10: VipState = { tier: "ouro", untilMs: AGORA + 10 * DIA };
  assert.deepEqual(vipPurchase(tem10, TIERS, passeOuro, AGORA), { tier: "ouro", untilMs: AGORA + 40 * DIA });
});

test("subir de degrau converte o saldo e não perde dinheiro", () => {
  // O exemplo do spec: sobram 10 dias de Ouro (10 × 9 = 90 💎); Diamante custa 22 💎/dia,
  // então 90 💎 valem 4 dias, e com os 30 comprados dá 34.
  assert.equal(upgradeDays(10 * DIA, ouro, diamante, passeDiamante), 34);
  const tem10: VipState = { tier: "ouro", untilMs: AGORA + 10 * DIA };
  const novo = vipPurchase(tem10, TIERS, passeDiamante, AGORA);
  assert.deepEqual(novo, { tier: "diamante", untilMs: AGORA + 34 * DIA });
});

test("subir sempre dá pelo menos os dias comprados", () => {
  for (const sobram of [0, 1, 3, 29, 180]) {
    const dias = upgradeDays(sobram * DIA, ouro, diamante, passeDiamante);
    assert.ok(dias >= passeDiamante.days, `${sobram} dias: ${dias} < ${passeDiamante.days}`);
  }
});

test("descer de degrau é recusado, com a data na mensagem", () => {
  const temDiamante: VipState = { tier: "diamante", untilMs: AGORA + 20 * DIA };
  const resposta = vipPurchase(temDiamante, TIERS, passeOuro, AGORA);
  assert.equal(typeof resposta, "string");
  assert.match(resposta as string, /VIP Diamante/);
});

test("o degrau desligado no painel não é vendido", () => {
  const desligados = TIERS.map((tier) => (tier.id === "ouro" ? { ...tier, enabled: false } : tier));
  assert.equal(typeof vipPurchase(semVip, desligados, passeOuro, AGORA), "string");
});

test("vipRank vira 0 no instante do vencimento", () => {
  assert.equal(vipRank(ouro, AGORA + 1, AGORA), 1);
  assert.equal(vipRank(ouro, AGORA, AGORA), 0);
  assert.equal(vipRank(ouro, AGORA - 1, AGORA), 0);
  assert.equal(vipRank(undefined, AGORA + DIA, AGORA), 0);
});

test("os dias que faltam arredondam para cima", () => {
  assert.equal(vipDaysLeft(AGORA + DIA, AGORA), 1);
  assert.equal(vipDaysLeft(AGORA + DIA + 1, AGORA), 2);
  assert.equal(vipDaysLeft(AGORA - 1, AGORA), 0);
});

// ---------------------------------------------------------------- mochila

/** A maior bolsa do jogo de fábrica: Mochila Real, +40 espaços. */
const MOCHILA_REAL: OwnedItem[] = [{ uid: 1, itemId: "mochila-real", count: 1, equipped: "backpack", position: -1 }];

test("o VIP levanta o teto da mochila, não só o piso", () => {
  // Sem VIP, nada muda para quem já jogava.
  assert.equal(bagCapacity([]), BAG_BASE);
  assert.equal(bagCapacity(MOCHILA_REAL), BAG_MAX);
  // Com 40 espaços de VIP e nenhuma bolsa, o piso sobe.
  assert.equal(bagCapacity([], 40), BAG_BASE + 40);
  // E com a maior bolsa do jogo o resultado tem que passar do teto antigo: somar os 40 dentro
  // do Math.min original daria exatamente BAG_MAX e o bônus da bolsa valeria zero.
  assert.ok(bagCapacity(MOCHILA_REAL, 40) > BAG_MAX, "o VIP engoliu o bônus da bolsa");
});
