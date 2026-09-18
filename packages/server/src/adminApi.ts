import { createEndpoint } from "colyseus";
import {
  ADMIN_MAX_DIAMONDS,
  ADMIN_MAX_GOLD,
  ADMIN_MAX_LEVEL,
  ADMIN_MAX_MUTE_MIN,
  ADMIN_MAX_SUMMON,
  ADMIN_PAGE_SIZE,
  ADMIN_SORTS,
  MAP_H,
  MAP_W,
  MONSTERS,
  RANKING_SIZE,
  catalogItem,
  normalizeCharacterName,
  validateCharacterName,
  validatePassword,
  type AdminAccountPatch,
  type AdminCharacterPatch,
  type AdminCommandRequest,
  type AdminCommandResponse,
  type AdminDetailResponse,
  type AdminLogResponse,
  type AdminOverviewResponse,
  type AdminPlayersResponse,
  type AdminSort,
  type AdminWorldResponse,
  type MonsterKind,
} from "@zuna/shared";
import {
  adminDays,
  adminDeleteCharacter,
  adminPlayerDetail,
  adminStats,
  adminUpdateAccount,
  adminUpdateCharacter,
  isAdminAccount,
  listAdminActions,
  listPlayersForAdmin,
  logAdminAction,
} from "./adminRepository.ts";
import { accountFromToken, bearerToken, hashPassword } from "./auth.ts";
import {
  announceToWorld,
  applyLiveAccount,
  applyLiveCharacter,
  commandCharacter,
  kickAccount,
  liveWorld,
  onlineCharacterIds,
  runWorldEvent,
  type LiveCommand,
} from "./live.ts";
import { topCharacters } from "./repository.ts";

// Painel de administração: tudo o que o mestre do jogo pode ver e fazer.
// Toda rota exige uma sessão de uma conta marcada como administradora.

const FORBIDDEN = "Acesso restrito ao painel.";

interface Admin {
  id: number;
  username: string;
}

/** Sessão válida de uma conta marcada como administradora, ou null. */
async function adminFrom(authorization: string | null | undefined): Promise<Admin | null> {
  const account = await accountFromToken(bearerToken(authorization));
  if (!account) return null;
  return (await isAdminAccount(account.id)) ? { id: account.id, username: account.username } : null;
}

function readBody(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

function clamp(value: unknown, min: number, max: number): number | undefined {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function text(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\p{Cc}/gu, "")
    .trim()
    .slice(0, max);
}

// ---------------------------------------------------------------- visão geral

const adminOverview = createEndpoint("/api/admin/overview", { method: "GET" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("UNAUTHORIZED", { message: FORBIDDEN });

  const world = liveWorld();
  const [stats, days, top, log] = await Promise.all([
    adminStats(world.players.length),
    adminDays(14),
    topCharacters("level", 8),
    listAdminActions(8),
  ]);
  const response: AdminOverviewResponse = { username: admin.username, stats, days, top, log, world };
  return ctx.json(response);
});

// ---------------------------------------------------------------- jogadores

const adminPlayers = createEndpoint("/api/admin/players", { method: "GET" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("UNAUTHORIZED", { message: FORBIDDEN });

  const query = text(ctx.query?.q, 40);
  const asked = String(ctx.query?.sort ?? "level") as AdminSort;
  const sort = ADMIN_SORTS.includes(asked) ? asked : "level";
  const limit = clamp(ctx.query?.limit ?? ADMIN_PAGE_SIZE, 1, 200) ?? ADMIN_PAGE_SIZE;
  const offset = clamp(ctx.query?.offset ?? 0, 0, 1_000_000) ?? 0;

  const { players, total } = await listPlayersForAdmin(query, sort, limit, offset, onlineCharacterIds());
  const response: AdminPlayersResponse = { players, total, limit, offset, username: admin.username };
  return ctx.json(response);
});

const adminPlayer = createEndpoint("/api/admin/player", { method: "GET" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("UNAUTHORIZED", { message: FORBIDDEN });
  const accountId = clamp(ctx.query?.accountId, 1, 2_000_000_000);
  if (accountId === undefined) throw ctx.error("BAD_REQUEST", { message: "Conta inválida." });

  const detail: AdminDetailResponse | null = await adminPlayerDetail(accountId, onlineCharacterIds());
  if (!detail) throw ctx.error("BAD_REQUEST", { message: "Conta não encontrada." });
  return ctx.json(detail);
});

const adminCharacter = createEndpoint("/api/admin/character", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("UNAUTHORIZED", { message: FORBIDDEN });
  const body = readBody(ctx.body);
  const characterId = clamp(body.characterId, 1, 2_000_000_000);
  if (characterId === undefined) throw ctx.error("BAD_REQUEST", { message: "Personagem inválido." });

  const patch: AdminCharacterPatch = { characterId };
  if (body.name !== undefined) {
    const name = normalizeCharacterName(String(body.name));
    const problem = validateCharacterName(name);
    if (problem) throw ctx.error("BAD_REQUEST", { message: problem });
    patch.name = name;
  }
  if (body.level !== undefined) patch.level = clamp(body.level, 1, ADMIN_MAX_LEVEL);
  if (body.xp !== undefined) patch.xp = clamp(body.xp, 0, Number.MAX_SAFE_INTEGER);
  if (body.gold !== undefined) patch.gold = clamp(body.gold, 0, ADMIN_MAX_GOLD);
  if (body.kills !== undefined) patch.kills = clamp(body.kills, 0, 100_000_000);
  if (body.x !== undefined) patch.x = clamp(body.x, 0, MAP_W - 1);
  if (body.y !== undefined) patch.y = clamp(body.y, 0, MAP_H - 1);
  for (const field of ["outfit", "pet", "mount"] as const) {
    if (body[field] === undefined) continue;
    const id = String(body[field]);
    if (id !== "") {
      const item = catalogItem(id);
      if (!item || item.kind !== field) throw ctx.error("BAD_REQUEST", { message: "Item desconhecido." });
    }
    if (field === "outfit" && id === "") throw ctx.error("BAD_REQUEST", { message: "Escolha uma roupa." });
    patch[field] = id;
  }

  const result = await adminUpdateCharacter(patch);
  if (!result.ok) throw ctx.error("BAD_REQUEST", { message: result.message });
  applyLiveCharacter(characterId, patch);
  await logAdminAction({ accountId: admin.id, action: "personagem", detail: patch, targetCharacterId: characterId });
  return ctx.json({ ok: true });
});

