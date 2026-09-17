import { NAME_MAX_LEN, NAME_MIN_LEN } from "./constants.ts";

// Regras compartilhadas: o cliente mostra o erro na hora, o servidor garante.

export function normalizeCharacterName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function validateCharacterName(name: string): string | null {
  if (name.length < NAME_MIN_LEN || name.length > NAME_MAX_LEN) {
    return `O nome precisa ter de ${NAME_MIN_LEN} a ${NAME_MAX_LEN} caracteres.`;
  }
  if (!/^\p{L}+( \p{L}+)*$/u.test(name)) return "Use apenas letras e espaços simples no nome.";
  return null;
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(username: string): string | null {
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return "O usuário precisa ter de 3 a 20 caracteres: letras sem acento, números ou _.";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 6) return "A senha precisa ter pelo menos 6 caracteres.";
  if (password.length > 72) return "A senha pode ter no máximo 72 caracteres.";
  return null;
}
