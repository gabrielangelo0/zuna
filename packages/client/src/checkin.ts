import { checkinCycle, gearItem, type CheckinDay, type CheckinEvent } from "@zuna/shared";
import { element, formatNumber } from "./dom.ts";
import { iconElement } from "./itemIcons.ts";

// Presente diário (tecla C): o ciclo de dias, o de hoje em destaque e o botão de abrir.
// Quem decide o dia é o servidor; aqui só mostra e pede.

export interface CheckinHandlers {
  claim(): void;
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** "em 7 h" até o presente de amanhã. */
function waitLabel(nextAt: string): string {
  const minutes = Math.max(1, Math.round((new Date(nextAt).getTime() - Date.now()) / 60_000));
  if (minutes < 60) return `Próximo presente em ${minutes} min`;
  return `Próximo presente em ${Math.round(minutes / 60)} h`;
}

export class Checkin {
  private readonly root = element("#checkin");
  private readonly body = element("#checkin-body");
  private readonly foot = element("#checkin-foot");
  private readonly handlers: CheckinHandlers;
  private data: CheckinEvent = { days: [], state: { day: 1, claimedToday: false, streak: 0, total: 0, nextAt: "" }, enabled: false };
  /** Abre sozinho uma vez por sessão quando há presente esperando. */
  private offered = false;

  constructor(handlers: CheckinHandlers) {
    this.handlers = handlers;
    element("#checkin-close").addEventListener("click", () => this.close());
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Tem presente para pegar agora (aviso no botão da HUD). */
  get ready(): boolean {
    return this.data.enabled && !this.data.state.claimedToday && checkinCycle(this.data.days).length > 0;
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

  setCheckin(event: CheckinEvent) {
    this.data = event;
    if (this.isOpen) this.render();
    // Na primeira vez que entra com presente esperando, o painel aparece sozinho.
    if (!this.offered && this.ready) {
      this.offered = true;
      this.open();
    }
  }

  private render() {
    const cycle = checkinCycle(this.data.days);
    const { state } = this.data;
    const grid = make("div", "checkin-grid");
    cycle.forEach((day, index) => grid.append(this.dayCard(day, index + 1)));
    if (cycle.length === 0) grid.append(make("p", "quest-empty", "Nenhum presente configurado ainda."));
    this.body.replaceChildren(grid);

    // Rodapé: sequência, total e o botão de abrir.
    const info = make("div", "checkin-info");
    info.append(
      make("span", "checkin-streak", state.streak === 1 ? "🔥 1 dia seguido" : `🔥 ${formatNumber(state.streak)} dias seguidos`),
      make("span", "quest-status", state.total === 1 ? "1 presente aberto" : `${formatNumber(state.total)} presentes abertos`),
    );
    const actions = make("div", "quest-actions");
    if (!this.data.enabled) {
      actions.append(make("span", "quest-status", "O presente diário está fechado no momento."));
    } else if (state.claimedToday) {
      actions.append(make("span", "quest-status", state.nextAt ? waitLabel(state.nextAt) : "Volte amanhã!"));
    } else if (cycle.length > 0) {
      const button = make("button", "primary", `Abrir presente do dia ${(state.day - 1) % cycle.length + 1}`);
      button.type = "button";
      button.addEventListener("click", () => {
        button.disabled = true;
        this.handlers.claim();
      });
      actions.append(button);
    }
    this.foot.replaceChildren(info, actions);
  }

  private dayCard(day: CheckinDay, position: number): HTMLElement {
    const cycle = checkinCycle(this.data.days).length;
    const { state } = this.data;
    // Em que ponto do ciclo o jogador está (o ciclo dá a volta quando passa do último dia).
    const current = ((state.day - 1) % Math.max(1, cycle)) + 1;
    const taken = position < current || (position === current && state.claimedToday);
    const today = position === current && !state.claimedToday;

    const card = make("article", "checkin-day");
    card.classList.toggle("taken", taken);
    card.classList.toggle("today", today);
    card.classList.toggle("big", day.highlight);
    card.append(make("span", "checkin-label", `Dia ${position}`));

    const prizes = make("div", "checkin-prizes");
    if (day.rewardGold > 0) prizes.append(make("span", "reward gold", `🪙 ${formatNumber(day.rewardGold)}`));
    if (day.rewardDiamonds > 0) prizes.append(make("span", "reward diamonds", `💎 ${formatNumber(day.rewardDiamonds)}`));
    if (day.rewardXp > 0) prizes.append(make("span", "reward xp", `${formatNumber(day.rewardXp)} XP`));
    const item = day.rewardItem ? gearItem(day.rewardItem) : undefined;
    if (item) {
      const chip = make("span", "reward item");
      chip.append(iconElement(item.icon, 22), make("span", "", day.rewardItemCount > 1 ? `${day.rewardItemCount}× ${item.name}` : item.name));
      prizes.append(chip);
    }
    card.append(prizes);
    if (taken) card.append(make("span", "checkin-stamp", "✔"));
    return card;
  }
}
