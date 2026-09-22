import type Phaser from "phaser";
import { gearItem, rarityCss, type ItemAtlas } from "@zuna/shared";

// Ícones dos equipamentos: um atlas só (sprites/items.webp), gerado pelo baker a partir dos modelos 3D.
// Na interface viram <span> com o recorte do atlas; no chão do mundo, quadros de uma textura do Phaser.

const TEXTURE = "items";
let atlasPromise: Promise<ItemAtlas> | null = null;
let atlas: ItemAtlas | null = null;

export function loadItemAtlas(): Promise<ItemAtlas> {
  atlasPromise ??= fetch("/sprites/items.json")
    .then((response) => response.json() as Promise<ItemAtlas>)
    .then((data) => (atlas = data));
  return atlasPromise;
}

/** Recorte do ícone no tamanho pedido. Sem o atlas carregado ainda, o recorte aparece quando ele chegar. */
export function iconElement(icon: string, size: number, className = "item-icon"): HTMLSpanElement {
  const node = document.createElement("span");
  node.className = className;
  node.style.width = `${size}px`;
  node.style.height = `${size}px`;
  const paint = (data: ItemAtlas) => {
    const at = data.icons[icon];
    if (!at) return;
    const scale = size / data.size;
    node.style.backgroundImage = `url("/sprites/${data.image}")`;
    node.style.backgroundSize = `${data.width * scale}px ${data.height * scale}px`;
    node.style.backgroundPosition = `${-at[0] * scale}px ${-at[1] * scale}px`;
  };
  if (atlas) paint(atlas);
  else void loadItemAtlas().then(paint);
  return node;
}

/** Ícone de um equipamento, com a moldura da cor da raridade. */
export function itemSlotElement(itemId: string, size: number): HTMLSpanElement {
  const item = gearItem(itemId);
  const frame = document.createElement("span");
  frame.className = `item-frame rarity-${item?.rarity ?? "comum"}`;
  if (item) {
    frame.style.setProperty("--rarity", rarityCss(item.rarity));
    frame.append(iconElement(item.icon, size));
  }
  return frame;
}

/** Textura do Phaser com um quadro por ícone, carregada uma vez. */
let texturePromise: Promise<boolean> | null = null;

export function ensureItemTexture(scene: Phaser.Scene): Promise<boolean> {
  texturePromise ??= (async () => {
    const data = await loadItemAtlas();
    if (scene.textures.exists(TEXTURE)) return true;
    const image = new Image();
    image.src = `/sprites/${data.image}`;
    await image.decode();
    const texture = scene.textures.addImage(TEXTURE, image);
    if (!texture) return false;
    for (const [id, [x, y]] of Object.entries(data.icons)) texture.add(id, 0, x, y, data.size, data.size);
    return true;
  })().catch(() => false);
  return texturePromise;
}

export const ITEM_TEXTURE = TEXTURE;
