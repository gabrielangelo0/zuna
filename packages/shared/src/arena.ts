import { PLAYER_ATTACK_MS } from "./constants.ts";
import { EMPTY_STATS, type GearStats } from "./items.ts";
import { mulberry32 } from "./rng.ts";
import { CRIT_CHANCE, CRIT_MULTIPLIER, SPELL_FAMILIES, healAmount, tierFor } from "./spells.ts";
import { vocationStats } from "./vocations.ts";
import { playerStats } from "./xp.ts";

// Arena assíncrona: o jogador enfrenta uma cópia do personagem de outro, controlada pela IA.
//
// A arena **não é combate ao vivo** — é simulação. Nada aqui conhece sala, tick, posição ou
// caminho: `simulateFight` recebe dois lutadores e uma semente e devolve a luta inteira já
// resolvida, golpe a golpe. O servidor guarda a semente; o cliente anima a reprise.
//
// Por isso **nenhuma função deste arquivo chama `Math.random`**. Um único sorteio fora da
// semente e a reprise mostraria um vencedor diferente do que o servidor gravou — defeito que
// só apareceria quando um jogador reclamasse de ter ganhado na tela e perdido no ranking.

/** Uma praça de arena. Nasce da lista de fábrica e depois é editada no painel. */
export interface ArenaDef {
  /** Chave gravada na classificação ("novatos"). */
  id: string;
  name: string;
  description: string;
  minLevel: number;
  /** Teto da faixa (0 = sem teto). */
  maxLevel: number;
  /** Lutas de graça por dia. */
  freeEntries: number;
  /** Diamantes por uma entrada avulsa (0 = não vende). */
  entryPrice: number;
  /** Ouro e XP da vitória. A derrota paga a metade: sair de mãos vazias ensina a não entrar. */
  rewardGold: number;
  rewardXp: number;
  enabled: boolean;
  sort: number;
}

/**
 * Adversário de mentira, para a arena funcionar com um jogador só.
 *
 * Zuna não tem população: numa lista montada só com gente de verdade, o primeiro jogador abre
 * a arena, vê lista vazia, e o sistema está quebrado no dia do lançamento.
 */
export interface ArenaDummy {
  id: number;
  /** Arena a que pertence (ArenaDef.id). */
  arena: string;
  name: string;
  level: number;
  vocation: string;
  /** Multiplica os atributos do nível: manequim de elite é 1,2. */
  power: number;
  skin: number;
  hairColor: number;
  outfit: string;
  colorPrimary: number;
  colorSecondary: number;
  colorDetail: number;
  enabled: boolean;
}

export interface ArenaSettings {
  /** Desliga a arena inteira sem precisar mexer praça por praça. */
  enabled: boolean;
  /** Pontuação de quem nunca lutou, e para onde a virada de temporada devolve todo mundo. */
  startRating: number;
  /** O K do Elo: quanto uma luta mexe na pontuação. */
  kFactor: number;
  /** Teto de rodadas. Batendo o teto, decide a vida proporcional. */
  maxRounds: number;
  /** Abaixo desta fração da vida, quem sabe curar cura em vez de bater. */
  healAt: number;
  /**
   * Custo da cura como **fração da mana máxima**, e não um número fixo.
   *
   * Medido: com custo fixo de 25 o nível 60 tem mana para 45 curas e a conferência de mana não
   * limita nada; com um teto fixo de curas, a diferença de mana entre as classes desaparece —
   * e era ela a identidade da Druida, que ganhava 0 de 300 do Cavaleiro. Em fração, o poço de
   * mana da classe volta a decidir quantas curas ela tem.
   */
  healManaPct: number;
  /**
   * Multiplica a cura **dentro da arena**.
   *
   * Medido, não escolhido: com 1,0 a cura de um nível 60 vale 449 contra dano de 144, e 277 de
   * 400 lutas terminavam no teto de rodadas com o Cavaleiro de poder 2471 perdendo do
   * Feiticeiro de 1459. No mundo essa cura é justa porque a mana volta devagar e há vários
   * monstros batendo; num duelo ela simplesmente ganha. Mexer aqui exige medir de novo.
   */
  healFactor: number;
  /**
   * Quantas vezes cada lado pode curar na mesma luta.
   *
   * Hoje é só válvula de segurança: o que limita de verdade é `healManaPct`. Fica porque uma
   * classe futura com mana enorme e cura barata não pode virar luta infinita.
   */
  maxHeals: number;
  /**
   * Multiplica a magia **dentro da arena**. Medido junto com `arenaSpell`: ver lá o porquê.
   * Mexer aqui exige medir de novo o ritmo da luta em vários níveis.
   */
  spellFactor: number;
  /** Entradas a mais por degrau de VIP (degrau 2 ganha o dobro disto). */
  vipEntries: number;
  /** Fuso da virada do dia e da semana, igual ao do check-in. */
  offsetHours: number;
}

