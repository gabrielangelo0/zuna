import { ApiError, apiRequest } from "../api.ts";
import { el } from "./ui.ts";

// Sessão do painel: guarda o token, fala com a API e mostra os avisos.

const TOKEN_KEY = "zuna:admin";

let token = localStorage.getItem(TOKEN_KEY);
let expired: (message?: string) => void = () => {};
let toastTimer = 0;

export function currentToken() {
  return token;
}

export function setToken(value: string | null) {
  token = value;
  if (value) localStorage.setItem(TOKEN_KEY, value);
  else localStorage.removeItem(TOKEN_KEY);
}

/** Chamado quando o servidor recusa o token (sessão vencida ou acesso retirado). */
export function onSessionLost(handler: (message?: string) => void) {
  expired = handler;
}

export function ask<T>(path: string, options: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  return apiRequest<T>(path, { ...options, token });
}

/** Mostra quem está usando o painel na faixa do topo. */
export function setAdminName(name: string) {
  el("#admin-user").textContent = name ? `Mestre ${name}` : "—";
  el("#admin-chip").hidden = !name;
  // O mestre aparece de cavaleiro real: é o visual mais imponente do catálogo.
  el("#admin-face").style.backgroundImage = name ? 'url("/brand/class/cavaleiroReal.png")' : "";
}

export function notify(message: string, ok = true) {
  const toast = el("#toast");
  toast.textContent = message;
  toast.className = ok ? "ok" : "bad";
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), 3800);
}

export function fail(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    expired("Sua sessão acabou ou a conta não é mais administradora.");
    return;
  }
  notify(error instanceof Error ? error.message : "Algo deu errado.", false);
}

/**
 * Roda uma ação do painel: desliga o controle enquanto espera, avisa o erro
 * e devolve se deu certo — quem chamou decide se recarrega a tela.
 */
export async function run(control: HTMLElement | null, action: () => Promise<void>): Promise<boolean> {
  const button = control as HTMLButtonElement | HTMLSelectElement | null;
  if (button) button.disabled = true;
  try {
    await action();
    return true;
  } catch (error) {
    fail(error);
    return false;
  } finally {
    if (button) button.disabled = false;
  }
}
