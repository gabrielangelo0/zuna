// Classes no estilo clássico: Cavaleiro, Paladino, Feiticeiro e Druida. A classe muda
// quanto de vida e mana o personagem ganha por nível, a força do golpe e dos poderes, e
// quais famílias de poder ele aprende. Tudo vem do banco e é editado no painel.

export interface VocationDef {
  /** Chave gravada no personagem ("cavaleiro"). */
  id: string;
  name: string;
  description: string;
  /** Vida no nível 1 e o que entra a cada nível. */
  hpBase: number;
  hpPerLevel: number;
  manaBase: number;
  manaPerLevel: number;
  /** Multiplica o golpe normal (corpo a corpo ou tiro). */
  attackFactor: number;
  /** Multiplica a força dos poderes, tanto o dano quanto a cura. */
  magicFactor: number;
  /** Multiplica a armadura. */
  armorFactor: number;
  /** Famílias de poder que ela aprende (as outras nem aparecem no grimório). */
  families: string[];
  /** Roupa que vem marcada ao escolher a classe (só roupas gratuitas). */
  outfit: string;
  enabled: boolean;
  sort: number;
}

export interface VocationSettings {
  /** Quanto custa trocar de classe, em diamantes (0 = troca de graça). */
  changePrice: number;
}

export const DEFAULT_VOCATION_SETTINGS: VocationSettings = { changePrice: 150 };

/** Números de quem ainda não tem classe: exatamente o que o jogo fazia antes delas. */
export const NO_VOCATION: Omit<VocationDef, "id" | "name" | "description" | "outfit" | "enabled" | "sort"> = {
  hpBase: 150,
  hpPerLevel: 15,
  manaBase: 50,
  manaPerLevel: 10,
  attackFactor: 1,
  magicFactor: 1,
  armorFactor: 1,
  families: [],
};

/**
 * As quatro de fábrica. O Cavaleiro aguenta e bate de perto; o Paladino acerta de longe e
 * se vira em tudo; o Feiticeiro derruba a tela de poder e cai fácil; a Druida cura e congela.
 */
export const FACTORY_VOCATIONS: readonly VocationDef[] = [
  {
    id: "cavaleiro",
    name: "Cavaleiro",
    description: "Muita vida e armadura. Bate de perto, aguenta o que ninguém aguenta e quase não usa mana.",
    hpBase: 175,
    hpPerLevel: 22,
    manaBase: 40,
    manaPerLevel: 5,
    attackFactor: 1.15,
    magicFactor: 0.7,
    armorFactor: 1.35,
    families: ["heal", "whirl", "quake"],
    outfit: "guerreiro",
    enabled: true,
    sort: 1,
  },
  {
    id: "paladino",
    name: "Paladino",
    description: "O equilíbrio: acerta de longe, tem vida e mana na média e resolve sozinho quase tudo.",
    hpBase: 150,
    hpPerLevel: 16,
    manaBase: 60,
    manaPerLevel: 9,
    attackFactor: 1.05,
    magicFactor: 0.95,
    armorFactor: 1.05,
    families: ["heal", "bolt", "frost", "storm"],
    outfit: "cacador",
    enabled: true,
    sort: 2,
  },
  {
    id: "feiticeiro",
    name: "Feiticeiro",
    description: "Poder puro: limpa a tela com fogo e raio. Muita mana, pouca vida — apanhou, caiu.",
    hpBase: 120,
    hpPerLevel: 10,
    manaBase: 85,
    manaPerLevel: 18,
    attackFactor: 0.75,
    magicFactor: 1.35,
    armorFactor: 0.8,
    families: ["heal", "bolt", "flame", "storm", "inferno"],
    outfit: "aventureiro",
    enabled: true,
    sort: 3,
  },
  {
    id: "druida",
    name: "Druida",
    description: "Cura forte e gelo. Segura o grupo em pé e congela o que vier pela frente.",
    hpBase: 125,
    hpPerLevel: 11,
    manaBase: 80,
    manaPerLevel: 17,
    attackFactor: 0.75,
    magicFactor: 1.25,
    armorFactor: 0.85,
    families: ["heal", "frost", "drain", "quake"],
    outfit: "aventureiro",
    enabled: true,
    sort: 4,
  },
];

export const VOCATION_NAME_MAX = 24;
export const VOCATION_TEXT_MAX = 160;

let catalog: VocationDef[] = [...FACTORY_VOCATIONS];

/** O servidor manda a lista do banco; o cliente guarda a mesma para desenhar as telas. */
export function setVocationCatalog(list: readonly VocationDef[]) {
  catalog = [...list];
}

export function vocationList(): VocationDef[] {
  return catalog;
}

/** Classes que o jogador pode escolher agora. */
export function liveVocations(): VocationDef[] {
  return catalog.filter((vocation) => vocation.enabled).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "pt-BR"));
}

export function vocationById(id: string): VocationDef | undefined {
  return catalog.find((vocation) => vocation.id === id);
}

/** Os números que valem para um personagem: os da classe, ou os de antes das classes. */
export function vocationStats(id: string): Omit<VocationDef, "id" | "name" | "description" | "outfit" | "enabled" | "sort"> {
  const found = vocationById(id);
  if (!found) return NO_VOCATION;
  return {
    hpBase: found.hpBase,
    hpPerLevel: found.hpPerLevel,
    manaBase: found.manaBase,
    manaPerLevel: found.manaPerLevel,
    attackFactor: found.attackFactor,
    magicFactor: found.magicFactor,
    armorFactor: found.armorFactor,
    families: found.families,
  };
}

/** Sem classe, todas as famílias valem (é o jogo de antes). */
export function vocationFamilies(id: string): string[] | undefined {
  const found = vocationById(id);
  return found && found.families.length > 0 ? found.families : undefined;
}

// ---------------------------------------------------------------- painel

export interface AdminVocationRow {
  vocation: VocationDef;
  /** Quantos personagens são dessa classe. */
  players: number;
}

export interface AdminVocationsResponse {
  vocations: AdminVocationRow[];
  settings: VocationSettings;
  /** Personagens que ainda não escolheram. */
  without: number;
}

export interface AdminVocationRequest extends Partial<Omit<VocationDef, "id">> {
  id: string;
  remove?: boolean;
}