export const DEFAULT_ARENA_SETTINGS: ArenaSettings = {
  enabled: true,
  startRating: 1000,
  kFactor: 24,
  maxRounds: 60,
  healAt: 0.35,
  healManaPct: 0.12,
  healFactor: 0.6,
  maxHeals: 8,
  spellFactor: 0.5,
  vipEntries: 3,
  offsetHours: -3,
};

/** Degrau de recompensa do ranking semanal: quem terminar entre `fromRank` e `toRank` leva. */
export interface ArenaReward {
  id: number;
  /** Arena a que pertence, ou "" para valer em todas. */
  arena: string;
  fromRank: number;
  toRank: number;
  gold: number;
  diamonds: number;
  enabled: boolean;
}

export const FACTORY_ARENAS: readonly ArenaDef[] = [
  {
    id: "novatos",
    name: "Arena dos Novatos",
    description: "Primeiro sangue. Faixa curta, entrada barata e ninguém grande o bastante para humilhar.",
    minLevel: 10,
    maxLevel: 40,
    freeEntries: 5,
    entryPrice: 10,
    rewardGold: 400,
    rewardXp: 250,
    enabled: true,
    sort: 1,
  },
  {
    id: "coliseu",
    name: "Coliseu de Zuna",
    description: "A praça principal. É aqui que o equipamento aparece e a classe começa a decidir.",
    minLevel: 40,
    maxLevel: 120,
    freeEntries: 5,
    entryPrice: 20,
    rewardGold: 2500,
    rewardXp: 1800,
    enabled: true,
    sort: 2,
  },
  {
    id: "campeoes",
    name: "Arena dos Campeões",
    description: "Sem teto de nível. Menos entradas por dia, prêmio grande e a classificação que todos veem.",
    minLevel: 120,
    maxLevel: 0,
    freeEntries: 3,
    entryPrice: 40,
    rewardGold: 12_000,
    rewardXp: 9000,
    enabled: true,
    sort: 3,
  },
];

/**
 * Manequins de fábrica: um por classe em cada arena, no meio da faixa dela.
 *
 * O nível sai da faixa da arena na semeadura, e não de um número escrito aqui: arena editada
 * no painel para outra faixa continuaria com manequim do nível antigo, e o jogador nível 200
 * encontraria boneco de nível 25 na Arena dos Campeões.
 */
export const FACTORY_DUMMY_NAMES: readonly { vocation: string; name: string; power: number; outfit: string }[] = [
  { vocation: "cavaleiro", name: "Sentinela de Pedra", power: 1, outfit: "guerreiro" },
  { vocation: "paladino", name: "Arqueiro Errante", power: 1, outfit: "cacador" },
  { vocation: "feiticeiro", name: "Chama Vazia", power: 1, outfit: "aventureiro" },
  { vocation: "druida", name: "Guardiã do Bosque", power: 1.1, outfit: "aventureiro" },
];

export const FACTORY_ARENA_REWARDS: readonly Omit<ArenaReward, "id">[] = [
  { arena: "", fromRank: 1, toRank: 1, gold: 50_000, diamonds: 150, enabled: true },
  { arena: "", fromRank: 2, toRank: 3, gold: 25_000, diamonds: 75, enabled: true },
  { arena: "", fromRank: 4, toRank: 10, gold: 10_000, diamonds: 30, enabled: true },
  { arena: "", fromRank: 11, toRank: 50, gold: 3000, diamonds: 10, enabled: true },
];

