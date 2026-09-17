import Phaser from "phaser";
import { GAME_FONT } from "./canvas.ts";

// Balão de fala: o que o jogador escreve no chat aparece acima da cabeça dele.

const MAX_WIDTH = 190;
const PADDING_X = 10;
const PADDING_Y = 7;
const RADIUS = 9;
/** Altura do rabinho que aponta para a cabeça. */
const TAIL = 8;
const BASE_MS = 2600;
const PER_CHAR_MS = 55;
const MAX_MS = 9000;
const FADE_MS = 320;

export class Bubble {
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private until = 0;
  private showing = false;

  constructor(scene: Phaser.Scene, depth: number) {
    this.panel = scene.add.graphics().setDepth(depth).setVisible(false);
    this.label = scene.add
      .text(0, 0, "", {
        fontFamily: GAME_FONT,
        fontSize: "13px",
        color: "#f3f4f8",
        align: "center",
        wordWrap: { width: MAX_WIDTH },
        resolution: Math.min(2, window.devicePixelRatio || 1),
      })
      .setOrigin(0.5, 1)
      .setDepth(depth + 1)
      .setVisible(false);
  }

  /** Mensagem nova substitui a anterior; quanto maior o texto, mais tempo fica na tela. */
  say(text: string, now: number) {
    this.label.setText(text);
    this.until = now + Math.min(MAX_MS, BASE_MS + text.length * PER_CHAR_MS);
    this.showing = true;
    this.label.setVisible(true);
    this.panel.setVisible(true);
    this.draw();
  }

  private draw() {
    const width = Math.ceil(this.label.width) + PADDING_X * 2;
    const height = Math.ceil(this.label.height) + PADDING_Y * 2;
    const top = -height - TAIL;
    const g = this.panel;
    g.clear();
    g.fillStyle(0x0a0f28, 0.92);
    g.lineStyle(1.5, 0x5ef08f, 0.5);
    g.fillRoundedRect(-width / 2, top, width, height, RADIUS);
    g.strokeRoundedRect(-width / 2, top, width, height, RADIUS);
    g.fillTriangle(-6, -TAIL + 0.5, 6, -TAIL + 0.5, 0, 0);
    g.lineBetween(-6, -TAIL + 0.5, 0, 0);
    g.lineBetween(6, -TAIL + 0.5, 0, 0);
  }

  /** `(x, y)` é a ponta do rabinho, logo acima do nome. */
  update(x: number, y: number, now: number, alpha: number) {
    if (!this.showing) return;
    const remaining = this.until - now;
    if (remaining <= -FADE_MS) {
      this.hide();
      return;
    }
    const fade = remaining < 0 ? 1 + remaining / FADE_MS : 1;
    const visible = alpha * fade;
    this.panel.setPosition(x, y).setAlpha(visible);
    this.label.setPosition(x, y - TAIL - PADDING_Y).setAlpha(visible);
  }

  hide() {
    this.showing = false;
    this.panel.setVisible(false);
    this.label.setVisible(false);
  }

  destroy() {
    this.panel.destroy();
    this.label.destroy();
  }
}
