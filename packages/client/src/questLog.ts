import {
  MONSTERS,
  QUEST_ALTAR_RANGE,
  gearItem,
  questProgressOf,
  questWaiting,
  type PlayerData,
  type QuestDef,
  type QuestsEvent,
} from "@zuna/shared";
import { element, formatNumber } from "./dom.ts";
import { iconElement } from "./itemIcons.ts";

// Missões (tecla J): caçadas com contagem e desafios de chefe, que precisam de um
// número de jogadores no altar. Quem decide tudo é o servidor; aqui só mostra e pede.

export interface QuestHandlers {
  claim(id: number): void;
  summon(id: number): void;
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = make("button", className, label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

/** "em 12 min" para a próxima vez que a missão repetível vale. */
function waitLabel(readyAt: string): string {
  const minutes = Math.max(1, Math.round((new Date(readyAt).getTime() - Date.now()) / 60_000));
  if (minutes < 60) return `disponível em ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `disponível em ${hours} h` : "já concluída";
}

export class QuestLog {
  private readonly root = element("#quests");
  private readonly body = element("#quests-body");
  private readonly tabs = [...document.querySelectorAll<HTMLButtonElement>("#quests [data-quest-tab]")];
  private readonly handlers: QuestHandlers;
  private data: QuestsEvent = { quests: [], progress: [], worldNames: {}, worldId: 0 };
  private player: PlayerData | null = null;
  private tab: "kill" | "boss" = "kill";

  constructor(handlers: QuestHandlers) {
    this.handlers = handlers;
    for (const tab of this.tabs) {
      tab.addEventListener("click", () => {
        this.tab = tab.dataset.questTab as "kill" | "boss";
        for (const other of this.tabs) other.classList.toggle("active", other === tab);
        this.render();
      });
    }
    element("#quests-close").addEventListener("click", () => this.close());
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    this.root.hidden = false;
    this.render();
  }

  close() {
    this.root.hidden = true;
  }

  setQuests(event: QuestsEvent) {
    this.data = event;
    if (this.isOpen) this.render();
  }

  setPlayer(player: PlayerData) {
    this.player = player;
    // Só redesenha quando muda de casa (o botão do altar depende da distância).
    if (this.isOpen && this.tab === "boss") this.render();
  }

  /** Quantas missões estão prontas para entregar (para o aviso no botão da HUD). */
  get readyCount(): number {
    return this.data.progress.filter((entry) => entry.done).length;
  }

  private render() {
    const player = this.player;
    const quests = this.data.quests.filter((quest) => quest.kind === this.tab).sort((a, b) => a.minLevel - b.minLevel);
    const list = make("div", "quest-list");
    for (const quest of quests) list.append(this.questCard(quest, player));
    if (quests.length === 0) list.append(make("p", "quest-empty", "Nenhuma missão por aqui ainda."));
    this.body.replaceChildren(list);
  }

  private questCard(quest: QuestDef, player: PlayerData | null): HTMLElement {
    const progress = questProgressOf(this.data.progress, quest.id);
    const waiting = questWaiting(progress);
    const card = make("article", "quest-card");
    card.classList.toggle("done", progress.done);
    card.classList.toggle("waiting", waiting && !progress.done);

    const head = make("div", "quest-head");
    head.append(make("strong", "", quest.name));
    const where = quest.worldId ? (this.data.worldNames[String(quest.worldId)] ?? "") : "Qualquer mundo";
    head.append(make("small", "", `${where} · nível ${quest.minLevel}${quest.repeatMinutes > 0 ? " · repetível" : ""}`));
    card.append(head, make("p", "quest-text", quest.description));

    if (quest.kind === "kill") {
      const ratio = Math.min(1, progress.progress / quest.amount);
      const bar = make("div", "quest-bar");
      const fill = make("i");
      fill.style.width = `${ratio * 100}%`;
      bar.append(fill);
      card.append(
        make("div", "quest-count", `${MONSTERS[quest.monster].name}: ${formatNumber(progress.progress)} / ${formatNumber(quest.amount)}`),
        bar,
      );
    } else {
      const near =
        player !== null &&
        this.data.worldId === quest.worldId &&
        Math.max(Math.abs(player.x - quest.x), Math.abs(player.y - quest.y)) <= QUEST_ALTAR_RANGE;
      card.append(
        make(
          "div",
          "quest-count",
          `${MONSTERS[quest.monster].name} · ${quest.players} jogadores no altar (${quest.x}, ${quest.y})${near ? " · você está no altar" : ""}`,
        ),
      );
    }

    // Recompensas.
    const rewards = make("div", "quest-rewards");
    if (quest.rewardXp > 0) rewards.append(make("span", "reward xp", `${formatNumber(quest.rewardXp)} XP`));
    if (quest.rewardGold > 0) rewards.append(make("span", "reward gold", `🪙 ${formatNumber(quest.rewardGold)}`));
    const item = quest.rewardItem ? gearItem(quest.rewardItem) : undefined;
    if (item) {
      const chip = make("span", "reward item");
      chip.append(iconElement(item.icon, 22), make("span", "", quest.rewardItemCount > 1 ? `${quest.rewardItemCount}× ${item.name}` : item.name));
      rewards.append(chip);
    }
    card.append(rewards);

    const actions = make("div", "quest-actions");
    if (progress.done) {
      actions.append(button("Receber recompensa", "primary small", () => this.handlers.claim(quest.id)));
    } else if (waiting) {
      actions.append(make("span", "quest-status", waitLabel(progress.readyAt)));
    } else if (quest.kind === "boss") {
      const summon = button("Invocar chefe", "primary small", () => this.handlers.summon(quest.id));
      summon.disabled = this.data.worldId !== quest.worldId;
      actions.append(summon);
      if (this.data.worldId !== quest.worldId) actions.append(make("span", "quest-status", "vá até o mundo da missão"));
    } else {
      actions.append(make("span", "quest-status", progress.times > 0 ? `já cumprida ${progress.times}×` : "em andamento"));
    }
    card.append(actions);
    return card;
  }
}