/** Limites que o painel respeita. */
export const ARENA_NAME_MAX = 32;
export const ARENA_TEXT_MAX = 160;
export const ARENA_MAX_LEVEL = 9999;
export const ARENA_MAX_ENTRIES = 100;
export const ARENA_MAX_PRICE = 100_000;
export const ARENA_MAX_GOLD = 100_000_000;
export const ARENA_MAX_ROUNDS = 500;
export const ARENA_MAX_RATING = 100_000;

// ---------------------------------------------------------------- os lutadores

/** Tudo que a simulação precisa saber de um lado. Nem personagem, nem retrato: só isto. */
export interface ArenaFighter {
  name: string;
  level: number;
  vocation: string;
  maxHp: number;
  maxMana: number;
  maxDamage: number;
  armor: number;
  /** Multiplica a cura e a magia (o fator mágico da classe). */
  magicFactor: number;
  /** A classe dele aprende cura. Sem classe, aprende tudo. */
  canHeal: boolean;
  /** Magias ofensivas que ela usa, da mais forte para a mais fraca (vazio = não usa magia). */
  spells: ArenaSpell[];
}

/** Cadência da cura, igual à da família `heal`. O que limita de verdade é `maxHeals`. */
const HEAL_COOLDOWN_MS = 1000;

/** Um poder ofensivo do jeito que a arena usa. */
export interface ArenaSpell {
  power: number;
  mana: number;
  cooldownMs: number;
}

/**
 * **Todas** as magias ofensivas que esta classe tem neste nível, da mais forte para a mais fraca.
 *
 * Todas, e não só a melhor: o jogador de verdade aperta cada poder quando a recarga vira, e usar
 * só uma penalizava justamente as classes de lista funda. Medido — com só a melhor magia, o
 * Feiticeiro ficava em 37% de vitórias e o Cavaleiro, de três famílias, em 68%.
 *
 * **A força é a do grau 1 da família, de propósito, e não a do grau que o personagem tem.**
 * Medido: a força cresce `1,15^grau` enquanto a vida cresce linear, então com a força de grau
 * cheio a luta durava 7,6 rodadas no nível 15 e 6,8 no nível 200 — e no 200 a magia matava num
 * golpe. Dentro de uma faixa de arena todo mundo tem mais ou menos o mesmo grau, então o que se
 * perde aqui é só a comparação entre faixas, onde o nível maior já ganha por todos os outros
 * caminhos.
 *
 * Magia de área acerta um só na arena: o duelo tem um alvo. É por isso que `radius` não aparece.
 */
export function arenaSpells(vocation: string, level: number): ArenaSpell[] {
  const familias = vocationStats(vocation).families;
  const lista: ArenaSpell[] = [];
  for (const family of SPELL_FAMILIES) {
    if (family.kind === "heal") continue;
    if (familias.length > 0 && !familias.includes(family.family)) continue;
    if (tierFor(family, level) < 1) continue;
    lista.push({ power: family.power, mana: family.mana, cooldownMs: family.cooldownMs });
  }
  // Da mais forte para a mais fraca: no empate de recarga, o jogador lança a que dói mais.
  return lista.sort((a, b) => b.power - a.power);
}

export function arenaFighter(name: string, level: number, vocation: string, gear: GearStats = EMPTY_STATS, power = 1): ArenaFighter {
  const base = playerStats(level, vocation);
  const stats = vocationStats(vocation);
  const magias = arenaSpells(vocation, level);
  const escala = Number.isFinite(power) && power > 0 ? power : 1;
  return {
    name,
    level,
    vocation,
    maxHp: Math.max(1, Math.round((base.maxHp + gear.hp) * escala)),
    maxMana: Math.max(0, Math.round((base.maxMana + gear.mana) * escala)),
    maxDamage: Math.max(1, Math.round((base.maxDamage + gear.attack) * escala)),
    armor: Math.max(0, Math.round((base.armor + gear.defense) * escala)),
    magicFactor: stats.magicFactor,
    // Sem classe, todas as famílias valem — é o jogo de antes das classes.
    canHeal: stats.families.length === 0 || stats.families.includes("heal"),
    spells: magias,
  };
}

