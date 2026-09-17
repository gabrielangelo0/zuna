export function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Elemento ${selector} não encontrado`);
  return found;
}

export const formatNumber = (value: number) => Math.floor(value).toLocaleString("pt-BR");

export function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Algo deu errado. Tente de novo.";
}
