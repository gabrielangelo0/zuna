import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_ARENA_SETTINGS,
  FACTORY_ARENAS,
  FACTORY_ARENA_REWARDS,
  arenaDayKey,
  arenaFighter,
  arenaWeekKey,
  arenasFor,
  clampArena,
  eloDelta,
  entryBudget,
  fightDuration,
  powerScore,
  rewardForRank,
  arenaSpells,
  simulateFight,
  type ArenaReward,
  type ArenaSettings,
} from "./arena.ts";

const AJUSTES: ArenaSettings = DEFAULT_ARENA_SETTINGS;
const novatos = FACTORY_ARENAS.find((a) => a.id === "novatos")!;
const campeoes = FACTORY_ARENAS.find((a) => a.id === "campeoes")!;
const premios: ArenaReward[] = FACTORY_ARENA_REWARDS.map((r, i) => ({ ...r, id: i + 1 }));

// ---------------------------------------------------------------- a simulação

test("mesma semente, mesma luta", () => {
  const a = arenaFighter("A", 40, "cavaleiro");
  const b = arenaFighter("B", 40, "feiticeiro");
  const um = simulateFight(a, b, 12345, AJUSTES);
  const dois = simulateFight(a, b, 12345, AJUSTES);
  assert.deepEqual(um, dois);
});

test("sementes diferentes dão lutas diferentes", () => {
  const a = arenaFighter("A", 40, "cavaleiro");
  const b = arenaFighter("B", 40, "paladino");
  const lutas = new Set<string>();
  for (let seed = 1; seed <= 40; seed++) lutas.add(JSON.stringify(simulateFight(a, b, seed, AJUSTES).blows));
  // Se a semente não estivesse valendo, as 40 seriam idênticas.
  assert.ok(lutas.size > 20, `esperava variedade, veio ${lutas.size} luta(s) distinta(s)`);
});

test("quem é muito mais forte ganha quase sempre", () => {
  const fraco = arenaFighter("Fraco", 20, "paladino");
  const forte = arenaFighter("Forte", 90, "paladino");
  let vitorias = 0;
  for (let seed = 1; seed <= 100; seed++) {
    if (simulateFight(forte, fraco, seed, AJUSTES).winner === 0) vitorias++;
  }
  assert.equal(vitorias, 100, `nível 90 perdeu para nível 20 em ${100 - vitorias} de 100 lutas`);
});

test("a vida nunca passa do máximo nem fica negativa", () => {
  const a = arenaFighter("A", 55, "druida");
  const b = arenaFighter("B", 55, "cavaleiro");
  for (let seed = 1; seed <= 30; seed++) {
    const luta = simulateFight(a, b, seed, AJUSTES);
    for (const golpe of luta.blows) {
      assert.ok(golpe.hp[0] >= 0 && golpe.hp[0] <= a.maxHp, `vida do desafiante fora da faixa: ${golpe.hp[0]}`);
      assert.ok(golpe.hp[1] >= 0 && golpe.hp[1] <= b.maxHp, `vida do adversário fora da faixa: ${golpe.hp[1]}`);
    }
  }
});

test("o vencedor é quem sobrou de pé", () => {
  const a = arenaFighter("A", 45, "feiticeiro");
  const b = arenaFighter("B", 45, "paladino");
  for (let seed = 1; seed <= 30; seed++) {
    const luta = simulateFight(a, b, seed, AJUSTES);
    if (luta.byTimeout) continue;
    const ultimo = luta.blows[luta.blows.length - 1];
    assert.equal(ultimo.hp[luta.winner === 0 ? 1 : 0], 0, "o vencedor não foi quem derrubou o outro");
  }
});

test("quem cura aguenta mais rodadas do que quem não cura", () => {
  // Mesmos números dos dois lados; a única diferença é saber curar.
  const base = arenaFighter("Base", 50, "druida");
  const semCura = { ...base, canHeal: false };
  const bate = arenaFighter("Bate", 50, "cavaleiro");
  let comCuraTotal = 0;
  let semCuraTotal = 0;
  for (let seed = 1; seed <= 60; seed++) {
    comCuraTotal += simulateFight(base, bate, seed, AJUSTES).rounds;
    semCuraTotal += simulateFight(semCura, bate, seed, AJUSTES).rounds;
  }
  assert.ok(comCuraTotal > semCuraTotal, `cura não segurou: ${comCuraTotal} rodadas contra ${semCuraTotal}`);
});