/** Um número só para o jogador comparar antes de entrar. Não é usado na luta. */
export function powerScore(fighter: ArenaFighter): number {
  // A magia entra pelo dano por segundo somado de todas: sem isso o número diria que o Cavaleiro
  // é o dobro do Feiticeiro, e a tela mentiria para o jogador antes de ele entrar.
  const dps = fighter.spells.reduce((soma, magia) => soma + magia.power / (magia.cooldownMs / 1000), 0);
  const magia = fighter.maxDamage * dps * fighter.magicFactor;
  return Math.round(fighter.maxHp * 0.5 + fighter.maxDamage * 4 + fighter.armor * 8 + magia * 3);
}

// ---------------------------------------------------------------- a simulação

export type BlowKind = "hit" | "crit" | "block" | "heal" | "spell" | "spellCrit";

/** Um golpe da reprise. Traz a vida dos dois depois dele para a tela não recalcular nada. */
export interface ArenaBlow {
  /** Quem bateu: 0 = desafiante, 1 = adversário. */
  by: 0 | 1;
  kind: BlowKind;
  amount: number;
  hp: [number, number];
  /** Instante simulado, em ms desde o começo da luta. */
  at: number;
}

export interface ArenaFight {
  /** 0 = o desafiante ganhou, 1 = o adversário ganhou. */
  winner: 0 | 1;
  blows: ArenaBlow[];
  rounds: number;
  /** Acabou no teto de rodadas, e não por alguém cair. */
  byTimeout: boolean;
}

/**
 * Resolve a luta inteira. Mesma semente, mesmo resultado — é o que torna a reprise honesta e
 * a regra testável sem subir servidor.
 *
 * A mana **não regenera** durante a luta. Sem isso, dois curandeiros nunca terminam.
 */
