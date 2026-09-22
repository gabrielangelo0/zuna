import {
  SHORTCUT_KEYS,
  SHORTCUT_SLOTS,
  levelProgress,
  spellById,
  type ChatEvent,
  type PlayerData,
  type SpellId,
} from "@zuna/shared";
import { element, formatNumber } from "./dom.ts";

export interface TargetInfo {
  name: string;
  hp: number;
  maxHp: number;
}

/** Interface em HTML sobre o canvas: status, alvo, magias, chat e avisos. */
export class Hud {
  private readonly root = element("#hud");
  private readonly name = element("#hud-name");
  private readonly eventLine = element("#hud-event");
  private readonly level = element("#hud-level");
  private readonly xpFill = element("#hud-xp");
  private readonly xpText = element("#hud-xp-text");
  /** Camada escura que cobre a parte vazia do orbe. */
  private readonly hpDrain = element("#hud-hp");
  private readonly hpText = element("#hud-hp-text");
  private readonly manaDrain = element("#hud-mana");
  private readonly manaText = element("#hud-mana-text");
  private readonly gold = element("#hud-gold");
  private readonly diamonds = element("#hud-diamonds");
  private readonly online = element("#hud-online");
  private readonly wardrobeButton = element<HTMLButtonElement>("#hud-wardrobe");
  private readonly shopButton = element<HTMLButtonElement>("#hud-shop");
  private readonly inventoryButton = element<HTMLButtonElement>("#hud-inventory");
  private readonly questsButton = element<HTMLButtonElement>("#hud-quests");
  private readonly questsBadge = element("#hud-quests-badge");
  private readonly rankingButton = element<HTMLButtonElement>("#hud-ranking");
  private readonly powersButton = element<HTMLButtonElement>("#hud-powers");
  private readonly mountButton = element<HTMLButtonElement>("#hud-mount");
  private readonly mountLabel = element("#hud-mount-label");
  private readonly status = element("#hud-status");
  private readonly statusToggle = element<HTMLButtonElement>("#hud-toggle");
  private readonly badge = element("#hud-badge");
  private readonly miniActions = element("#mini-actions");
  private readonly minimapToggle = element<HTMLButtonElement>("#minimap-toggle");
  private readonly chatToggle = element<HTMLButtonElement>("#chat-toggle");
  private readonly chatDot = element("#chat-dot");
  private readonly targetPanel = element("#target-panel");
  private readonly targetName = element("#target-name");
  private readonly targetHp = element("#target-hp");
  private readonly actionbar = element("#actionbar");
  private readonly minimap = element("#minimap");
  private readonly spellbar = element("#spellbar");
  private readonly spellButtons: HTMLButtonElement[] = [];
  private readonly chat = element("#chat");
  private readonly chatLog = element("#chat-log");
  private readonly chatInput = element<HTMLInputElement>("#chat-input");
  private readonly banner = element("#banner");
  private readonly death = element("#death");
  private readonly deathText = element("#death-text");

  private chatHandler: ((text: string) => void) | null = null;
  private spellHandler: ((id: SpellId) => void) | null = null;
  private emptySlotHandler: (() => void) | null = null;
  private shortcuts: string[] = Array.from({ length: SHORTCUT_SLOTS }, () => "");
  private lastMana = -1;
  private readonly cooldownUntil = new Map<SpellId, number>();
  private lastTargetKey = "";
  private lastLevel = 0;
  private bannerTimer = 0;
  private deathTimer = 0;
  private eventTimer = 0;