const adminCharacterDelete = createEndpoint("/api/admin/character/delete", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("UNAUTHORIZED", { message: FORBIDDEN });
  const body = readBody(ctx.body);
  const characterId = clamp(body.characterId, 1, 2_000_000_000);
  if (characterId === undefined) throw ctx.error("BAD_REQUEST", { message: "Personagem inválido." });

  // Quem está jogando com ele sai antes, senão a saída grava o personagem de volta.
  commandCharacter(characterId, { kind: "kick", text: "Seu personagem foi apagado por um administrador." });
  const name = await adminDeleteCharacter(characterId);
  if (!name) throw ctx.error("BAD_REQUEST", { message: "Personagem não encontrado." });
  await logAdminAction({ accountId: admin.id, action: "apagou personagem", detail: { characterId, name } });
  return ctx.json({ ok: true, name });
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
  if (body.banReason !== undefined) patch.banReason = text(body.banReason, 120);
  for (const field of ["unlock", "revoke"] as const) {
    if (body[field] === undefined) continue;
    const id = String(body[field]);
    if (!catalogItem(id)) throw ctx.error("BAD_REQUEST", { message: "Item desconhecido." });
    patch[field] = id;
  }

  let passwordHash: string | undefined;
  if (body.password !== undefined) {
    const password = String(body.password);
    const problem = validatePassword(password);
    if (problem) throw ctx.error("BAD_REQUEST", { message: problem });
    passwordHash = await hashPassword(password);
  }

  // Ninguém tira o próprio acesso nem se bloqueia: evita ficar sem administrador.
  if (accountId === admin.id && (patch.isAdmin === false || patch.banned === true)) {
    throw ctx.error("BAD_REQUEST", { message: "Você não pode tirar o próprio acesso." });
  }

  const result = await adminUpdateAccount(patch, passwordHash);
  if (!result.ok) throw ctx.error("BAD_REQUEST", { message: result.message });
  applyLiveAccount(accountId, { diamonds: patch.diamonds, unlock: patch.unlock, revoke: patch.revoke });
  if (patch.banned === true) {
    kickAccount(accountId, patch.banReason ? `Conta bloqueada: ${patch.banReason}` : "Sua conta foi bloqueada.");
  }
  const detail = { ...patch, password: passwordHash ? "trocada" : undefined };
  await logAdminAction({ accountId: admin.id, action: "conta", detail, targetAccountId: accountId });
  return ctx.json({ ok: true });
});

// ---------------------------------------------------------------- mundo e comandos

const adminWorld = createEndpoint("/api/admin/world", { method: "GET" }, async (ctx) => {
  if (!(await adminFrom(ctx.getHeader("authorization")))) throw ctx.error("UNAUTHORIZED", { message: FORBIDDEN });
  const response: AdminWorldResponse = { world: liveWorld() };
  return ctx.json(response);
});