export function simulateFight(challenger: ArenaFighter, opponent: ArenaFighter, seed: number, settings: ArenaSettings): ArenaFight {
  const rng = mulberry32(seed);
  const lado = [challenger, opponent];
  const hp = [challenger.maxHp, opponent.maxHp];
  const mana = [challenger.maxMana, opponent.maxMana];
  const curas = [0, 0];
  const blows: ArenaBlow[] = [];

  // A iniciativa sai da semente, não de quem desafiou: com dano alto, bater primeiro decide, e
  // desafiante sempre primeiro faria todo mundo esperar ser desafiado. Vale meia batida, e não
  // uma inteira, para a vantagem existir sem ser a luta.
  const primeiro = rng() < 0.5 ? 0 : 1;
  const atraso = [0, 0];
  atraso[1 - primeiro] = Math.round(PLAYER_ATTACK_MS / 2);

  // Seis linhas de tempo: golpe, magia e cura de cada lado. Separadas porque no jogo cada poder
  // tem a sua própria espera e lançar não gasta o ataque.
  //
  // **A cura tem linha própria, e isto importa:** com uma linha de lançamento só, a espera de
  // 6 s do gelo da Druida bloqueava a cura de 1 s dela, e a classe cujo poder tem recarga longa
  // apanhava de graça — a Druida ganhava 0 de 300 do Cavaleiro por causa disto, e não por
  // equilíbrio.
  const nextAttack = [atraso[0], atraso[1]];
  // Uma recarga por magia, e não uma por lutador: cada poder vira no seu tempo, como no jogo.
  const ready: number[][] = [lado[0].spells.map(() => atraso[0]), lado[1].spells.map(() => atraso[1])];
  const nextHeal = [atraso[0], atraso[1]];

  const limiar = Math.min(1, Math.max(0, settings.healAt));
  // Em fração da mana máxima de cada um: é o que faz o poço de mana da classe valer.
  const custo = [0, 1].map((i) => Math.max(1, Math.round(lado[i].maxMana * Math.max(0, settings.healManaPct))));
  const fator = Math.max(0, settings.healFactor);
  const tetoCuras = Math.max(0, Math.round(settings.maxHeals));
  const fatorMagia = Math.max(0, settings.spellFactor);
  const limite = Math.max(2, Math.round(settings.maxRounds) * 2);

  // Linha que nunca vai produzir nada sai do relógio: deixá-la viva faria o laço girar para
  // sempre adiantando um relógio que nunca gera golpe.
  for (const i of [0, 1] as const) {
    if (!lado[i].canHeal || tetoCuras <= 0) nextHeal[i] = Number.POSITIVE_INFINITY;
  }

  /** A magia deste lado que vira primeiro. A lista é ordenada por força, então empate pega a pior. */
  const proximaMagia = (i: 0 | 1): number => {
    let melhor = -1;
    for (let k = 0; k < ready[i].length; k++) if (melhor < 0 || ready[i][k] < ready[i][melhor]) melhor = k;
    return melhor;
  };

  const bateu = (quem: 0 | 1, at: number, bruto: number, critico: boolean, magia: boolean) => {
    const outro: 0 | 1 = quem === 0 ? 1 : 0;
    const dano = Math.max(0, bruto - lado[outro].armor);
    hp[outro] = Math.max(0, hp[outro] - dano);
    const kind: BlowKind = dano === 0 ? "block" : magia ? (critico ? "spellCrit" : "spell") : critico ? "crit" : "hit";
    blows.push({ by: quem, kind, amount: dano, hp: [hp[0], hp[1]], at });
  };

  // Teto de passos próprio: o laço avança relógios que nem sempre geram golpe (lançamento
  // recusado por mana), e contar só golpes deixaria uma saída sem fecho.
  let passos = 0;
  while (hp[0] > 0 && hp[1] > 0 && blows.length < limite && passos++ < limite * 6) {
    // O evento mais próximo entre as seis linhas. Empate vai para a cura, depois a magia, depois
    // o golpe: estar vivo vale mais do que o dano deste instante.
    let quem: 0 | 1 = 0;
    let acao: "heal" | "cast" | "hit" = "hit";
    let magia = -1;
    let at = Number.POSITIVE_INFINITY;
    for (const i of [0, 1] as const) {
      if (nextAttack[i] < at) { at = nextAttack[i]; quem = i; acao = "hit"; }
      const k = proximaMagia(i);
      if (k >= 0 && ready[i][k] <= at) { at = ready[i][k]; quem = i; acao = "cast"; magia = k; }
      if (nextHeal[i] <= at) { at = nextHeal[i]; quem = i; acao = "heal"; }
    }
    if (!Number.isFinite(at)) break;
    const eu = lado[quem];

    if (acao === "heal") {
      nextHeal[quem] = at + HEAL_COOLDOWN_MS;
      // Vida cheia ou acima do limiar: não gasta a cura, só espera a próxima janela.
      if (hp[quem] >= eu.maxHp * limiar || hp[quem] >= eu.maxHp) continue;
      if (curas[quem] >= tetoCuras || mana[quem] < custo[quem]) {
        nextHeal[quem] = Number.POSITIVE_INFINITY;
        continue;
      }
      mana[quem] -= custo[quem];
      curas[quem]++;
      const bruto = Math.round(healAmount(eu.level) * eu.magicFactor * fator) + Math.floor(rng() * 11);
      const curado = Math.min(bruto, eu.maxHp - hp[quem]);
      hp[quem] += curado;
      blows.push({ by: quem, kind: "heal", amount: curado, hp: [hp[0], hp[1]], at });
      continue;
    }

    if (acao === "cast") {
      const poder = eu.spells[magia];
      ready[quem][magia] = at + poder.cooldownMs;
      if (mana[quem] < poder.mana) continue;
      mana[quem] -= poder.mana;
      const critico = rng() < CRIT_CHANCE;
      // Mesma conta do mundo: dano máximo × força do poder × fator mágico × variação × crítico.
      const bruto = eu.maxDamage * poder.power * eu.magicFactor * fatorMagia * (0.85 + rng() * 0.3);
      bateu(quem, at, Math.round(bruto * (critico ? CRIT_MULTIPLIER : 1)), critico, true);
      continue;
    }

    nextAttack[quem] = at + PLAYER_ATTACK_MS;
    const critico = rng() < CRIT_CHANCE;
    bateu(quem, at, Math.round(eu.maxDamage * (0.35 + rng() * 0.65) * (critico ? CRIT_MULTIPLIER : 1)), critico, false);
  }

  const byTimeout = hp[0] > 0 && hp[1] > 0;
  let winner: 0 | 1;
  if (!byTimeout) {
    winner = hp[0] > 0 ? 0 : 1;
  } else {
    // Empate exato é derrota do desafiante: premiar quem desafiou por chegar ao teto faria do
    // teto de rodadas uma tática em vez de uma válvula de segurança.
    winner = hp[0] / lado[0].maxHp > hp[1] / lado[1].maxHp ? 0 : 1;
  }
  return { winner, blows, rounds: Math.ceil(blows.length / 2), byTimeout };
}

