import { formatNumber } from "./dom.ts";
import { element } from "./dom.ts";
import { gearItem, vipDaysLeft, type VipEvent, type VipPass, type VipTier } from "@zuna/shared";

// Tela do VIP (tecla V): o que cada degrau dá, o que está à venda e o baú do dia.
// Quem decide tudo é o servidor; aqui só mostra, pede e anima.

export interface VipHandlers {
  buy(pass: string): void;
  claim(): void;
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const pct = (value: number) => `+${Math.round(value * 100)}%`;

export class VipPanel {
  private readonly root = element("#vip");
  private readonly body = element("#vip-body");
  private readonly foot = element("#vip-foot");
  private readonly handlers: VipHandlers;
  private data: VipEvent = { tier: "", untilMs: 0, tiers: [], passes: [], chestReady: false };
  /** Confirmação em dois passos: o segundo clique mostra o que sai e o que entra. */
  private confirming = "";

  constructor(handlers: VipHandlers) {
    this.handlers = handlers;
    element("#vip-close").addEventListener("click", () => this.close());
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Tem baú esperando (aviso no botão da HUD). */
  get chestReady(): boolean {
    return this.data.chestReady;
  }

  setData(data: VipEvent) {
    this.data = data;
    this.confirming = "";
    if (this.isOpen) this.draw();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    this.root.hidden = false;
    this.draw();
  }

  close() {
    this.root.hidden = true;
    this.confirming = "";
  }

  private tierOf(id: string): VipTier | undefined {
    return this.data.tiers.find((tier) => tier.id === id);
  }

  private draw() {
    const agora = Date.now();
    const meu = this.tierOf(this.data.tier);
    const ativo = meu !== undefined && this.data.untilMs > agora;

    const topo = make("div", "vip-status");
    if (ativo && meu) {
      const dias = vipDaysLeft(this.data.untilMs, agora);
      topo.style.setProperty("--vip-cor", meu.color);
      topo.append(
        make("strong", "vip-status-name", meu.name),
        make("span", "vip-status-days", `${dias} dia${dias === 1 ? "" : "s"} restante${dias === 1 ? "" : "s"}`),
        make("small", "", `termina em ${new Date(this.data.untilMs).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`),
      );
    } else {
      topo.append(make("strong", "vip-status-name", "Você ainda não é VIP"), make("small", "", "Escolha um passe abaixo."));
    }

    const grade = make("div", "vip-grid");
    for (const tier of this.data.tiers) {
      if (!tier.enabled) continue;
      const card = make("div", "vip-card");
      card.style.setProperty("--vip-cor", tier.color);
      if (meu?.id === tier.id && ativo) card.classList.add("mine");
      card.append(make("h3", "", tier.name));
      if (tier.description) card.append(make("p", "vip-card-desc", tier.description));
      const lista = make("ul", "vip-perks");
      for (const texto of perksOf(tier)) lista.append(make("li", "", texto));
      card.append(lista);

      for (const pass of this.data.passes.filter((entry) => entry.tier === tier.id)) {
        card.append(this.passButton(pass, tier, ativo && meu !== undefined && meu.rank > tier.rank));
      }
      grade.append(card);
    }

    this.body.replaceChildren(topo, grade);

    this.foot.replaceChildren();
    if (ativo && meu) {
      const bau = make("button", `kit-btn ${this.data.chestReady ? "good" : ""}`, this.data.chestReady ? "Abrir o baú VIP de hoje" : "Baú de hoje já aberto");
      (bau as HTMLButtonElement).disabled = !this.data.chestReady;
      bau.addEventListener("click", () => {
        bau.classList.add("vip-chest-open");
        this.handlers.claim();
      });
      this.foot.append(bau, make("small", "vip-chest-note", chestLabel(meu)));
    }
  }

  private passButton(pass: VipPass, tier: VipTier, abaixoDoMeu: boolean): HTMLElement {
    const porDia = (pass.priceDiamonds / pass.days).toFixed(1);
    const botao = make("button", "kit-btn vip-buy");
    botao.style.setProperty("--vip-cor", tier.color);
    if (abaixoDoMeu) {
      botao.textContent = `${pass.days} dias — você já tem um degrau maior`;
      (botao as HTMLButtonElement).disabled = true;
      return botao;
    }
    const rotulo = `${pass.days} dias · ${formatNumber(pass.priceDiamonds)} 💎`;
    botao.textContent = this.confirming === pass.id ? `Confirmar: ${rotulo}` : rotulo;
    if (this.confirming === pass.id) botao.classList.add("confirming");
    if (pass.tag) botao.append(make("span", "vip-tag", pass.tag));
    botao.append(make("small", "vip-per-day", `${porDia} 💎 por dia`));
    botao.addEventListener("click", () => {
      // Dois cliques: o segundo diz o que sai da conta e o que entra.
      if (this.confirming !== pass.id) {
        this.confirming = pass.id;
        this.draw();
        return;
      }
      this.confirming = "";
      this.handlers.buy(pass.id);
    });
    return botao;
  }
}

function perksOf(tier: VipTier): string[] {
  const linhas = [`${pct(tier.bonusXp)} de experiência em monstros`, `${pct(tier.bonusGold)} de ouro`];
  linhas.push(
    tier.deathXpFactor === 0
      ? "nenhuma perda de experiência ao morrer"
      : `metade da perda ao morrer (${Math.round(tier.deathXpFactor * 100)}% do normal)`,
  );
  linhas.push(`+${tier.bagSlots} espaços na mochila`);
  linhas.push("nome colorido e aura na tela");
  if (tier.title) linhas.push(`título “${tier.title}” acima do nome`);
  linhas.push("baú diário");
  return linhas;
}

function chestLabel(tier: VipTier): string {
  const partes: string[] = [];
  if (tier.chestGold > 0) partes.push(`${formatNumber(tier.chestGold)} de ouro`);
  if (tier.chestDiamonds > 0) partes.push(`${tier.chestDiamonds} 💎`);
  if (tier.chestXp > 0) partes.push(`${formatNumber(Math.round(tier.chestXp))} de XP`);
  if (tier.chestItem) {
    const item = gearItem(tier.chestItem);
    if (item) partes.push(tier.chestItemCount > 1 ? `${tier.chestItemCount}× ${item.name}` : item.name);
  }
  return partes.length > 0 ? `Todo dia: ${partes.join(", ")}.` : "";
}
