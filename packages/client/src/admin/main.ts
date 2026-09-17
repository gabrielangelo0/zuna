import "@fontsource/lilita-one/400.css";
import "@fontsource-variable/montserrat/wght.css";
import {
  CATALOG,
  type AdminLogResponse,
  type AdminPlayerRow,
  type AdminPlayersResponse,
  type AuthResponse,
} from "@zuna/shared";
import { ApiError, apiRequest, httpEndpoint } from "../api.ts";

// Painel de administração: lista os jogadores e aplica as mudanças na hora, mesmo em quem está online.

const TOKEN_KEY = "zuna:admin";

const el = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const login = el("#login");
const panel = el("#panel");
const loginForm = el<HTMLFormElement>("#login-form");
const loginError = el("#login-error");
const userLabel = el("#admin-user");
const logoutButton = el<HTMLButtonElement>("#admin-logout");
const search = el<HTMLInputElement>("#search");
const total = el("#total");
const body = el<HTMLTableSectionElement>("#players-body");
const logBody = el<HTMLTableSectionElement>("#log-body");
const toast = el("#toast");

const OUTFITS = CATALOG.filter((item) => item.kind === "outfit");
const ITEMS = CATALOG;

let token = localStorage.getItem(TOKEN_KEY);
let toastTimer = 0;

function notify(message: string, ok = true) {
  toast.textContent = message;
  toast.className = ok ? "ok" : "bad";
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), 3500);
}

function ask<T>(path: string, options: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  return apiRequest<T>(path, { ...options, token });
}

function showLogin(message?: string) {
  token = null;
  localStorage.removeItem(TOKEN_KEY);
  login.hidden = false;
  panel.hidden = true;
  logoutButton.hidden = true;
  userLabel.textContent = "";
  loginError.hidden = !message;
  if (message) loginError.textContent = message;
}

const number = (value: number) => value.toLocaleString("pt-BR");

function numberCell(value: number, onSave: (value: number) => void, wide = false): HTMLTableCellElement {
  const cell = document.createElement("td");
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.value = String(value);
  if (wide) input.className = "wide";
  input.addEventListener("change", () => onSave(Number(input.value)));
  cell.append(input);
  return cell;
}