/** Quanto tempo a reprise dura, em ms (para a tela saber antes de começar). */
export function fightDuration(fight: ArenaFight): number {
  return fight.blows.length === 0 ? 0 : fight.blows[fight.blows.length - 1].at + PLAYER_ATTACK_MS;
}

// ---------------------------------------------------------------- pontuação

/**
 * Elo de K fixo. Vitória soma pelo menos 1 e derrota tira pelo menos 1: delta zero faria o
 * jogador lutar dez vezes e ver o ranking parado, que parece defeito mesmo estando certo.
 */
export function eloDelta(mine: number, theirs: number, won: boolean, k: number): number {
  const esperado = 1 / (1 + 10 ** ((theirs - mine) / 400));
  const delta = Math.round(Math.max(1, k) * ((won ? 1 : 0) - esperado));
  return won ? Math.max(1, delta) : Math.min(-1, delta);
}

/** Chave do dia ("2026-10-04") no fuso da arena, igual à do check-in. */
export function arenaDayKey(at: number, offsetHours: number): string {
  return new Date(at + offsetHours * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Chave da semana ISO ("2026-W40") no fuso da arena. É o que marca a temporada.
 *
 * Semana ISO de propósito: começa na segunda e a semana 1 é a da primeira quinta-feira, que é
 * como todo calendário brasileiro conta. Contar "a cada 7 dias desde a epoch" daria uma virada
 * no meio da semana e ninguém entenderia quando o ranking fecha.
 */
export function arenaWeekKey(at: number, offsetHours: number): string {
  const d = new Date(at + offsetHours * 3_600_000);
  const dia = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Quinta-feira da mesma semana ISO: o ano dela é o ano da semana.
  const numeroDoDia = dia.getUTCDay() === 0 ? 7 : dia.getUTCDay();
  dia.setUTCDate(dia.getUTCDate() + 4 - numeroDoDia);
  const ano = dia.getUTCFullYear();
  const primeiro = Date.UTC(ano, 0, 1);
  const semana = Math.floor((dia.getTime() - primeiro) / 86_400_000 / 7) + 1;
  return `${ano}-W${String(semana).padStart(2, "0")}`;
}

/** Entradas de graça que este jogador tem hoje nesta arena, já com o bônus do VIP. */
export function entryBudget(arena: ArenaDef, settings: ArenaSettings, vipRank: number): number {
  const base = Math.max(0, Math.round(arena.freeEntries));
  const bonus = Math.max(0, Math.round(vipRank)) * Math.max(0, Math.round(settings.vipEntries));
  return base + bonus;
}

/** Arenas que este nível pode entrar agora, na ordem do painel. */
export function arenasFor(list: readonly ArenaDef[], level: number): ArenaDef[] {
  return list
    .filter((arena) => arena.enabled && level >= arena.minLevel && (arena.maxLevel <= 0 || level <= arena.maxLevel))
    .sort((a, b) => a.sort - b.sort || a.minLevel - b.minLevel);
}

/** O degrau de recompensa semanal que pega esta posição nesta arena. */
export function rewardForRank(rewards: readonly ArenaReward[], arena: string, rank: number): ArenaReward | undefined {
  // Degrau da arena específica ganha do degrau geral ("") na mesma posição.
  const candidatos = rewards.filter((r) => r.enabled && rank >= r.fromRank && rank <= r.toRank);
  return candidatos.find((r) => r.arena === arena) ?? candidatos.find((r) => r.arena === "");
}

// ---------------------------------------------------------------- limites do painel

function num(value: unknown, padrao: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
}

function text(value: unknown, padrao: string, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : padrao;
}

export function clampArena(arena: ArenaDef): ArenaDef {
  const minLevel = Math.round(num(arena.minLevel, 1, 1, ARENA_MAX_LEVEL));
  // Teto 0 é "sem teto" e passa inteiro; teto abaixo do piso viraria faixa vazia, então sobe.
  const maxLevel = Math.round(num(arena.maxLevel, 0, 0, ARENA_MAX_LEVEL));
  return {
    id: arena.id,
    name: text(arena.name, arena.id, ARENA_NAME_MAX) || arena.id,
    description: text(arena.description, "", ARENA_TEXT_MAX),
    minLevel,
    maxLevel: maxLevel > 0 && maxLevel < minLevel ? minLevel : maxLevel,
    freeEntries: Math.round(num(arena.freeEntries, 5, 0, ARENA_MAX_ENTRIES)),
    entryPrice: Math.round(num(arena.entryPrice, 0, 0, ARENA_MAX_PRICE)),
    rewardGold: Math.round(num(arena.rewardGold, 0, 0, ARENA_MAX_GOLD)),
    rewardXp: Math.round(num(arena.rewardXp, 0, 0, ARENA_MAX_GOLD)),
    enabled: arena.enabled !== false,
    sort: Math.round(num(arena.sort, 0, 0, 999)),
  };
}

export function clampDummy(dummy: ArenaDummy): ArenaDummy {
  return {
    id: dummy.id,
    arena: dummy.arena,
    name: text(dummy.name, "Manequim", ARENA_NAME_MAX) || "Manequim",
    level: Math.round(num(dummy.level, 1, 1, ARENA_MAX_LEVEL)),
    vocation: text(dummy.vocation, "", 24),
    power: num(dummy.power, 1, 0.1, 10),
    skin: Math.round(num(dummy.skin, 0, 0, 15)),
    hairColor: Math.round(num(dummy.hairColor, 0, 0, 15)),
    outfit: text(dummy.outfit, "aventureiro", 32) || "aventureiro",
    colorPrimary: Math.round(num(dummy.colorPrimary, 0, 0, 15)),
    colorSecondary: Math.round(num(dummy.colorSecondary, 0, 0, 15)),
    colorDetail: Math.round(num(dummy.colorDetail, 0, 0, 15)),
    enabled: dummy.enabled !== false,
  };
}

export function clampArenaReward(reward: ArenaReward): ArenaReward {
  const fromRank = Math.round(num(reward.fromRank, 1, 1, ARENA_MAX_RATING));
  const toRank = Math.round(num(reward.toRank, fromRank, 1, ARENA_MAX_RATING));
  return {
    id: reward.id,
    arena: text(reward.arena, "", 32),
    fromRank,
    toRank: Math.max(fromRank, toRank),
    gold: Math.round(num(reward.gold, 0, 0, ARENA_MAX_GOLD)),
    diamonds: Math.round(num(reward.diamonds, 0, 0, ARENA_MAX_PRICE)),
    enabled: reward.enabled !== false,
  };
}

export function clampArenaSettings(change: Partial<ArenaSettings>, atual: ArenaSettings): ArenaSettings {
  return {
    enabled: typeof change.enabled === "boolean" ? change.enabled : atual.enabled,
    startRating: Math.round(num(change.startRating ?? atual.startRating, atual.startRating, 0, ARENA_MAX_RATING)),
    kFactor: Math.round(num(change.kFactor ?? atual.kFactor, atual.kFactor, 1, 200)),
    maxRounds: Math.round(num(change.maxRounds ?? atual.maxRounds, atual.maxRounds, 2, ARENA_MAX_ROUNDS)),
    healAt: num(change.healAt ?? atual.healAt, atual.healAt, 0, 1),
    healManaPct: num(change.healManaPct ?? atual.healManaPct, atual.healManaPct, 0, 1),
    healFactor: num(change.healFactor ?? atual.healFactor, atual.healFactor, 0, 5),
    maxHeals: Math.round(num(change.maxHeals ?? atual.maxHeals, atual.maxHeals, 0, 50)),
    spellFactor: num(change.spellFactor ?? atual.spellFactor, atual.spellFactor, 0, 5),
    vipEntries: Math.round(num(change.vipEntries ?? atual.vipEntries, atual.vipEntries, 0, ARENA_MAX_ENTRIES)),
    offsetHours: Math.round(num(change.offsetHours ?? atual.offsetHours, atual.offsetHours, -14, 14)),
  };
}

// ---------------------------------------------------------------- o que vai para a tela

/** Aparência de um lutador, para a tela desenhar o bonequinho. */
export interface ArenaLook {
  skin: number;
  hairColor: number;
  outfit: string;
  colorPrimary: number;
  colorSecondary: number;
  colorDetail: number;
}

/** Um adversário na lista, ou o próprio jogador. */
export interface ArenaOpponent {
  /** Id do personagem, ou 0 quando é manequim. */
  characterId: number;
  /** Id do manequim, ou 0 quando é gente de verdade. */
  dummyId: number;
  name: string;
  level: number;
  vocation: string;
  /** Número só para comparar na tela. */
  power: number;
  rating: number;
  /** Atributos crus: a tela desenha as barras de vida da reprise com eles. */
  maxHp: number;
  maxDamage: number;
  armor: number;
  look: ArenaLook;
}

export interface ArenaBoardRow {
  rank: number;
  name: string;
  rating: number;
  wins: number;
  losses: number;
  /** É o próprio jogador (para a tela destacar a linha dele). */
  mine: boolean;
}

/** O que o jogador vê ao abrir a arena. */
export interface ArenaEvent {
  enabled: boolean;
  /** Só as arenas que o nível dele alcança. */
  arenas: ArenaDef[];
  /** A arena mostrada agora ("" = nenhuma cabe no nível dele). */
  arena: string;
  opponents: ArenaOpponent[];
  me: ArenaOpponent | null;
  rating: number;
  wins: number;
  losses: number;
  entriesLeft: number;
  entriesTotal: number;
  /** Diamantes da entrada avulsa (0 = não vende). */
  entryPrice: number;
  season: string;
  board: ArenaBoardRow[];
  /** Nível que falta para a arena mais baixa (0 = já alcança alguma). */
  nextLevel: number;
}

/** O resultado de uma luta, com a reprise inteira para a tela animar. */
export interface ArenaFightEvent {
  arena: string;
  me: ArenaOpponent;
  opponent: ArenaOpponent;
  fight: ArenaFight;
  won: boolean;
  /** Era manequim: não mexe na pontuação. */
  dummy: boolean;
  ratingDelta: number;
  rating: number;
  gold: number;
  xp: number;
  entriesLeft: number;
}

/** Prêmio da temporada que acabou, entregue na primeira vez que o jogador volta. */
export interface ArenaSeasonPrize {
  season: string;
  arena: string;
  arenaName: string;
  rank: number;
  gold: number;
  diamonds: number;
}

// ---------------------------------------------------------------- painel

export interface AdminArenaResponse {
  arenas: ArenaDef[];
  dummies: ArenaDummy[];
  rewards: ArenaReward[];
  settings: ArenaSettings;
  /** Temporada em curso. */
  season: string;
  /** Lutas e competidores da temporada em curso. */
  fights: number;
  players: number;
  board: (ArenaBoardRow & { arena: string })[];
}

export interface AdminArenaRequest extends Partial<Omit<ArenaDef, "id">> {
  id: string;
  remove?: boolean;
}

export interface AdminArenaDummyRequest extends Partial<Omit<ArenaDummy, "id">> {
  id: number;
  remove?: boolean;
}

export interface AdminArenaRewardRequest extends Partial<Omit<ArenaReward, "id">> {
  id: number;
  remove?: boolean;
}