const adminCommand = createEndpoint("/api/admin/command", { method: "POST" }, async (ctx) => {
  const admin = await adminFrom(ctx.getHeader("authorization"));
  if (!admin) throw ctx.error("UNAUTHORIZED", { message: FORBIDDEN });
  const body = readBody(ctx.body) as unknown as AdminCommandRequest;
  const kind = String(body.kind ?? "");
  const characterId = clamp(body.characterId, 1, 2_000_000_000);

  /** Comandos que precisam de alguém online. */
  const toCharacter = async (command: LiveCommand, done: string): Promise<AdminCommandResponse> => {
    if (characterId === undefined) throw ctx.error("BAD_REQUEST", { message: "Escolha um personagem." });
    if (!commandCharacter(characterId, command)) {
      throw ctx.error("BAD_REQUEST", { message: "Esse personagem não está online." });
    }
    await logAdminAction({ accountId: admin.id, action: kind, detail: command, targetCharacterId: characterId });
    return { message: done };
  };

  switch (kind) {
    case "announce": {
      const message = text(body.text, 160);
      if (!message) throw ctx.error("BAD_REQUEST", { message: "Escreva o anúncio." });
      announceToWorld(message);
      await logAdminAction({ accountId: admin.id, action: "anúncio", detail: { text: message } });
      return ctx.json({ message: "Anúncio enviado a todo mundo." } satisfies AdminCommandResponse);
    }
    case "event": {
      const event = body.event === "invasion" ? "invasion" : "xp";
      const result = runWorldEvent(event);
      if (result === "busy") throw ctx.error("BAD_REQUEST", { message: "Já existe um evento em andamento." });
      if (result === "none") throw ctx.error("BAD_REQUEST", { message: "O mundo ainda não está de pé." });
      await logAdminAction({ accountId: admin.id, action: "evento", detail: { event } });
      return ctx.json({
        message: event === "xp" ? "XP em Dobro começou." : "A invasão começou.",
      } satisfies AdminCommandResponse);
    }
    case "stopEvent": {
      const result = runWorldEvent("stop");
      if (result !== "ok") throw ctx.error("BAD_REQUEST", { message: "Não há evento em andamento." });
      await logAdminAction({ accountId: admin.id, action: "encerrou evento", detail: {} });
      return ctx.json({ message: "Evento encerrado." } satisfies AdminCommandResponse);
    }
    case "whisper": {
      const message = text(body.text, 160);
      if (!message) throw ctx.error("BAD_REQUEST", { message: "Escreva o recado." });
      return ctx.json(await toCharacter({ kind: "whisper", text: message }, "Recado entregue."));
    }
    case "kick": {
      const reason = text(body.text, 120) || "Um administrador tirou você do jogo.";
      return ctx.json(await toCharacter({ kind: "kick", text: reason }, "Jogador desconectado."));
    }
    case "teleport": {
      const x = clamp(body.x, 0, MAP_W - 1);
      const y = clamp(body.y, 0, MAP_H - 1);
      if (x === undefined || y === undefined) throw ctx.error("BAD_REQUEST", { message: "Destino inválido." });
      return ctx.json(await toCharacter({ kind: "teleport", x, y }, `Jogador movido para ${x}, ${y}.`));
    }
    case "heal":
      return ctx.json(await toCharacter({ kind: "heal" }, "Vida e mana restauradas."));
    case "summon": {
      const monster = String(body.monster ?? "") as MonsterKind;
      if (!(monster in MONSTERS)) throw ctx.error("BAD_REQUEST", { message: "Monstro desconhecido." });
      const count = clamp(body.count ?? 1, 1, ADMIN_MAX_SUMMON) ?? 1;
      return ctx.json(await toCharacter({ kind: "summon", monster, count }, `${count} ${MONSTERS[monster].name} invocado(s).`));
    }
    case "mute": {
      const minutes = clamp(body.minutes ?? 10, 1, ADMIN_MAX_MUTE_MIN) ?? 10;
      return ctx.json(await toCharacter({ kind: "mute", minutes }, `Jogador silenciado por ${minutes} min.`));
    }
    default:
      throw ctx.error("BAD_REQUEST", { message: "Comando desconhecido." });
  }
});

// ---------------------------------------------------------------- histórico

const adminLog = createEndpoint("/api/admin/log", { method: "GET" }, async (ctx) => {
  if (!(await adminFrom(ctx.getHeader("authorization")))) throw ctx.error("UNAUTHORIZED", { message: FORBIDDEN });
  const response: AdminLogResponse = { entries: await listAdminActions(120, text(ctx.query?.q, 40)) };
  return ctx.json(response);
});

/** Lista de ranking do painel (mesma do jogo, sem o cache de 30 s). */
const adminRanking = createEndpoint("/api/admin/ranking", { method: "GET" }, async (ctx) => {
  if (!(await adminFrom(ctx.getHeader("authorization")))) throw ctx.error("UNAUTHORIZED", { message: FORBIDDEN });
  return ctx.json({ entries: await topCharacters("level", RANKING_SIZE) });
});

export const adminRoutes = {
  adminOverview,
  adminPlayers,
  adminPlayer,
  adminCharacter,
  adminCharacterDelete,
  adminAccountRoute,
  adminWorld,
  adminCommand,
  adminLog,
  adminRanking,
};