function row(player: AdminPlayerRow): HTMLTableRowElement {
  const tr = document.createElement("tr");
  const pending: Record<string, number | string> = {};

  // --- conta
  const who = document.createElement("td");
  const wrap = document.createElement("div");
  wrap.className = "who-cell";
  const name = document.createElement("strong");
  name.textContent = player.username;
  const badges = document.createElement("div");
  badges.className = "badges";
  if (player.isAdmin) badges.append(badge("admin", "admin"));
  if (player.banned) badges.append(badge("banned", "bloqueado"));
  if (player.online) badges.append(badge("online", "online"));
  const since = document.createElement("small");
  since.className = "muted";
  since.textContent = `desde ${new Date(player.createdAt).toLocaleDateString("pt-BR")}`;
  wrap.append(name, badges, since);
  who.append(wrap);

  // --- personagem
  const character = document.createElement("td");
  character.textContent = player.name || "—";

  const level = numberCell(player.level, (value) => (pending.level = value));
  const xp = numberCell(player.xp, (value) => (pending.xp = value), true);
  const gold = numberCell(player.gold, (value) => (pending.gold = value), true);
  const diamonds = numberCell(player.diamonds, (value) => (pending.diamonds = value));
  const kills = numberCell(player.kills, (value) => (pending.kills = value));

  // --- classe (a roupa do personagem)
  const outfitCell = document.createElement("td");
  const outfit = document.createElement("select");
  for (const item of OUTFITS) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    option.selected = item.id === player.outfit;
    outfit.append(option);
  }
  outfit.disabled = player.characterId === null;
  outfit.addEventListener("change", () => (pending.outfit = outfit.value));
  outfitCell.append(outfit);

  if (player.characterId === null) {
    for (const cell of [level, xp, gold, kills]) cell.querySelector("input")!.disabled = true;
  }

  // --- ações
  const actions = document.createElement("td");
  const box = document.createElement("div");
  box.className = "actions";

  const save = document.createElement("button");
  save.textContent = "Salvar";
  save.addEventListener("click", () => void apply(player, pending, save));

  const admin = document.createElement("button");
  admin.textContent = player.isAdmin ? "Tirar admin" : "Tornar admin";
  admin.addEventListener("click", () => void account(player, { isAdmin: !player.isAdmin }, admin));

  const ban = document.createElement("button");
  ban.className = player.banned ? "" : "danger";
  ban.textContent = player.banned ? "Desbloquear" : "Bloquear";
  ban.addEventListener("click", () => void account(player, { banned: !player.banned }, ban));

  const unlock = document.createElement("select");
  const head = document.createElement("option");
  head.textContent = "Liberar item…";
  head.value = "";
  unlock.append(head);
  for (const item of ITEMS) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.name} (${item.kind})`;
    unlock.append(option);
  }
  unlock.addEventListener("change", () => {
    if (!unlock.value) return;
    const chosen = unlock.value;
    unlock.value = "";
    void account(player, { unlock: chosen }, unlock);
  });

  box.append(save, admin, ban, unlock);
  actions.append(box);

  tr.append(who, character, level, xp, gold, diamonds, kills, outfitCell, actions);
  return tr;
}

function badge(kind: string, text: string): HTMLElement {
  const span = document.createElement("span");
  span.className = `badge ${kind}`;
  span.textContent = text;
  return span;
}

/** Salva os campos do personagem e, se mexeram nos diamantes, também a conta. */
async function apply(player: AdminPlayerRow, pending: Record<string, number | string>, button: HTMLElement) {
  const { diamonds, ...character } = pending;
  (button as HTMLButtonElement).disabled = true;
  try {
    if (Object.keys(character).length > 0) {
      if (player.characterId === null) throw new ApiError("Essa conta não tem personagem.", 400);
      await ask("/api/admin/character", { method: "POST", body: { characterId: player.characterId, ...character } });
    }
    if (diamonds !== undefined) {
      await ask("/api/admin/account", { method: "POST", body: { accountId: player.accountId, diamonds } });
    }
    notify(`${player.name || player.username}: salvo.`);
    await loadPlayers();
  } catch (error) {
    fail(error);
  } finally {
    (button as HTMLButtonElement).disabled = false;
  }
}

async function account(player: AdminPlayerRow, patch: Record<string, unknown>, control: HTMLElement) {
  (control as HTMLButtonElement | HTMLSelectElement).disabled = true;
  try {
    await ask("/api/admin/account", { method: "POST", body: { accountId: player.accountId, ...patch } });
    notify(`${player.username}: atualizado.`);
    await loadPlayers();
  } catch (error) {
    fail(error);
  } finally {
    (control as HTMLButtonElement | HTMLSelectElement).disabled = false;
  }
}

function fail(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    showLogin("Sua sessão acabou ou a conta não é mais administradora.");
    return;
  }
  notify(error instanceof Error ? error.message : "Algo deu errado.", false);
}

async function loadPlayers() {
  try {
    const query = search.value.trim();
    const data = await ask<AdminPlayersResponse>(`/api/admin/players?q=${encodeURIComponent(query)}&limit=200`);
    userLabel.textContent = `Conectado como ${data.username}`;
    total.textContent = `${number(data.total)} ${data.total === 1 ? "registro" : "registros"}`;
    body.replaceChildren(...data.players.map(row));
    login.hidden = true;
    panel.hidden = false;
    logoutButton.hidden = false;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) showLogin("Entre com uma conta administradora.");
    else fail(error);
  }
}

async function loadLog() {
  try {
    const data = await ask<AdminLogResponse>("/api/admin/log");
    logBody.replaceChildren(
      ...data.entries.map((entry) => {
        const tr = document.createElement("tr");
        for (const text of [
          new Date(entry.at).toLocaleString("pt-BR"),
          entry.admin,
          entry.action,
          entry.target,
          entry.detail,
        ]) {
          const td = document.createElement("td");
          td.textContent = text;
          tr.append(td);
        }
        return tr;
      }),
    );
  } catch (error) {
    fail(error);
  }
}

// ---------------------------------------------------------------- eventos da página

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const username = el<HTMLInputElement>("#login-user").value.trim().toLowerCase();
  const password = el<HTMLInputElement>("#login-pass").value;
  void (async () => {
    try {
      const response = await apiRequest<AuthResponse>("/api/auth/login", { method: "POST", body: { username, password } });
      token = response.token;
      localStorage.setItem(TOKEN_KEY, token);
      el<HTMLInputElement>("#login-pass").value = "";
      loginError.hidden = true;
      await loadPlayers();
    } catch (error) {
      loginError.hidden = false;
      loginError.textContent = error instanceof Error ? error.message : "Não foi possível entrar.";
    }
  })();
});

logoutButton.addEventListener("click", () => showLogin());
el("#reload").addEventListener("click", () => void loadPlayers());
let searchTimer = 0;
search.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => void loadPlayers(), 250);
});

for (const tab of document.querySelectorAll<HTMLButtonElement>(".tab")) {
  tab.addEventListener("click", () => {
    for (const other of document.querySelectorAll(".tab")) other.classList.toggle("active", other === tab);
    const view = tab.dataset.view;
    el("#view-players").hidden = view !== "players";
    el("#view-log").hidden = view !== "log";
    if (view === "log") void loadLog();
  });
}

console.log(`Painel falando com ${httpEndpoint()}`);
if (token) void loadPlayers();
else showLogin();
