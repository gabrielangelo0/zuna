import { createEndpoint, createRouter } from "colyseus";
import {
  MAX_CHARACTERS,
  RANKING_BOARDS,
  RANKING_SIZE,
  catalogItem,
  liveVocations,
  normalizeCharacterName,
  normalizeUsername,
  parseAppearance,
  validateCharacterName,
  validatePassword,
  validateUsername,
  type AuthResponse,
  type CharactersResponse,
  type CreateCharacterResponse,
  type RankingBoard,
  type RankingResponse,
} from "@zuna/shared";
import { adminRoutes } from "./adminApi.ts";
import { adminGearRoutes } from "./adminGearApi.ts";
import { adminQuestRoutes } from "./adminQuestApi.ts";
import { adminCheckinRoutes } from "./adminCheckinApi.ts";
import { adminProgressRoutes } from "./adminProgressApi.ts";
import { adminPvpRoutes } from "./adminPvpApi.ts";
import { adminVocationRoutes } from "./adminVocationApi.ts";
import { adminWorldRoutes } from "./adminWorldApi.ts";
import { paymentRoutes } from "./payments.ts";
import {
  accountFromToken,
  allowLoginAttempt,
  bearerToken,
  clearLoginAttempts,
  createSession,
  deleteSession,
  hashPassword,
  verifyPasswordOrDummy,
} from "./auth.ts";
import { publicWorlds } from "./worldRepository.ts";
import {
  createAccount,
  createCharacter,
  findAccountByUsername,
  getAccount,
  listCharacters,
  summaryFromRow,
  topCharacters,
} from "./repository.ts";

// API HTTP de contas e personagens. Erros sempre respondem { message } em português.

const SESSION_EXPIRED = "Sua sessão expirou. Entre novamente.";

function readBody(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

function readCredentials(body: unknown) {
  const data = readBody(body);
  return { username: normalizeUsername(String(data.username ?? "")), password: String(data.password ?? "") };
}

const register = createEndpoint("/api/auth/register", { method: "POST" }, async (ctx) => {
  const { username, password } = readCredentials(ctx.body);
  const problem = validateUsername(username) ?? validatePassword(password);
  if (problem) throw ctx.error("BAD_REQUEST", { message: problem });

  const accountId = await createAccount(username, await hashPassword(password));
  if (accountId === null) throw ctx.error("CONFLICT", { message: "Esse usuário já existe." });

  const response: AuthResponse = { token: await createSession(accountId), username };
  return ctx.json(response);
});

const login = createEndpoint("/api/auth/login", { method: "POST" }, async (ctx) => {
  const { username, password } = readCredentials(ctx.body);
  if (!allowLoginAttempt(username)) {
    throw ctx.error("TOO_MANY_REQUESTS", { message: "Muitas tentativas. Espere alguns minutos e tente de novo." });
  }

  const account = await findAccountByUsername(username);
  const valid = await verifyPasswordOrDummy(password, account?.passwordHash);
  if (!account || !valid) throw ctx.error("UNAUTHORIZED", { message: "Usuário ou senha incorretos." });

  if (account.banned) {
    const reason = account.banReason ? `Esta conta está bloqueada: ${account.banReason}` : "Esta conta está bloqueada.";
    throw ctx.error("UNAUTHORIZED", { message: reason });
  }

  clearLoginAttempts(username);
  const response: AuthResponse = { token: await createSession(account.id), username: account.username };
  return ctx.json(response);
});

const logout = createEndpoint("/api/auth/logout", { method: "POST" }, async (ctx) => {
  const token = bearerToken(ctx.getHeader("authorization"));
  if (token) await deleteSession(token);
  return ctx.json({ ok: true });
});

const listMyCharacters = createEndpoint("/api/characters", { method: "GET" }, async (ctx) => {
  const account = await accountFromToken(bearerToken(ctx.getHeader("authorization")));
  if (!account) throw ctx.error("UNAUTHORIZED", { message: SESSION_EXPIRED });

  const [rows, details] = await Promise.all([listCharacters(account.id), getAccount(account.id)]);
  const response: CharactersResponse = {
    username: account.username,
    diamonds: details?.diamonds ?? 0,
    maxCharacters: MAX_CHARACTERS,
    characters: rows.map(summaryFromRow),
  };
  return ctx.json(response);
});

const createMyCharacter = createEndpoint("/api/characters", { method: "POST" }, async (ctx) => {
  const account = await accountFromToken(bearerToken(ctx.getHeader("authorization")));
  if (!account) throw ctx.error("UNAUTHORIZED", { message: SESSION_EXPIRED });

  const data = readBody(ctx.body);
  const name = normalizeCharacterName(String(data.name ?? ""));
  const nameProblem = validateCharacterName(name);
  if (nameProblem) throw ctx.error("BAD_REQUEST", { message: nameProblem });

  // Na criação só vale roupa gratuita; as outras são compradas dentro do jogo.
  const appearance = parseAppearance(data.appearance);
  if (!appearance || catalogItem(appearance.outfit)?.price !== 0) {
    throw ctx.error("BAD_REQUEST", { message: "Aparência inválida." });
  }

  // A classe é escolhida aqui e vale desde o nível 1; trocar depois custa diamantes.
  const vocation = String(data.vocation ?? "");
  if (vocation && !liveVocations().some((entry) => entry.id === vocation)) {
    throw ctx.error("BAD_REQUEST", { message: "Classe inválida." });
  }

  const result = await createCharacter(account.id, name, appearance, vocation);
  if (!result.ok) throw ctx.error("CONFLICT", { message: result.message });

  const response: CreateCharacterResponse = { character: summaryFromRow(result.row) };
  return ctx.json(response);
});

/** As listas mudam devagar e a tela de login também as pede: uma consulta por lista a cada 30 s basta. */
const RANKING_CACHE_MS = 30_000;
const rankingCache = new Map<RankingBoard, RankingResponse>();

const ranking = createEndpoint("/api/ranking", { method: "GET" }, async (ctx) => {
  const asked = String(ctx.query?.board ?? "level") as RankingBoard;
  const board = RANKING_BOARDS.includes(asked) ? asked : "level";
  const cached = rankingCache.get(board);
  if (cached && Date.now() - cached.updatedAt < RANKING_CACHE_MS) return ctx.json(cached);

  const response: RankingResponse = { board, entries: await topCharacters(board, RANKING_SIZE), updatedAt: Date.now() };
  rankingCache.set(board, response);
  return ctx.json(response);
});

/** Mundos abertos e preços em vigor: o cliente pede isto antes de entrar no jogo. */
const worldsRoute = createEndpoint("/api/worlds", { method: "GET" }, async (ctx) => {
  return ctx.json(await publicWorlds());
});

export const apiRouter = createRouter({
  worldsRoute,
  register,
  login,
  logout,
  listMyCharacters,
  createMyCharacter,
  ranking,
  ...adminRoutes,
  ...adminWorldRoutes,
  ...paymentRoutes,
  ...adminGearRoutes,
  ...adminQuestRoutes,
  ...adminCheckinRoutes,
  ...adminPvpRoutes,
  ...adminProgressRoutes,
  ...adminVocationRoutes,
});
