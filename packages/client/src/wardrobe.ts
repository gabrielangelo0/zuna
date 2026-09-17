import {
  CATALOG,
  appearanceOf,
  describeBonus,
  ownsItem,
  type Appearance,
  type AppearanceMessage,
  type CatalogItem,
  type ItemKind,
  type PlayerData,
  type ProfileEvent,
} from "@game/shared";
import { AppearanceEditor } from "./appearanceEditor.ts";
import { element, formatNumber } from "./dom.ts";
import { LookPreview, paintItem } from "./lookPreview.ts";

type Tab = "visual" | ItemKind;

export interface WardrobeHandlers {
  appearance(message: AppearanceMessage): void;
  equip(kind: ItemKind, id: string): void;
  buy(id: string): void;
}

/** Guarda-roupa e loja: aparência, roupas, mascotes e montarias. */
export class Wardrobe {
  private readonly root = element("#wardrobe");
  private readonly content = element("#wardrobe-content");
  private readonly preview = new LookPreview(element<HTMLCanvasElement>("#wardrobe-canvas"), {
    dir: "SE",
    scale: 2.2,
    footY: 220,
    animate: true,
  });
  private readonly previewLabel = element("#wardrobe-preview-label");
  private readonly gold = element("#wardrobe-gold");
  private readonly diamonds = element("#wardrobe-diamonds");
  private readonly status = element("#wardrobe-status");
  private readonly tabs = [...document.querySelectorAll<HTMLButtonElement>("#wardrobe [data-tab]")];
  private readonly handlers: WardrobeHandlers;
  private tab: Tab = "visual";
  private player: PlayerData | null = null;
  private profile: ProfileEvent = { diamonds: 0, unlocks: [] };
  private unlocks = new Set<string>();
  private editor: AppearanceEditor | null = null;
  private tryOn: CatalogItem | null = null;
  private renderedKey = "";
  private statusTimer = 0;

  constructor(handlers: WardrobeHandlers) {
    this.handlers = handlers;
    for (const tab of this.tabs) tab.addEventListener("click", () => this.selectTab(tab.dataset.tab as Tab));
    element("#wardrobe-close").addEventListener("click", () => this.close());
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
    this.renderedKey = "";
    this.render();
    this.preview.start();
  }

  close() {
    this.root.hidden = true;
    this.tryOn = null;
    this.preview.stop();
  }

  setProfile(profile: ProfileEvent) {
    this.profile = profile;
    this.unlocks = new Set(profile.unlocks);
    this.diamonds.textContent = formatNumber(profile.diamonds);
    this.render();
  }

  setPlayer(player: PlayerData) {
    this.player = player;
    this.gold.textContent = formatNumber(player.gold);
    this.render();
  }

  showStatus(message: string, ok: boolean) {
    this.status.textContent = message;
    this.status.classList.toggle("ok", ok);
    this.status.hidden = false;
    window.clearTimeout(this.statusTimer);
    this.statusTimer = window.setTimeout(() => (this.status.hidden = true), 4000);
  }

  private selectTab(tab: Tab) {
    this.tab = tab;
    this.tryOn = null;
    for (const button of this.tabs) button.classList.toggle("active", button.dataset.tab === tab);
    this.render();
  }

  private render() {
    const player = this.player;
    if (!player || !this.isOpen) return;
    // Só reconstrói quando muda algo que aparece aqui (e não a cada ponto de vida ou mana).
    const key = [
      this.tab,
      player.gold,
      this.profile.diamonds,
      [...this.unlocks].join(","),
      player.outfit,
      player.pet,
      player.mount,
      player.mounted,
      player.skin,
      player.hairColor,
      player.primary,
      player.secondary,
      player.detail,
      this.tryOn?.id ?? "",
    ].join("|");
    if (key === this.renderedKey) return;
    this.renderedKey = key;

    this.paintLook(player);
    if (this.tab === "visual") this.renderVisual(player);
    else this.renderItems(player, this.tab);
  }

  private paintLook(player: PlayerData) {
    const item = this.tryOn;
    const look: Appearance = item?.kind === "outfit" ? { ...appearanceOf(player), outfit: item.id } : appearanceOf(player);
    const mount = item?.kind === "mount" ? item.id : player.mounted ? player.mount : "";
    const pet = item?.kind === "pet" ? item.id : player.pet;
    this.preview.set({ appearance: look, mount: mount || undefined, pet: pet || undefined });
    this.previewLabel.textContent = item ? `Experimentando: ${item.name}` : "Seu visual";
  }

