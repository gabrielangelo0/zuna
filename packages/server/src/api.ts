import { createEndpoint, createRouter } from "colyseus";
import {
  ADMIN_MAX_DIAMONDS,
  ADMIN_MAX_GOLD,
  ADMIN_MAX_LEVEL,
  MAX_CHARACTERS,
  RANKING_BOARDS,
  RANKING_SIZE,
  catalogItem,
  normalizeCharacterName,
  normalizeUsername,
  parseAppearance,
  validateCharacterName,
  validatePassword,
  validateUsername,
  type AuthResponse,
  type CharactersResponse,
  type AdminAccountPatch,
  type AdminCharacterPatch,
  type AdminLogResponse,
  type AdminPlayersResponse,
  type CreateCharacterResponse,
  type RankingBoard,
  type RankingResponse,
} from "@zuna/shared";
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
import { applyLiveAccount, applyLiveCharacter, kickAccount, onlineCharacterIds } from "./live.ts";
import {
  adminUpdateAccount,
  adminUpdateCharacter,
  createAccount,
  createCharacter,
  findAccountByUsername,
  getAccount,
  isAdminAccount,
  listAdminActions,
  listCharacters,
  listPlayersForAdmin,
  logAdminAction,
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

  if (account.banned) throw ctx.error("UNAUTHORIZED", { message: "Esta conta está bloqueada." });

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

  const result = await createCharacter(account.id, name, appearance);
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

// ---------------------------------------------------------------- painel de administração

const FORBIDDEN = "Acesso restrito ao painel.";

/** Sessão válida de uma conta marcada como administradora, ou null. */
async function adminFrom(authorization: string | null | undefined) {
  const account = await accountFromToken(bearerToken(authorization));
  if (!account) return null;
  return (await isAdminAccount(account.id)) ? account : null;
}

function clamp(value: unknown, min: number, max: number): number | undefined {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.min(max, Math.max(min, Math.round(number)));
}

const adminPlayers = createEndpoint("/api/admin/players", { method: "GET" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("UNAUTHORIZED", { message: FORBIDDEN });
  const query = String(ctx.query?.q ?? "").slice(0, 40);
  const limit = clamp(ctx.query?.limit ?? 50, 1, 200) ?? 50;
  const offset = clamp(ctx.query?.offset ?? 0, 0, 1_000_000) ?? 0;
  const { players, total } = await listPlayersForAdmin(query, limit, offset, onlineCharacterIds());
  const response: AdminPlayersResponse = { players, total, username: admin.username };
  return ctx.json(response);
});

const adminCharacter = createEndpoint("/api/admin/character", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("UNAUTHORIZED", { message: FORBIDDEN });
  const body = readBody(ctx.body);
  const characterId = clamp(body.characterId, 1, 2_000_000_000);
  if (characterId === undefined) throw ctx.error("BAD_REQUEST", { message: "Personagem inválido." });

  const patch: AdminCharacterPatch = { characterId };
  if (body.level !== undefined) patch.level = clamp(body.level, 1, ADMIN_MAX_LEVEL);
  if (body.xp !== undefined) patch.xp = clamp(body.xp, 0, Number.MAX_SAFE_INTEGER);
  if (body.gold !== undefined) patch.gold = clamp(body.gold, 0, ADMIN_MAX_GOLD);
  if (body.kills !== undefined) patch.kills = clamp(body.kills, 0, 100_000_000);
  if (body.outfit !== undefined) {
    const outfit = String(body.outfit);
    const item = catalogItem(outfit);
    if (!item || item.kind !== "outfit") throw ctx.error("BAD_REQUEST", { message: "Roupa desconhecida." });
    patch.outfit = outfit;
  }

  const ok = await adminUpdateCharacter(patch);
  if (!ok) throw ctx.error("BAD_REQUEST", { message: "Personagem não encontrado." });
  applyLiveCharacter(characterId, patch);
  await logAdminAction({ accountId: admin.id, action: "personagem", detail: patch, targetCharacterId: characterId });
  return ctx.json({ ok: true });
});

const adminAccountRoute = createEndpoint("/api/admin/account", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("UNAUTHORIZED", { message: FORBIDDEN });
  const body = readBody(ctx.body);
  const accountId = clamp(body.accountId, 1, 2_000_000_000);
  if (accountId === undefined) throw ctx.error("BAD_REQUEST", { message: "Conta inválida." });

  const patch: AdminAccountPatch = { accountId };
  if (body.diamonds !== undefined) patch.diamonds = clamp(body.diamonds, 0, ADMIN_MAX_DIAMONDS);
  if (body.isAdmin !== undefined) patch.isAdmin = body.isAdmin === true;
  if (body.banned !== undefined) patch.banned = body.banned === true;
  if (body.unlock !== undefined) {
    const unlock = String(body.unlock);
    if (!catalogItem(unlock)) throw ctx.error("BAD_REQUEST", { message: "Item desconhecido." });
    patch.unlock = unlock;
  }
  // Ninguém tira o próprio acesso nem se bloqueia: evita ficar sem administrador.
  if (accountId === admin.id && (patch.isAdmin === false || patch.banned === true)) {
    throw ctx.error("BAD_REQUEST", { message: "Você não pode tirar o próprio acesso." });
  }

  const ok = await adminUpdateAccount(patch);
  if (!ok) throw ctx.error("BAD_REQUEST", { message: "Conta não encontrada." });
  applyLiveAccount(accountId, { diamonds: patch.diamonds, unlock: patch.unlock });
  if (patch.banned === true) kickAccount(accountId, "Sua conta foi bloqueada por um administrador.");
  await logAdminAction({ accountId: admin.id, action: "conta", detail: patch, targetAccountId: accountId });
  return ctx.json({ ok: true });
});

const adminLog = createEndpoint("/api/admin/log", { method: "GET" }, async (ctx) => {
  if (!(await adminFrom(ctx.getHeader("authorization")))) throw ctx.error("UNAUTHORIZED", { message: FORBIDDEN });
  const response: AdminLogResponse = { entries: await listAdminActions(80) };
  return ctx.json(response);
});

export const apiRouter = createRouter({
  register,
  login,
  logout,
  listMyCharacters,
  createMyCharacter,
  ranking,
  adminPlayers,
  adminCharacter,
  adminAccountRoute,
  adminLog,
});