test("a cura é limitada pela mana e pelo teto", () => {
  const curandeiro = arenaFighter("Curandeiro", 60, "druida");
  const bate = arenaFighter("Bate", 60, "cavaleiro");
  const porMana = Math.floor(1 / AJUSTES.healManaPct);
  const maximo = Math.min(porMana, AJUSTES.maxHeals);
  for (let seed = 1; seed <= 30; seed++) {
    const curas = simulateFight(curandeiro, bate, seed, AJUSTES).blows.filter((g) => g.by === 0 && g.kind === "heal");
    assert.ok(curas.length <= maximo, `curou ${curas.length} vezes com teto de ${maximo}`);
  }
});

test("o poço de mana da classe decide quantas curas ela tem", () => {
  // O custo é fração da mana máxima, então o teto por mana é igual; o que muda é o tamanho de
  // cada cura, pelo fator mágico. É o que devolve identidade à classe curandeira.
  const druida = arenaFighter("Druida", 60, "druida");
  const cavaleiro = arenaFighter("Cavaleiro", 60, "cavaleiro");
  assert.ok(druida.magicFactor > cavaleiro.magicFactor);
  assert.ok(druida.maxMana > cavaleiro.maxMana);
});

test("quem tem lista funda de poderes lança mais", () => {
  // Modelar só a melhor magia penalizava o Feiticeiro (quatro famílias) diante do Cavaleiro
  // (duas ofensivas). Ver arenaSpells.
  assert.ok(arenaSpells("feiticeiro", 80).length > arenaSpells("cavaleiro", 80).length);
  const feiticeiro = arenaFighter("F", 80, "feiticeiro");
  const cavaleiro = arenaFighter("C", 80, "cavaleiro");
  const magias = (f: typeof feiticeiro) => {
    let n = 0;
    for (let seed = 1; seed <= 20; seed++) {
      n += simulateFight(f, f === feiticeiro ? cavaleiro : feiticeiro, seed, AJUSTES).blows.filter((g) => g.by === 0 && (g.kind === "spell" || g.kind === "spellCrit")).length;
    }
    return n;
  };
  assert.ok(magias(feiticeiro) > magias(cavaleiro), "o Feiticeiro devia lançar mais que o Cavaleiro");
});

test("cada magia tem a sua recarga, e a cura tem a dela", () => {
  // Uma recarga só por lutador fazia a espera de 6 s do gelo da Druida bloquear a cura de 1 s.
  const druida = arenaFighter("Druida", 80, "druida");
  const bate = { ...arenaFighter("Bate", 80, "cavaleiro"), maxDamage: 200 };
  const luta = simulateFight(druida, bate, 5, AJUSTES);
  const curas = luta.blows.filter((g) => g.by === 0 && g.kind === "heal");
  const magias = luta.blows.filter((g) => g.by === 0 && (g.kind === "spell" || g.kind === "spellCrit"));
  assert.ok(curas.length > 0, "a Druida não curou nenhuma vez");
  assert.ok(magias.length > 0, "a Druida não lançou nenhuma magia");
});

test("a arena não usa a força do grau, e por isso o ritmo não depende do nível", () => {
  // Com a força de grau cheio, a luta ia de 7,6 rodadas no nível 15 para 1,0 no nível 200.
  const rodadas = (nivel: number) => {
    let total = 0;
    const a = arenaFighter("A", nivel, "paladino");
    const b = arenaFighter("B", nivel, "paladino");
    for (let seed = 1; seed <= 60; seed++) total += simulateFight(a, b, seed, AJUSTES).rounds;
    return total / 60;
  };
  const baixo = rodadas(40);
  const alto = rodadas(400);
  assert.ok(alto > baixo * 0.5 && alto < baixo * 2, `ritmo fugiu com o nível: ${baixo.toFixed(1)} contra ${alto.toFixed(1)} rodadas`);
});

test("a luta tem golpes suficientes para virar reprise", () => {
  // Reprise de 2 golpes não é espetáculo nenhum: foi o que a medição de ritmo comprou.
  for (const nivel of [15, 40, 80, 200]) {
    const a = arenaFighter("A", nivel, "cavaleiro");
    const b = arenaFighter("B", nivel, "feiticeiro");
    let golpes = 0;
    for (let seed = 1; seed <= 40; seed++) golpes += simulateFight(a, b, seed, AJUSTES).blows.length;
    assert.ok(golpes / 40 >= 8, `nível ${nivel} deu só ${(golpes / 40).toFixed(1)} golpes por luta`);
  }
});

