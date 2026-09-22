import "@fontsource-variable/plus-jakarta-sans/wght.css";
import { applyCatalogOverrides, type AuthResponse, type WorldsResponse } from "@zuna/shared";
import { apiRequest, httpEndpoint } from "../api.ts";
import { renderEvents } from "./events.ts";
import { renderGear } from "./gear.ts";
import { renderHistory } from "./history.ts";
import { icon } from "./icons.ts";
import { renderOverview } from "./overview.ts";
import { renderPlayers } from "./players.ts";
import { renderQuests } from "./quests.ts";
import { renderCheckin } from "./checkin.ts";
import { renderProgress } from "./progress.ts";
import { renderVocations } from "./vocations.ts";
import { currentToken, fail, onSessionLost, setAdminName, setToken } from "./session.ts";
import { renderSales } from "./sales.ts";
import { renderShop } from "./shop.ts";
import { el, h } from "./ui.ts";
import { renderWorld, stopWorldRefresh } from "./world.ts";
import { closeWorldEditor, renderWorlds } from "./worlds.ts";

// Painel do mestre: cada tela é escolhida pela barra lateral ou pelas abas.

type View = "overview" | "players" | "world" | "worlds" | "events" | "quests" | "checkin" | "progress" | "vocations" | "gear" | "shop" | "sales" | "history";

const VIEWS: { id: View; label: string; mark: string; render: (root: HTMLElement) => Promise<void> }[] = [
  { id: "overview", label: "Visão Geral", mark: "chart", render: renderOverview },
  { id: "players", label: "Jogadores", mark: "users", render: renderPlayers },
  { id: "world", label: "Mundo Ao Vivo", mark: "globe", render: renderWorld },
  { id: "worlds", label: "Mapas", mark: "map", render: renderWorlds },
  { id: "events", label: "Eventos", mark: "bolt", render: renderEvents },
  { id: "quests", label: "Missões", mark: "scroll", render: renderQuests },
  { id: "checkin", label: "Presente diário", mark: "calendar", render: renderCheckin },
  { id: "progress", label: "Progressão", mark: "level", render: renderProgress },
  { id: "vocations", label: "Classes", mark: "shield", render: renderVocations },
  { id: "gear", label: "Equipamentos", mark: "sword", render: renderGear },
  { id: "shop", label: "Loja", mark: "store", render: renderShop },
  { id: "sales", label: "Vendas", mark: "coin", render: renderSales },
  { id: "history", label: "Histórico", mark: "scroll", render: renderHistory },
];

const login = el("#login");
const panel = el("#panel");
const tabs = el("#tabs");
const sideNav = el("#side-nav");
const loginError = el("#login-error");
const logoutButton = el<HTMLButtonElement>("#admin-logout");

let current: View = "overview";

// --- barra lateral e abas: os dois caminhos levam à mesma tela
sideNav.append(h("div", { class: "nav brand" }, icon("home"), "Painel do Mestre"));
for (const view of VIEWS) {
  sideNav.append(
    h(
      "button",
      { type: "button", class: "nav", "data-view": view.id, onClick: () => void show(view.id) },
      icon(view.mark),
      view.label,
    ),
  );
  tabs.append(
    h(
      "button",
      { type: "button", class: "tab", "data-view": view.id, onClick: () => void show(view.id) },
      icon(view.mark),
      view.label,
    ),
  );
}
logoutButton.append(icon("logout"), "Sair");

async function show(name: View) {
  stopWorldRefresh();
  if (name !== "worlds") closeWorldEditor();
  current = name;
  for (const button of document.querySelectorAll<HTMLElement>("[data-view]")) {
    button.classList.toggle("active", button.dataset.view === name);
  }
  panel.replaceChildren(h("p", { class: "note", text: "Carregando…" }));
  try {
    await VIEWS.find((view) => view.id === name)!.render(panel);
  } catch (error) {
    panel.replaceChildren();
    fail(error);
  }
}

function openPanel() {
  sideNav.classList.remove("locked");
  login.hidden = true;
  tabs.hidden = false;
  logoutButton.hidden = false;
  el("#admin-chip").hidden = false;
  void show(current);
}

function showLogin(message?: string) {
  stopWorldRefresh();
  sideNav.classList.add("locked");
  setToken(null);
  setAdminName("");
  el("#modal").hidden = true;
  el("#dialog").hidden = true;
  panel.replaceChildren();
  login.hidden = false;
  tabs.hidden = true;
  logoutButton.hidden = true;
  el("#admin-chip").hidden = true;
  loginError.hidden = !message;
  if (message) loginError.textContent = message;
}

onSessionLost(showLogin);

el<HTMLFormElement>("#login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const username = el<HTMLInputElement>("#login-user").value.trim().toLowerCase();
  const password = el<HTMLInputElement>("#login-pass").value;
  void (async () => {
    try {
      const response = await apiRequest<AuthResponse>("/api/auth/login", { method: "POST", body: { username, password } });
      setToken(response.token);
      setAdminName(response.username);
      el<HTMLInputElement>("#login-pass").value = "";
      loginError.hidden = true;
      openPanel();
    } catch (error) {
      loginError.hidden = false;
      loginError.textContent = error instanceof Error ? error.message : "Não foi possível entrar.";
    }
  })();
});

logoutButton.addEventListener("click", () => showLogin());

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!el("#dialog").hidden) return;
  el("#modal").hidden = true;
});

// Os preços em vigor deixam as listas do painel iguais às do jogo.
void apiRequest<WorldsResponse>("/api/worlds")
  .then((response) => applyCatalogOverrides(response.catalog))
  .catch(() => undefined);

console.log(`Painel falando com ${httpEndpoint()}`);
if (currentToken()) openPanel();
else showLogin();