  private renderVisual(player: PlayerData) {
    if (this.editor && this.content.dataset.tab === "visual") {
      this.editor.set(appearanceOf(player));
      return;
    }
    const container = document.createElement("div");
    container.className = "editor";
    this.content.replaceChildren(container);
    this.content.dataset.tab = "visual";
    this.editor = new AppearanceEditor(container, appearanceOf(player), {
      onChange: ({ skin, hairColor, primary, secondary, detail }) =>
        this.handlers.appearance({ skin, hairColor, primary, secondary, detail }),
    });
  }

  private renderItems(player: PlayerData, kind: ItemKind) {
    const scroll = this.content.dataset.tab === kind ? this.content.scrollTop : 0;
    const grid = document.createElement("div");
    grid.className = "item-grid";
    for (const item of CATALOG.filter((entry) => entry.kind === kind)) grid.append(this.itemCard(player, item));
    this.content.replaceChildren(grid);
    this.content.dataset.tab = kind;
    this.content.scrollTop = scroll;
    this.editor = null;
  }

  private itemCard(player: PlayerData, item: CatalogItem): HTMLElement {
    const owned = ownsItem(item, this.unlocks);
    const equipped =
      item.kind === "outfit" ? player.outfit === item.id : item.kind === "pet" ? player.pet === item.id : player.mount === item.id;

    const card = document.createElement("article");
    card.className = "item-card";
    card.classList.toggle("equipped", equipped);
    card.classList.toggle("trying", this.tryOn?.id === item.id);
    card.classList.toggle("premium", item.currency === "diamonds" && item.price > 0);

    const canvas = document.createElement("canvas");
    canvas.width = 144;
    canvas.height = 144;
    canvas.title = "Clique para experimentar";
    paintItem(canvas, item, appearanceOf(player)).catch((error: unknown) => console.error(error));
    canvas.addEventListener("click", () => {
      this.tryOn = this.tryOn?.id === item.id ? null : item;
      this.render();
    });

    const info = document.createElement("div");
    info.className = "item-info";
    const name = document.createElement("strong");
    name.textContent = item.name;
    const description = document.createElement("small");
    description.textContent = item.description;
    info.append(name, description);
    const bonus = describeBonus(item.bonus);
    if (bonus.length > 0) {
      const bonusLine = document.createElement("span");
      bonusLine.className = "bonus";
      bonusLine.textContent = bonus.join(" · ");
      info.append(bonusLine);
    }

    const actions = document.createElement("div");
    actions.className = "item-actions";
    const price = document.createElement("span");
    price.className = "price";
    price.textContent = owned
      ? item.price === 0 ? "Grátis" : "Adquirido"
      : `${item.currency === "diamonds" ? "💎" : "🪙"} ${formatNumber(item.price)}`;
    actions.append(price, this.actionButton(player, item, owned, equipped));

    card.append(canvas, info, actions);
    return card;
  }

  private actionButton(player: PlayerData, item: CatalogItem, owned: boolean, equipped: boolean): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";

    if (!owned) {
      button.className = item.currency === "diamonds" ? "primary small" : "secondary small";
      button.textContent = "Comprar";
      button.addEventListener("click", () => {
        const balance = item.currency === "diamonds" ? this.profile.diamonds : player.gold;
        if (balance >= item.price) {
          this.handlers.buy(item.id);
        } else if (item.currency === "diamonds") {
          this.showStatus("Diamantes insuficientes. A compra de diamantes (Pix e cartão) chega na próxima fase.", false);
        } else {
          this.showStatus(`Faltam ${formatNumber(item.price - balance)} moedas de ouro. Continue caçando!`, false);
        }
      });
      return button;
    }

    if (equipped) {
      button.className = "secondary small";
      if (item.kind === "outfit") {
        button.textContent = "Em uso";
        button.disabled = true;
      } else {
        button.textContent = "Remover";
        button.addEventListener("click", () => this.handlers.equip(item.kind, ""));
      }
      return button;
    }

    button.className = "primary small";
    button.textContent = "Usar";
    button.addEventListener("click", () => {
      this.tryOn = null;
      this.handlers.equip(item.kind, item.id);
    });
    return button;
  }
}