test("o teto de rodadas decide pela vida proporcional", () => {
  // Dois muros: a armadura de cada um engole o dano do outro, então ninguém cai.
  const muro = { ...arenaFighter("Muro", 50, "cavaleiro"), maxDamage: 1, armor: 9999, canHeal: false, spells: [] };
  const apertado: ArenaSettings = { ...AJUSTES, maxRounds: 6 };
  const luta = simulateFight(muro, { ...muro, name: "Outro" }, 7, apertado);
  assert.equal(luta.byTimeout, true, "a luta devia ter batido no teto");
  assert.equal(luta.blows.length, 12, "o teto é em rodadas: 6 rodadas são 12 golpes");
  // Empate exato é derrota do desafiante, de propósito (ver o spec).
  assert.equal(luta.winner, 1);
});

test("a iniciativa sai da semente, não de quem desafiou", () => {
  const a = arenaFighter("A", 50, "paladino");
  const b = arenaFighter("B", 50, "paladino");
  const primeiros = new Set<number>();
  for (let seed = 1; seed <= 30; seed++) primeiros.add(simulateFight(a, b, seed, AJUSTES).blows[0].by);
  assert.deepEqual([...primeiros].sort(), [0, 1], "o desafiante estava sempre batendo primeiro");
});

test("a duração da reprise cresce com a luta", () => {
  const a = arenaFighter("A", 50, "cavaleiro");
  const b = arenaFighter("B", 50, "cavaleiro");
  const luta = simulateFight(a, b, 99, AJUSTES);
  assert.ok(fightDuration(luta) > 0);
  assert.ok(fightDuration(luta) >= luta.blows[luta.blows.length - 1].at);
});

test("o equipamento muda a luta", () => {
  const nu = arenaFighter("Nu", 50, "paladino");
  const armado = arenaFighter("Armado", 50, "paladino", { attack: 120, defense: 80, hp: 400, mana: 0 });
  assert.ok(powerScore(armado) > powerScore(nu));
  let vitorias = 0;
  for (let seed = 1; seed <= 50; seed++) if (simulateFight(armado, nu, seed, AJUSTES).winner === 0) vitorias++;
  assert.equal(vitorias, 50, "o equipamento não decidiu a luta");
});

// ---------------------------------------------------------------- pontuação

test("vitória soma e derrota tira", () => {
  assert.ok(eloDelta(1000, 1000, true, 24) > 0);
  assert.ok(eloDelta(1000, 1000, false, 24) < 0);
  assert.equal(eloDelta(1000, 1000, true, 24), 12);
  assert.equal(eloDelta(1000, 1000, false, 24), -12);
});

test("ganhar de quem é mais forte vale mais", () => {
  const contraForte = eloDelta(1000, 1600, true, 24);
  const contraFraco = eloDelta(1000, 400, true, 24);
  assert.ok(contraForte > contraFraco, `${contraForte} devia ser maior que ${contraFraco}`);
});

test("perder para quem é mais fraco custa mais", () => {
  const paraFraco = eloDelta(1600, 1000, false, 24);
  const paraForte = eloDelta(1000, 1600, false, 24);
  assert.ok(paraFraco < paraForte, `${paraFraco} devia ser pior que ${paraForte}`);
});

test("nunca mexe zero: vitória soma 1 e derrota tira 1 no mínimo", () => {
  // Diferença enorme arredondaria para zero sem o piso.
  assert.equal(eloDelta(3000, 100, true, 24), 1);
  assert.equal(eloDelta(100, 3000, false, 24), -1);
});

// ---------------------------------------------------------------- dia e semana

test("a chave do dia vira no fuso da arena", () => {
  // 03:00 UTC é ainda meia-noite em Brasília (-3): continua sendo o dia anterior.
  const meiaNoiteBrasilia = Date.UTC(2026, 9, 4, 3, 0, 0);
  assert.equal(arenaDayKey(meiaNoiteBrasilia, -3), "2026-10-04");
  assert.equal(arenaDayKey(meiaNoiteBrasilia - 1, -3), "2026-10-03");
});

