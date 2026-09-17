import { RANKING_BOARDS, type RankingBoard, type RankingResponse } from "@zuna/shared";
import { apiRequest } from "./api.ts";
import { element, formatNumber, messageOf } from "./dom.ts";

// Ranking: painel dentro do jogo (tecla R) e a lista curta na tela de login.

const LABEL: Record<RankingBoard, { tab: string; unit: string }> = {
  level: { tab: "Nível", unit: "XP" },
  gold: { tab: "Ouro", unit: "🪙" },
  kills: { tab: "Caçadas", unit: "monstros" },
};

/** O servidor atualiza as listas a cada 30 s; não adianta pedir mais que isso. */
const CACHE_MS = 30_000;
const cache = new Map<RankingBoard, { at: number; data: RankingResponse }>();

async function board(name: RankingBoard): Promise<RankingResponse> {
  const cached = cache.get(name);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;
  const data = await apiRequest<RankingResponse>(`/api/ranking?board=${name}`);
  cache.set(name, { at: Date.now(), data });
  return data;
}

function valueOf(row: { value: number; level: number }, name: RankingBoard): string {
  if (name === "gold") return `🪙 ${formatNumber(row.value)}`;
  if (name === "kills") return `${formatNumber(row.value)} caçadas`;
  return `${formatNumber(row.value)} XP`;
}

/** Painel do jogo, com as três listas. */
export class Ranking {
  private readonly root = element("#ranking");
  private readonly body = element("#ranking-body");
  private readonly tabs = [...document.querySelectorAll<HTMLButtonElement>("#ranking-tabs [data-board]")];
  private current: RankingBoard = "level";
  private myName = "";
  private version = 0;

  constructor() {
    for (const tab of this.tabs) {
      tab.addEventListener("click", () => this.select(tab.dataset.board as RankingBoard));
    }
    element("#ranking-close").addEventListener("click", () => this.close());
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Destaca a linha de quem está jogando. */
  setMyName(name: string) {
    this.myName = name;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    this.root.hidden = false;
    void this.load();
  }

  close() {
    this.root.hidden = true;
  }

  private select(name: RankingBoard) {
    if (!RANKING_BOARDS.includes(name)) return;
    this.current = name;
    void this.load();
  }

  private async load() {
    const name = this.current;
    for (const tab of this.tabs) tab.classList.toggle("active", tab.dataset.board === name);
    const version = ++this.version;
    if (!cache.has(name)) this.body.replaceChildren(message("Carregando…"));
    try {
      const data = await board(name);
      if (version !== this.version) return;
      this.body.replaceChildren(data.entries.length > 0 ? this.list(data) : message("Ainda não há ninguém no ranking."));
    } catch (error) {
      if (version === this.version) this.body.replaceChildren(message(messageOf(error)));
    }
  }

  private list(data: RankingResponse): HTMLElement {
    const list = document.createElement("ol");
    list.className = "rank-list";
    for (const row of data.entries) {
      const item = document.createElement("li");
      item.className = "rank-row";
      if (row.rank <= 3) item.classList.add(`top${row.rank}`);
      if (row.name === this.myName) item.classList.add("me");

      const position = document.createElement("span");
      position.className = "position";
      position.textContent = row.rank <= 3 ? ["🥇", "🥈", "🥉"][row.rank - 1] : String(row.rank);

      const who = document.createElement("span");
      who.className = "who";
      who.textContent = row.name;
      const level = document.createElement("small");
      level.textContent = `nível ${row.level}`;
      who.append(level);

      const value = document.createElement("span");
      value.className = "value";
      value.textContent = valueOf(row, data.board);

      item.append(position, who, value);
      list.append(item);
    }
    return list;
  }
}

function message(text: string): HTMLElement {
  const paragraph = document.createElement("p");
  paragraph.className = "rank-empty";
  paragraph.textContent = text;
  return paragraph;
}

/** Top 6 por nível, ao lado do menu de login. */
export async function paintMenuRanking() {
  const list = document.querySelector<HTMLOListElement>("#menu-ranking-list");
  const panel = document.querySelector<HTMLElement>("#menu-ranking");
  if (!list || !panel) return;
  try {
    const data = await board("level");
    if (data.entries.length === 0) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    list.replaceChildren(
      ...data.entries.slice(0, 6).map((row) => {
        const item = document.createElement("li");
        const position = document.createElement("span");
        position.textContent = `${row.rank}.`;
        const name = document.createElement("b");
        name.textContent = row.name;
        const level = document.createElement("i");
        level.textContent = String(row.level);
        item.append(position, name, level);
        return item;
      }),
    );
  } catch {
    panel.hidden = true;
  }
}

export { LABEL as RANKING_LABEL };
