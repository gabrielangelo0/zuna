import { SLOT_PART, VISIBLE_SLOTS, lookOf } from "@zuna/shared";

// Personagem em camadas: cada roupa foi gerada em partes (calça, botas, tronco, cabeça, chapéu,
// arma e escudo) e cada equipamento como uma camada no lugar de uma parte. Todas as camadas de
// uma roupa têm a mesma célula e o mesmo pé: basta desenhar uma por cima da outra no mesmo quadro.

/** Ordem de desenho (de trás para a frente). */
export const PART_ORDER = ["legs", "boots", "torso", "head", "hat", "weapon", "shield"] as const;

export type BodyPart = (typeof PART_ORDER)[number];

export interface LayerPick {
  part: BodyPart;
  /** Folha: "part_<roupa>_<parte>" (tingida com as cores do jogador) ou "gear_<roupa>_<aparência>". */
  id: string;
  tinted: boolean;
  /** Tom do equipamento (dourado, gelo…); branco = sem tom. */
  hue: number;
}

let index: Record<string, string[]> | null = null;
let loading: Promise<void> | null = null;

/** Quais camadas existem para cada roupa (sprites/layers.json, gerado pelo baker). */
export function loadLayerIndex(): Promise<void> {
  loading ??= fetch(`${import.meta.env.BASE_URL}sprites/layers.json`)
    .then((response) => (response.ok ? (response.json() as Promise<Record<string, string[]>>) : null))
    .then((data) => {
      index = data;
    })
    .catch(() => {
      index = null;
    });
  return loading;
}

export function layersReady(): boolean {
  return index !== null;
}

/**
 * Camadas do personagem com o que está vestido (`looks`: ícones na ordem de VISIBLE_SLOTS).
 * null = roupa sem camadas (ou índice ainda não carregado): desenha a folha inteira da roupa.
 */
export function layerPicks(outfit: string, looks: string): LayerPick[] | null {
  const available = index?.[outfit];
  if (!available) return null;
  const has = new Set(available);
  const worn = new Map<string, { look: string; hue: number }>();
  const icons = looks ? looks.split(",") : [];
  VISIBLE_SLOTS.forEach((slot, i) => {
    const icon = icons[i];
    if (!icon) return;
    const look = lookOf(icon);
    if (has.has(look.look)) worn.set(SLOT_PART[slot], look);
  });
  const picks: LayerPick[] = [];
  for (const part of PART_ORDER) {
    const gear = worn.get(part);
    if (gear) picks.push({ part, id: `gear_${outfit}_${gear.look}`, tinted: false, hue: gear.hue });
    else if (has.has(part)) picks.push({ part, id: `part_${outfit}_${part}`, tinted: true, hue: 0xffffff });
  }
  return picks;
}