test("a chave da semana é ISO e vira na segunda", () => {
  // 2026-10-04 é domingo; 05/10 é segunda e abre a semana seguinte.
  assert.equal(arenaWeekKey(Date.UTC(2026, 9, 4, 12), 0), "2026-W40");
  assert.equal(arenaWeekKey(Date.UTC(2026, 9, 5, 12), 0), "2026-W41");
  assert.equal(arenaWeekKey(Date.UTC(2026, 9, 11, 12), 0), "2026-W41");
  assert.equal(arenaWeekKey(Date.UTC(2026, 9, 12, 12), 0), "2026-W42");
});

test("a semana ISO acerta a virada de ano", () => {
  // 2026-12-31 é quinta: semana 53 de 2026. 2027-01-01 é sexta, ainda na mesma semana.
  assert.equal(arenaWeekKey(Date.UTC(2026, 11, 31, 12), 0), "2026-W53");
  assert.equal(arenaWeekKey(Date.UTC(2027, 0, 1, 12), 0), "2026-W53");
  // 2027-01-04 é segunda: abre a semana 1 de 2027.
  assert.equal(arenaWeekKey(Date.UTC(2027, 0, 4, 12), 0), "2027-W01");
});

// ---------------------------------------------------------------- entradas e faixas

test("o VIP ganha entradas a mais", () => {
  assert.equal(entryBudget(novatos, AJUSTES, 0), 5);
  assert.equal(entryBudget(novatos, AJUSTES, 1), 8);
  assert.equal(entryBudget(novatos, AJUSTES, 2), 11);
});

test("a faixa de nível tranca a arena errada", () => {
  assert.deepEqual(arenasFor(FACTORY_ARENAS, 5).map((a) => a.id), []);
  assert.deepEqual(arenasFor(FACTORY_ARENAS, 20).map((a) => a.id), ["novatos"]);
  assert.deepEqual(arenasFor(FACTORY_ARENAS, 40).map((a) => a.id), ["novatos", "coliseu"]);
  assert.deepEqual(arenasFor(FACTORY_ARENAS, 300).map((a) => a.id), ["campeoes"]);
});

test("teto 0 é sem teto", () => {
  assert.equal(campeoes.maxLevel, 0);
  assert.ok(arenasFor(FACTORY_ARENAS, 9999).some((a) => a.id === "campeoes"));
});

test("a arena desligada não aparece", () => {
  const desligada = FACTORY_ARENAS.map((a) => (a.id === "novatos" ? { ...a, enabled: false } : a));
  assert.deepEqual(arenasFor(desligada, 20).map((a) => a.id), []);
});

// ---------------------------------------------------------------- prêmio semanal

test("o degrau certo pega a posição", () => {
  assert.equal(rewardForRank(premios, "coliseu", 1)?.diamonds, 150);
  assert.equal(rewardForRank(premios, "coliseu", 3)?.diamonds, 75);
  assert.equal(rewardForRank(premios, "coliseu", 10)?.diamonds, 30);
  assert.equal(rewardForRank(premios, "coliseu", 50)?.diamonds, 10);
  assert.equal(rewardForRank(premios, "coliseu", 51), undefined);
});

test("degrau da arena ganha do degrau geral", () => {
  const comEspecifico: ArenaReward[] = [...premios, { id: 99, arena: "coliseu", fromRank: 1, toRank: 1, gold: 1, diamonds: 999, enabled: true }];
  assert.equal(rewardForRank(comEspecifico, "coliseu", 1)?.diamonds, 999);
  assert.equal(rewardForRank(comEspecifico, "novatos", 1)?.diamonds, 150);
});

// ---------------------------------------------------------------- limites do painel

test("o painel não cria faixa vazia", () => {
  const limpa = clampArena({ ...novatos, minLevel: 80, maxLevel: 40 });
  assert.equal(limpa.minLevel, 80);
  assert.equal(limpa.maxLevel, 80, "teto abaixo do piso devia subir para o piso");
});

test("o painel preserva o sem-teto", () => {
  assert.equal(clampArena({ ...campeoes, maxLevel: 0 }).maxLevel, 0);
});

test("o painel recusa número impossível sem explodir", () => {
  const limpa = clampArena({ ...novatos, freeEntries: Number.NaN, entryPrice: -5, rewardGold: 1e12 });
  assert.equal(limpa.freeEntries, 5);
  assert.equal(limpa.entryPrice, 0);
  assert.equal(limpa.rewardGold, 100_000_000);
});
