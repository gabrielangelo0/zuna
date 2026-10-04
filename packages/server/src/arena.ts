import { and, asc, count, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import {
  DEFAULT_ARENA_SETTINGS,
  FACTORY_ARENAS,
  FACTORY_ARENA_REWARDS,
  FACTORY_DUMMY_NAMES,
  arenaDayKey,
  arenaFighter,
  arenaWeekKey,
  clampArena,
  clampArenaReward,
  clampArenaSettings,
  clampDummy,
  eloDelta,
  entryBudget,
  powerScore,
  rewardForRank,
  simulateFight,
  sumStats,
  gearItem,
  type ArenaBoardRow,
  type ArenaDef,
  type ArenaDummy,
  type ArenaFight,
  type ArenaLook,
  type ArenaOpponent,
  type ArenaReward,
  type ArenaSeasonPrize,
  type ArenaSettings,
  type OwnedItem,
} from "@zuna/shared";
import { db } from "./db/index.ts";
import { accounts, arenaDummies, arenaFights, arenaRewards, arenaSnapshots, arenaStandings, arenas, characters, serverMeta } from "./db/schema.ts";

// A arena assíncrona: lista de adversários, resolução da luta e a temporada da semana.
//
// Nada aqui é combate ao vivo. A luta é resolvida por `simulateFight`, que é função pura em
// @zuna/shared; este arquivo só escolhe quem luta com quem, guarda o resultado e paga.

const SEED_KEY = "arena";
const SETTINGS_KEY = "arena-config";
/** Prefixo da marca de temporada já paga: é o que torna o pagamento idempotente. */
const PAID_PREFIX = "arena-pago-";

let catalog: ArenaDef[] = [];
let dummies: ArenaDummy[] = [];
let rewards: ArenaReward[] = [];
let settings: ArenaSettings = { ...DEFAULT_ARENA_SETTINGS };

async function metaValue(key: string): Promise<string | null> {
  const [row] = await db().select().from(serverMeta).where(eq(serverMeta.key, key)).limit(1);
  return row?.value ?? null;
}

async function setMeta(key: string, value: string) {
  await db()
    .insert(serverMeta)
    .values({ key, value })
    .onConflictDoUpdate({ target: serverMeta.key, set: { value, updatedAt: new Date() } });
}

export async function reloadArena() {
  const linhas = await db().select().from(arenas).orderBy(asc(arenas.sort), asc(arenas.id));
  catalog = linhas.map((row) => clampArena(row as ArenaDef));
  const bonecos = await db().select().from(arenaDummies).orderBy(asc(arenaDummies.arena), asc(arenaDummies.level), asc(arenaDummies.id));
  dummies = bonecos.map((row) => clampDummy(row as ArenaDummy));
  const degraus = await db().select().from(arenaRewards).orderBy(asc(arenaRewards.fromRank), asc(arenaRewards.id));
  rewards = degraus.map((row) => clampArenaReward(row as ArenaReward));
  const raw = await metaValue(SETTINGS_KEY);
  try {
    settings = raw ? clampArenaSettings(JSON.parse(raw) as Partial<ArenaSettings>, DEFAULT_ARENA_SETTINGS) : { ...DEFAULT_ARENA_SETTINGS };
  } catch {
    settings = { ...DEFAULT_ARENA_SETTINGS };
  }
}

/**
 * O nível do manequim sai da faixa da arena, e não de um número escrito na lista de fábrica.
 * Arena editada depois para outra faixa continuaria com boneco do nível antigo, e o jogador
 * nível 200 encontraria manequim de nível 25 na Arena dos Campeões.
 */
function dummyLevelFor(arena: ArenaDef, passo: number): number {
  const teto = arena.maxLevel > 0 ? arena.maxLevel : Math.round(arena.minLevel * 1.6);
  const faixa = Math.max(1, teto - arena.minLevel);
  // Quatro manequins espalhados pela faixa, do começo ao fim dela.
  return Math.max(1, Math.round(arena.minLevel + (faixa * (passo + 1)) / (FACTORY_DUMMY_NAMES.length + 1)));
}

export async function ensureArenaSeed() {
  if ((await metaValue(SEED_KEY)) !== "fabrica-v1") {
    await db()
      .insert(arenas)
      .values(FACTORY_ARENAS.map((arena) => ({ ...arena })));
    const bonecos = FACTORY_ARENAS.flatMap((arena) =>
      FACTORY_DUMMY_NAMES.map((molde, i) => ({
        arena: arena.id,
        name: molde.name,
        level: dummyLevelFor(arena, i),
        vocation: molde.vocation,
        power: molde.power,
        outfit: molde.outfit,
        skin: i % 4,
        hairColor: (i * 3) % 8,
        colorPrimary: (i * 5) % 12,
        colorSecondary: (i * 7) % 12,
        colorDetail: (i * 2) % 12,
        enabled: true,
      })),
    );
    await db().insert(arenaDummies).values(bonecos);
    await db()
      .insert(arenaRewards)
      .values(FACTORY_ARENA_REWARDS.map((degrau) => ({ ...degrau })));
    await setMeta(SEED_KEY, "fabrica-v1");
  }
  await reloadArena();
}

export function arenaList(): ArenaDef[] {
  return catalog;
}

export function arenaById(id: string): ArenaDef | undefined {
  return catalog.find((arena) => arena.id === id);
}

export function arenaDummiesAll(): ArenaDummy[] {
  return dummies;
}

export function arenaRewardsAll(): ArenaReward[] {
  return rewards;
}

export function arenaSettings(): ArenaSettings {
  return settings;
}

export function arenaSeason(agora = Date.now()): string {
  return arenaWeekKey(agora, settings.offsetHours);
}

export function arenaDay(agora = Date.now()): string {
  return arenaDayKey(agora, settings.offsetHours);
}

// ---------------------------------------------------------------- painel

export async function saveArena(arena: ArenaDef) {
  const limpa = clampArena(arena);
  await db()
    .insert(arenas)
    .values(limpa)
    .onConflictDoUpdate({ target: arenas.id, set: { ...limpa } });
  await reloadArena();
}

/** Recusa apagar arena que ainda tem gente competindo: a classificação ficaria órfã. */
export async function removeArena(id: string): Promise<string | null> {
  const [linha] = await db().select({ quantos: count() }).from(arenaStandings).where(eq(arenaStandings.arena, id));
  if ((linha?.quantos ?? 0) > 0) return "Essa arena já tem competidores. Desligue-a em vez de apagar.";
  await db().delete(arenaDummies).where(eq(arenaDummies.arena, id));
  await db().delete(arenas).where(eq(arenas.id, id));
  await reloadArena();
  return null;
}

export async function saveDummy(dummy: ArenaDummy): Promise<number> {
  const limpo = clampDummy(dummy);
  if (limpo.id > 0) {
    await db().update(arenaDummies).set({ ...limpo, id: undefined as never }).where(eq(arenaDummies.id, limpo.id));
    await reloadArena();
    return limpo.id;
  }
  const [criado] = await db()
    .insert(arenaDummies)
    .values({ ...limpo, id: undefined as never })
    .returning({ id: arenaDummies.id });
  await reloadArena();
  return criado.id;
}

export async function removeDummy(id: number) {
  await db().delete(arenaDummies).where(eq(arenaDummies.id, id));
  await reloadArena();
}

export async function saveArenaReward(reward: ArenaReward): Promise<number> {
  const limpo = clampArenaReward(reward);
  if (limpo.id > 0) {
    await db().update(arenaRewards).set({ ...limpo, id: undefined as never }).where(eq(arenaRewards.id, limpo.id));
    await reloadArena();
    return limpo.id;
  }
  const [criado] = await db()
    .insert(arenaRewards)
    .values({ ...limpo, id: undefined as never })
    .returning({ id: arenaRewards.id });
  await reloadArena();
  return criado.id;
}

export async function removeArenaReward(id: number) {
  await db().delete(arenaRewards).where(eq(arenaRewards.id, id));
  await reloadArena();
}

export async function saveArenaSettings(change: Partial<ArenaSettings>) {
  settings = clampArenaSettings(change, settings);
  await setMeta(SETTINGS_KEY, JSON.stringify(settings));
}

// ---------------------------------------------------------------- o retrato

export interface SnapshotWrite {
  characterId: number;
  name: string;
  level: number;
  vocation: string;
  items: readonly OwnedItem[];
  look: ArenaLook;
}

/**
 * Grava o retrato do personagem. Chamado quando ele **abre** a arena e a cada luta dele —
 * nunca quando ele é escolhido como adversário, senão abrir a arena viraria uma escrita por
 * adversário listado.
 *
 * Retrato que nunca atualiza congela o jogador forte como adversário fraco, e a arena passa a
 * mentir sobre quem investiu: o oposto do propósito do sistema.
 */
export async function refreshSnapshot(write: SnapshotWrite) {
  const gear = sumStats(write.items.filter((item) => item.equipped !== "").map((item) => gearItem(item.itemId)));
  const linha = {
    characterId: write.characterId,
    name: write.name,
    level: write.level,
    vocation: write.vocation,
    gearAttack: gear.attack,
    gearDefense: gear.defense,
    gearHp: gear.hp,
    gearMana: gear.mana,
    ...write.look,
    updatedAt: new Date(),
  };
  await db()
    .insert(arenaSnapshots)
    .values(linha)
    .onConflictDoUpdate({ target: arenaSnapshots.characterId, set: { ...linha } });
}

type SnapshotRow = typeof arenaSnapshots.$inferSelect;

function lookOfRow(row: { skin: number; hairColor: number; outfit: string; colorPrimary: number; colorSecondary: number; colorDetail: number }): ArenaLook {
  return {
    skin: row.skin,
    hairColor: row.hairColor,
    outfit: row.outfit,
    colorPrimary: row.colorPrimary,
    colorSecondary: row.colorSecondary,
    colorDetail: row.colorDetail,
  };
}

function fighterOfSnapshot(row: SnapshotRow) {
  return arenaFighter(row.name, row.level, row.vocation, {
    attack: row.gearAttack,
    defense: row.gearDefense,
    hp: row.gearHp,
    mana: row.gearMana,
  });
}

function fighterOfDummy(dummy: ArenaDummy) {
  return arenaFighter(dummy.name, dummy.level, dummy.vocation, undefined, dummy.power);
}

// ---------------------------------------------------------------- pareamento

/**
 * A lista de adversários: **gente de verdade primeiro, manequim para completar.**
 *
 * Contas bloqueadas ficam fora: o jogador banido não deve seguir aparecendo como adversário.
 */
export async function arenaOpponents(arena: ArenaDef, characterId: number, season: string, quantos = 6): Promise<ArenaOpponent[]> {
  const teto = arena.maxLevel > 0 ? arena.maxLevel : 999_999;
  const linhas = await db()
    .select({ snap: arenaSnapshots })
    .from(arenaSnapshots)
    .innerJoin(characters, eq(characters.id, arenaSnapshots.characterId))
    .innerJoin(accounts, eq(accounts.id, characters.accountId))
    .where(
      and(
        ne(arenaSnapshots.characterId, characterId),
        gte(arenaSnapshots.level, arena.minLevel),
        lte(arenaSnapshots.level, teto),
        eq(accounts.banned, false),
      ),
    )
    .orderBy(desc(arenaSnapshots.updatedAt))
    .limit(quantos * 4);

  const pontuacoes = await ratingsOf(
    arena.id,
    season,
    linhas.map((linha) => linha.snap.characterId),
  );
  const gente: ArenaOpponent[] = linhas.map((linha) => {
    const lutador = fighterOfSnapshot(linha.snap);
    return {
      characterId: linha.snap.characterId,
      dummyId: 0,
      name: linha.snap.name,
      level: linha.snap.level,
      vocation: linha.snap.vocation,
      power: powerScore(lutador),
      rating: pontuacoes.get(linha.snap.characterId) ?? settings.startRating,
      maxHp: lutador.maxHp,
      maxDamage: lutador.maxDamage,
      armor: lutador.armor,
      look: lookOfRow(linha.snap),
    };
  });

  // Perto na pontuação primeiro: é o que faz a luta valer a pena para os dois lados.
  const minha = (await ratingsOf(arena.id, season, [characterId])).get(characterId) ?? settings.startRating;
  gente.sort((a, b) => Math.abs(a.rating - minha) - Math.abs(b.rating - minha));
  const lista = gente.slice(0, quantos);

  if (lista.length < quantos) {
    const bonecos = dummies.filter((dummy) => dummy.enabled && dummy.arena === arena.id);
    for (const dummy of bonecos) {
      if (lista.length >= quantos) break;
      const lutador = fighterOfDummy(dummy);
      lista.push({
        characterId: 0,
        dummyId: dummy.id,
        name: dummy.name,
        level: dummy.level,
        vocation: dummy.vocation,
        power: powerScore(lutador),
        rating: 0,
        maxHp: lutador.maxHp,
        maxDamage: lutador.maxDamage,
        armor: lutador.armor,
        look: lookOfRow(dummy),
      });
    }
  }
  return lista;
}

async function ratingsOf(arena: string, season: string, ids: readonly number[]): Promise<Map<number, number>> {
  const mapa = new Map<number, number>();
  if (ids.length === 0) return mapa;
  const linhas = await db()
    .select()
    .from(arenaStandings)
    .where(and(eq(arenaStandings.arena, arena), eq(arenaStandings.season, season), inArray(arenaStandings.characterId, [...ids])));
  for (const linha of linhas) mapa.set(linha.characterId, linha.rating);
  return mapa;
}

// ---------------------------------------------------------------- a posição na temporada

export interface Standing {
  rating: number;
  wins: number;
  losses: number;
  entryDay: string;
  entriesUsed: number;
}

/** A linha do personagem nesta arena nesta temporada, criada na hora se ainda não existir. */
export async function standingOf(arena: string, season: string, characterId: number): Promise<Standing> {
  const [linha] = await db()
    .select()
    .from(arenaStandings)
    .where(and(eq(arenaStandings.arena, arena), eq(arenaStandings.season, season), eq(arenaStandings.characterId, characterId)))
    .limit(1);
  if (linha) {
    return { rating: linha.rating, wins: linha.wins, losses: linha.losses, entryDay: linha.entryDay, entriesUsed: linha.entriesUsed };
  }
  return { rating: settings.startRating, wins: 0, losses: 0, entryDay: "", entriesUsed: 0 };
}

async function writeStanding(arena: string, season: string, characterId: number, valor: Standing) {
  const linha = { arena, season, characterId, ...valor, updatedAt: new Date() };
  const [existe] = await db()
    .select({ id: arenaStandings.id })
    .from(arenaStandings)
    .where(and(eq(arenaStandings.arena, arena), eq(arenaStandings.season, season), eq(arenaStandings.characterId, characterId)))
    .limit(1);
  if (existe) await db().update(arenaStandings).set(linha).where(eq(arenaStandings.id, existe.id));
  else await db().insert(arenaStandings).values(linha);
}

/** Entradas que sobraram hoje. O dia virou, a conta zera. */
export function entriesLeft(arena: ArenaDef, standing: Standing, vipRank: number, dia: string): number {
  const total = entryBudget(arena, settings, vipRank);
  const gastas = standing.entryDay === dia ? standing.entriesUsed : 0;
  return Math.max(0, total - gastas);
}

export function entriesTotal(arena: ArenaDef, vipRank: number): number {
  return entryBudget(arena, settings, vipRank);
}

// ---------------------------------------------------------------- a luta

export interface FightRequest {
  arena: ArenaDef;
  season: string;
  dia: string;
  characterId: number;
  /** Quem desafiou, montado do retrato dele mesmo. */
  me: ArenaOpponent;
  opponent: ArenaOpponent;
  vipRank: number;
  /** O jogador pagou entrada avulsa em diamantes: não desconta das de graça. */
  paid: boolean;
}

export interface FightOutcome {
  fight: ArenaFight;
  won: boolean;
  dummy: boolean;
  ratingDelta: number;
  rating: number;
  gold: number;
  xp: number;
  entriesLeft: number;
  seed: number;
}

/**
 * Resolve a luta e grava tudo. A derrota paga metade: sair de mãos vazias ensina a não entrar.
 *
 * **Manequim não mexe na pontuação** — só paga ouro e XP. Sem essa regra o ranking semanal é
 * uma lista de quem moeu mais boneco, e a competição morre na primeira semana.
 */
export async function resolveFight(pedido: FightRequest): Promise<FightOutcome | string> {
  const { arena, season, dia, characterId } = pedido;
  const standing = await standingOf(arena.id, season, characterId);
  const sobraram = entriesLeft(arena, standing, pedido.vipRank, dia);
  if (!pedido.paid && sobraram <= 0) return "Suas entradas de hoje acabaram.";

  const dummy = pedido.opponent.dummyId > 0;
  const meuRetrato = await snapshotOf(characterId);
  if (!meuRetrato) return "Não achei o seu retrato na arena. Abra a arena de novo.";
  const eu = fighterOfSnapshot(meuRetrato);

  let adversario;
  if (dummy) {
    const boneco = dummies.find((d) => d.id === pedido.opponent.dummyId && d.enabled && d.arena === arena.id);
    if (!boneco) return "Esse adversário não está mais disponível.";
    adversario = fighterOfDummy(boneco);
  } else {
    const retrato = await snapshotOf(pedido.opponent.characterId);
    if (!retrato) return "Esse adversário não está mais disponível.";
    adversario = fighterOfSnapshot(retrato);
  }

  // A semente é sorteada aqui e gravada: é o que permite rever a mesma luta depois.
  const seed = Math.floor(Math.random() * 2_147_483_647);
  const fight = simulateFight(eu, adversario, seed, settings);
  const won = fight.winner === 0;

  let ratingDelta = 0;
  let rating = standing.rating;
  if (!dummy) {
    ratingDelta = eloDelta(standing.rating, pedido.opponent.rating, won, settings.kFactor);
    rating = Math.max(0, standing.rating + ratingDelta);
  }

  // Derrota paga metade. Manequim paga metade também: moer boneco não pode ser o melhor caminho.
  const fatia = (won ? 1 : 0.5) * (dummy ? 0.5 : 1);
  const gold = Math.round(arena.rewardGold * fatia);
  const xp = Math.round(arena.rewardXp * fatia);

  const gastas = (standing.entryDay === dia ? standing.entriesUsed : 0) + (pedido.paid ? 0 : 1);
  await writeStanding(arena.id, season, characterId, {
    rating,
    wins: standing.wins + (won ? 1 : 0),
    losses: standing.losses + (won ? 0 : 1),
    entryDay: dia,
    entriesUsed: gastas,
  });
  await db().insert(arenaFights).values({
    arena: arena.id,
    season,
    challengerId: characterId,
    challengerName: pedido.me.name,
    opponentId: dummy ? 0 : pedido.opponent.characterId,
    dummyId: dummy ? pedido.opponent.dummyId : 0,
    opponentName: pedido.opponent.name,
    seed,
    won,
    ratingDelta,
  });

  const depois = await standingOf(arena.id, season, characterId);
  return { fight, won, dummy, ratingDelta, rating, gold, xp, entriesLeft: entriesLeft(arena, depois, pedido.vipRank, dia), seed };
}

async function snapshotOf(characterId: number): Promise<SnapshotRow | undefined> {
  const [linha] = await db().select().from(arenaSnapshots).where(eq(arenaSnapshots.characterId, characterId)).limit(1);
  return linha;
}

/** O retrato do jogador virado em adversário, para a tela comparar poder antes de entrar. */
export async function selfOpponent(characterId: number, arena: string, season: string): Promise<ArenaOpponent | null> {
  const retrato = await snapshotOf(characterId);
  if (!retrato) return null;
  const standing = await standingOf(arena, season, characterId);
  const lutador = fighterOfSnapshot(retrato);
  return {
    characterId,
    dummyId: 0,
    name: retrato.name,
    level: retrato.level,
    vocation: retrato.vocation,
    power: powerScore(lutador),
    rating: standing.rating,
    maxHp: lutador.maxHp,
    maxDamage: lutador.maxDamage,
    armor: lutador.armor,
    look: lookOfRow(retrato),
  };
}

// ---------------------------------------------------------------- classificação

export async function arenaBoard(arena: string, season: string, characterId: number, limit = 20): Promise<ArenaBoardRow[]> {
  const linhas = await db()
    .select({ standing: arenaStandings, nome: arenaSnapshots.name })
    .from(arenaStandings)
    .leftJoin(arenaSnapshots, eq(arenaSnapshots.characterId, arenaStandings.characterId))
    .where(and(eq(arenaStandings.arena, arena), eq(arenaStandings.season, season)))
    .orderBy(desc(arenaStandings.rating), desc(arenaStandings.wins), asc(arenaStandings.id))
    .limit(Math.min(200, Math.max(1, limit)));
  return linhas.map((linha, i) => ({
    rank: i + 1,
    name: linha.nome ?? "?",
    rating: linha.standing.rating,
    wins: linha.standing.wins,
    losses: linha.standing.losses,
    mine: linha.standing.characterId === characterId,
  }));
}

/** A classificação de todas as arenas da temporada, para o painel. */
export async function arenaBoardAll(season: string, limit = 60): Promise<(ArenaBoardRow & { arena: string })[]> {
  const saida: (ArenaBoardRow & { arena: string })[] = [];
  for (const arena of catalog) {
    const linhas = await arenaBoard(arena.id, season, 0, limit);
    for (const linha of linhas) saida.push({ ...linha, arena: arena.id });
  }
  return saida;
}

export async function arenaCounts(season: string): Promise<{ fights: number; players: number }> {
  const [lutas] = await db().select({ quantos: count() }).from(arenaFights).where(eq(arenaFights.season, season));
  const [gente] = await db()
    .select({ quantos: sql<number>`count(distinct ${arenaStandings.characterId})` })
    .from(arenaStandings)
    .where(eq(arenaStandings.season, season));
  return { fights: Number(lutas?.quantos ?? 0), players: Number(gente?.quantos ?? 0) };
}

// ---------------------------------------------------------------- virada de temporada

/**
 * Paga o ranking da temporada que acabou e devolve o que este personagem levou.
 *
 * **Idempotente de propósito.** O servidor reinicia, e um pagamento que roda duas vezes é
 * diamante criado do nada. A marca `arena-pago-<arena>-<temporada>` fica no banco; quem chegar
 * depois dela não paga ninguém.
 *
 * A virada acontece aqui, na primeira vez que alguém abre a arena depois de a semana virar, e
 * não num agendador: agendador é infraestrutura a mais para um ganho que ninguém percebe.
 */
export async function settleSeasons(agora: number, characterId: number): Promise<ArenaSeasonPrize[]> {
  const atual = arenaSeason(agora);
  // Só as temporadas em que este personagem competiu e ainda não recebeu: varrer o servidor
  // inteiro a cada abertura de arena seria trabalho por nada.
  const pendentes = await db()
    .select()
    .from(arenaStandings)
    .where(and(eq(arenaStandings.characterId, characterId), ne(arenaStandings.season, atual), eq(arenaStandings.paid, false)))
    .limit(20);
  if (pendentes.length === 0) return [];

  const meus: ArenaSeasonPrize[] = [];
  for (const linha of pendentes) {
    const arena = arenaById(linha.arena);
    // A arena foi apagada do painel: marca como paga para não voltar a aparecer toda abertura.
    if (!arena) {
      await db().update(arenaStandings).set({ paid: true }).where(eq(arenaStandings.id, linha.id));
      continue;
    }
    const mapa = await closeSeason(arena, linha.season);
    // Marca como pago **antes** de devolver: quem receber o prêmio credita depois, e repetir a
    // abertura da arena não pode pagar de novo.
    await db().update(arenaStandings).set({ paid: true }).where(eq(arenaStandings.id, linha.id));
    const meu = mapa[String(characterId)];
    if (meu) meus.push(meu);
  }
  return meus;
}

/**
 * Fecha a tabela de uma temporada e devolve quem ganhou o quê, por id de personagem.
 *
 * **Idempotente de propósito.** O servidor reinicia, e uma tabela recalculada depois de alguém
 * já ter recebido daria prêmio diferente para quem chegasse depois. A marca
 * `arena-pago-<arena>-<temporada>` congela a tabela; quem chegar depois dela lê, não recalcula.
 */
async function closeSeason(arena: ArenaDef, season: string): Promise<Record<string, ArenaSeasonPrize>> {
  const marca = `${PAID_PREFIX}${arena.id}-${season}`;
  const guardado = await metaValue(marca);
  if (guardado) {
    try {
      return JSON.parse(guardado) as Record<string, ArenaSeasonPrize>;
    } catch {
      // Marca corrompida: recalcula uma vez e regrava, em vez de deixar a temporada sem prêmio.
    }
  }
  const linhas = await db()
    .select({ characterId: arenaStandings.characterId })
    .from(arenaStandings)
    .where(and(eq(arenaStandings.arena, arena.id), eq(arenaStandings.season, season)))
    .orderBy(desc(arenaStandings.rating), desc(arenaStandings.wins), asc(arenaStandings.id))
    .limit(200);
  const mapa: Record<string, ArenaSeasonPrize> = {};
  for (let i = 0; i < linhas.length; i++) {
    const degrau = rewardForRank(rewards, arena.id, i + 1);
    if (!degrau || (degrau.gold <= 0 && degrau.diamonds <= 0)) continue;
    mapa[String(linhas[i].characterId)] = {
      season,
      arena: arena.id,
      arenaName: arena.name,
      rank: i + 1,
      gold: degrau.gold,
      diamonds: degrau.diamonds,
    };
  }
  await setMeta(marca, JSON.stringify(mapa));
  return mapa;
}
