import { SERVER_PORT, type ApiErrorBody } from "@game/shared";

const TOKEN_KEY = "rpg:token";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function httpEndpoint(): string {
  const configured = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (configured) return configured.replace(/^ws/, "http");
  return `${location.protocol}//${location.hostname}:${SERVER_PORT}`;
}

export function wsEndpoint(): string {
  return httpEndpoint().replace(/^http/, "ws");
}

export async function apiRequest<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(`${httpEndpoint()}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(
      import.meta.env.DEV
        ? "Não foi possível falar com o servidor. Ele está rodando (npm run dev)?"
        : "Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.",
      0,
    );
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (data as Partial<ApiErrorBody> | null)?.message;
    throw new ApiError(typeof message === "string" && message ? message : "Algo deu errado. Tente de novo.", response.status);
  }
  return data as T;
}

export function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Sem armazenamento disponível: vai pedir login de novo na próxima visita.
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nada a limpar.
  }
}
