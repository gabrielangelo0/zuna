export interface KeyboardHandlers {
  move(dx: number, dy: number): void;
  spell(key: string): void;
  targetNearest(): void;
  escape(): void;
  focusChat(): void;
  toggleWardrobe(): void;
  toggleMount(): void;
  toggleRanking(): void;
  togglePowers(): void;
  toggleMap(): void;
  toggleShop(): void;
  toggleInventory(): void;
  potion(kind: "hp" | "mana"): void;
  toggleQuests(): void;
}

const UP = new Set(["w", "arrowup"]);
const DOWN = new Set(["s", "arrowdown"]);
const LEFT = new Set(["a", "arrowleft"]);
const RIGHT = new Set(["d", "arrowright"]);

function isMoveKey(key: string): boolean {
  return UP.has(key) || DOWN.has(key) || LEFT.has(key) || RIGHT.has(key);
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

/** Teclado via DOM (e não pelo Phaser) para não roubar as teclas dos campos de texto. */
export class KeyboardInput {
  private readonly handlers: KeyboardHandlers;
  private readonly pressed = new Set<string>();
  private dx = 0;
  private dy = 0;

  constructor(handlers: KeyboardHandlers) {
    this.handlers = handlers;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.release);
  }

  release = () => {
    this.pressed.clear();
    this.emitMove();
  };

  private onKeyDown = (event: KeyboardEvent) => {
    if (isTyping(event.target)) return;
    const key = event.key.toLowerCase();

    if (isMoveKey(key)) {
      event.preventDefault();
      this.pressed.add(key);
      this.emitMove();
      return;
    }
    if (event.repeat) return;

    switch (key) {
      case "tab":
        event.preventDefault();
        this.handlers.targetNearest();
        return;
      case "escape":
        this.handlers.escape();
        return;
      case "enter":
        event.preventDefault();
        this.release();
        this.handlers.focusChat();
        return;
      case "o":
        this.handlers.toggleWardrobe();
        return;
      case "m":
        this.handlers.toggleMount();
        return;
      case "r":
        this.handlers.toggleRanking();
        return;
      case "p":
        this.handlers.togglePowers();
        return;
      case "n":
        this.handlers.toggleMap();
        return;
      case "l":
        this.handlers.toggleShop();
        return;
      case "i":
        this.handlers.toggleInventory();
        return;
      case "q":
        this.handlers.potion("hp");
        return;
      case "e":
        this.handlers.potion("mana");
        return;
      case "j":
        this.handlers.toggleQuests();
        return;
    }
    if (/^[1-9]$/.test(key)) this.handlers.spell(key);
  };

  private onKeyUp = (event: KeyboardEvent) => {
    if (this.pressed.delete(event.key.toLowerCase())) this.emitMove();
  };

  /**
   * Converte direções da tela para o grid isométrico:
   * cima = (−1, −1), direita = (+1, −1), baixo = (+1, +1), esquerda = (−1, +1).
   */
  private emitMove() {
    let sx = 0;
    let sy = 0;
    for (const key of this.pressed) {
      if (UP.has(key)) sy -= 1;
      if (DOWN.has(key)) sy += 1;
      if (LEFT.has(key)) sx -= 1;
      if (RIGHT.has(key)) sx += 1;
    }
    const dx = Math.sign(sx + sy);
    const dy = Math.sign(sy - sx);
    if (dx === this.dx && dy === this.dy) return;
    this.dx = dx;
    this.dy = dy;
    this.handlers.move(dx, dy);
  }
}