  constructor() {
    this.chatInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const text = this.chatInput.value.trim();
        if (text) this.chatHandler?.(text);
        this.chatInput.value = "";
        this.chatInput.blur();
      } else if (event.key === "Escape") {
        this.chatInput.blur();
      }
    });
    this.buildSpells();
    this.setupPanels();
  }

  /** A barra segue os atalhos do jogador: um botão por tecla. */
  private buildSpells() {
    this.spellButtons.length = 0;
    const buttons = this.shortcuts.map((id, index) => {
      const spell = id ? spellById(id) : undefined;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "spell";
      button.classList.toggle("free", !spell);
      button.dataset.spell = spell?.id ?? "";
      button.title = spell
        ? `${spell.name} — ${spell.description} · ${spell.mana} de mana`
        : "Atalho livre: abra os poderes (P) para escolher um";

      const key = document.createElement("kbd");
      key.textContent = SHORTCUT_KEYS[index];
      const name = document.createElement("span");
      name.textContent = spell?.short ?? "+";
      const cooldown = document.createElement("i");
      cooldown.className = "cooldown";

      button.append(key, name, cooldown);
      button.addEventListener("click", () => {
        if (spell) this.spellHandler?.(spell.id);
        else this.emptySlotHandler?.();
        button.blur();
      });
      return button;
    });
    this.spellButtons.push(...buttons);
    this.spellbar.replaceChildren(...buttons);
    this.lastMana = -1;
  }

  /** Poder de cada tecla, na ordem: vazio quando a vaga está livre. */
  setShortcuts(slots: string[]) {
    if (slots.join(",") === this.shortcuts.join(",")) return;
    this.shortcuts = [...slots];
    this.buildSpells();
  }

  /** Id do poder numa tecla ("1" a "6"), se houver. */
  spellForKey(key: string): SpellId | null {
    const index = SHORTCUT_KEYS.indexOf(key);
    return index === -1 ? null : this.shortcuts[index] || null;
  }

  show() {
    this.root.hidden = false;
    this.actionbar.hidden = false;
    this.minimap.hidden = false;
    this.chat.hidden = false;
    this.miniActions.hidden = false;
  }

  /** Numa tela estreita a interface começa fechada; aqui é onde ela abre e fecha. */
  private get narrow(): boolean {
    return window.matchMedia("(max-width: 700px)").matches;
  }

  private setupPanels() {
    this.statusToggle.addEventListener("click", () => {
      if (!this.narrow) return;
      this.status.classList.toggle("open");
      this.statusToggle.setAttribute("aria-expanded", String(this.status.classList.contains("open")));
    });

    this.minimapToggle.addEventListener("click", () => {
      const open = this.minimap.classList.toggle("open");
      this.minimapToggle.classList.toggle("on", open);
      this.minimapToggle.blur();
    });

    this.chatToggle.addEventListener("click", () => {
      const open = this.chat.classList.toggle("open");
      this.chatToggle.classList.toggle("on", open);
      if (open) {
        this.chatDot.hidden = true;
        this.chatInput.focus();
      } else {
        this.chatInput.blur();
      }
    });
  }

  /** Abre a conversa (Enter no teclado ou botão) e deixa o cursor no campo. */
  private openChat() {
    this.chat.classList.add("open");
    this.chatToggle.classList.add("on");
    this.chatDot.hidden = true;
  }

  onChat(handler: (text: string) => void) {
    this.chatHandler = handler;
  }

  onSpell(handler: (id: SpellId) => void) {
    this.spellHandler = handler;
  }

  onWardrobe(handler: () => void) {
    this.wardrobeButton.addEventListener("click", () => {
      handler();
      this.wardrobeButton.blur();
    });
  }

  onInventory(handler: () => void) {
    this.inventoryButton.addEventListener("click", () => {
      handler();
      this.inventoryButton.blur();
    });
  }

  onQuests(handler: () => void) {
    this.questsButton.addEventListener("click", () => {
      handler();
      this.questsButton.blur();
    });
  }

  /** Aviso no botão: quantas missões estão prontas para entregar. */
  setQuestsReady(count: number) {
    this.questsBadge.textContent = String(count);
    this.questsBadge.hidden = count <= 0;
  }

  onShop(handler: () => void) {
    this.shopButton.addEventListener("click", () => {
      handler();
      this.shopButton.blur();
    });
  }

  onPowers(handler: () => void) {
    this.powersButton.addEventListener("click", () => {
      handler();
      this.powersButton.blur();
    });
    this.emptySlotHandler = handler;
  }

  onRanking(handler: () => void) {
    this.rankingButton.addEventListener("click", () => {
      handler();
      this.rankingButton.blur();
    });
  }

  onMount(handler: () => void) {
    this.mountButton.addEventListener("click", () => {
      handler();
      this.mountButton.blur();
    });
  }

  focusChat() {
    this.openChat();
    this.chatInput.focus();
  }

  updatePlayer(player: PlayerData) {
    this.name.textContent = player.name;
    this.level.textContent = String(player.level);
    this.badge.textContent = String(player.level);
    if (this.lastLevel && player.level > this.lastLevel) this.pulse(this.level);
    this.lastLevel = player.level;

    const progress = levelProgress(player.xp, player.level);
    this.xpFill.style.width = `${progress.ratio * 100}%`;
    this.xpText.textContent = `Nível ${player.level} · ${formatNumber(progress.current)} / ${formatNumber(progress.needed)} XP`;
    this.hpDrain.style.height = `${(1 - Math.min(1, Math.max(0, player.hp / player.maxHp))) * 100}%`;
    this.hpText.textContent = `${formatNumber(Math.max(0, player.hp))} / ${formatNumber(player.maxHp)}`;
    this.manaDrain.style.height = `${(1 - Math.min(1, Math.max(0, player.mana / player.maxMana))) * 100}%`;
    this.manaText.textContent = `${formatNumber(player.mana)} / ${formatNumber(player.maxMana)}`;
    this.gold.textContent = formatNumber(player.gold);

    this.mountButton.disabled = !player.mount;
    this.mountButton.title = player.mount ? "" : "Equipe uma montaria no guarda-roupa";
    this.mountLabel.textContent = player.mounted ? "Desmontar" : "Montar";

    if (player.mana !== this.lastMana) {
      this.lastMana = player.mana;
      for (const button of this.spellButtons) {
        const spell = button.dataset.spell ? spellById(button.dataset.spell) : undefined;
        button.classList.toggle("no-mana", spell !== undefined && player.mana < spell.mana);
      }
    }
  }

  setDiamonds(value: number) {
    this.diamonds.textContent = formatNumber(value);
  }

  setOnline(count: number) {
    this.online.textContent = String(count);
  }

  setTarget(target: TargetInfo | null) {
    const key = target ? `${target.name}|${target.hp}|${target.maxHp}` : "";
    if (key === this.lastTargetKey) return;
    this.lastTargetKey = key;
    this.targetPanel.hidden = !target;
    if (!target) return;
    this.targetName.textContent = target.name;
    this.targetHp.style.width = `${Math.max(0, target.hp / target.maxHp) * 100}%`;
  }

  setEvent(name: string, endsAt: number) {
    window.clearInterval(this.eventTimer);
    if (!name) {
      this.eventLine.hidden = true;
      return;
    }
    const render = () => {
      const remaining = Math.max(0, endsAt - Date.now());
      const minutes = Math.floor(remaining / 60_000);
      const seconds = Math.floor(remaining / 1000) % 60;
      this.eventLine.textContent = `${name} · ${minutes}:${String(seconds).padStart(2, "0")}`;
    };
    render();
    this.eventLine.hidden = false;
    this.eventTimer = window.setInterval(render, 1000);
  }

  addChat(event: ChatEvent) {
    const line = document.createElement("div");
    line.className = event.channel;
    if (event.from) {
      const author = document.createElement("b");
      author.textContent = `${event.from}: `;
      line.append(author);
    }
    line.append(document.createTextNode(event.text));
    this.chatLog.append(line);
    while (this.chatLog.childElementCount > 80) this.chatLog.firstElementChild?.remove();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
    if (this.narrow && !this.chat.classList.contains("open")) this.chatDot.hidden = false;
  }

  showBanner(text: string) {
    this.banner.textContent = text;
    this.banner.hidden = false;
    this.restartAnimation(this.banner);
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => (this.banner.hidden = true), 6000);
  }

  showDeath(xpLost: number) {
    this.deathText.textContent =
      xpLost > 0 ? `Você perdeu ${formatNumber(xpLost)} de experiência.` : "Você renasceu no templo.";
    this.death.hidden = false;
    window.clearTimeout(this.deathTimer);
    this.deathTimer = window.setTimeout(() => (this.death.hidden = true), 2200);
  }

  showDisconnected(reason = "Conexão com o servidor perdida.") {
    this.addChat({ channel: "system", text: `${reason} Recarregue a página para voltar.` });
    this.showBanner(reason);
  }

  isOnCooldown(id: SpellId): boolean {
    return (this.cooldownUntil.get(id) ?? 0) > performance.now();
  }

  startCooldown(id: SpellId, durationMs: number) {
    this.cooldownUntil.set(id, performance.now() + durationMs);
    const overlay = this.spellButtons.find((b) => b.dataset.spell === id)?.querySelector<HTMLElement>(".cooldown");
    if (!overlay) return;
    overlay.style.transition = "none";
    overlay.style.height = "100%";
    void overlay.offsetHeight;
    overlay.style.transition = `height ${durationMs}ms linear`;
    overlay.style.height = "0";
  }

  private pulse(target: HTMLElement) {
    target.classList.remove("pulse");
    void target.offsetWidth;
    target.classList.add("pulse");
  }

  private restartAnimation(target: HTMLElement) {
    target.style.animation = "none";
    void target.offsetWidth;
    target.style.animation = "";
  }
}
