import type { AnimName, BakedDir, TintGroup } from "@zuna/shared";

// O que o baker gera. Os ids viram arquivos em packages/client/public/sprites/<id>.{png,json}.

export interface AnimSpec {
  clip: string;
  frames: number;
  loop: boolean;
  /** Multiplica a velocidade natural do clipe. */
  speed?: number;
  /** false = sem sombra (o cavaleiro usa a sombra da montaria). */
  shadow?: boolean;
}

/** Células "linha,coluna" da textura de paleta que pertencem a cada grupo de cor. */
export type TintSpec = Partial<Record<Exclude<TintGroup, "base">, string[]>>;

export interface EntrySpec {
  id: string;
  /** Relativo a assets/source. */
  file: string;
  /** Altura na tela, em pixels, na pose parada (medida em `fitMeshes`, se houver). */
  height: number;
  anims: Partial<Record<AnimName, AnimSpec>>;
  /** Partes do nome das malhas usadas para medir a altura (ignora chapéus e armas). */
  fitMeshes?: string[];
  /** Acessórios que vêm dentro do modelo: todos ficam escondidos, menos os de `show`. */
  accessories?: string[];
  show?: string[];
  /** Modelos presos a um osso (armas dos esqueletos). */
  attach?: { bone: string; file: string }[];
  tint?: TintSpec;
  /** Troca a cor de materiais pelo nome (variações de montaria). */
  recolor?: Record<string, number>;
  /** Troca a textura de materiais pelo nome (arquivo relativo a assets/source). */
  retexture?: Record<string, string>;
  /** Correção da frente do modelo, em graus. */
  yaw?: number;
  /** Inclina o modelo para frente, em graus (voadores que ficam em pé viram montaria deitada). */
  pitch?: number;
  /** Altura do voo, em pixels. */
  lift?: number;
  /** Osso guardado por quadro: sela nas montarias, quadril nos personagens. */
  seatBone?: string;
  /** Sobe o ponto do osso, em pixels (o osso fica dentro do corpo; a sela fica por cima). */
  seatLift?: number;
  /**
   * Montarias: gera também a camada com o que fica à frente do cavaleiro,
   * a partir desta distância (em tiles) à frente da sela.
   */
  frontMargin?: number;
  /** Ajuste da sombra de contato. */
  footprint?: number;
  /** Espaço extra acima da altura medida, para nome e barra de vida. */
  headExtra?: number;
  /** Aumenta a célula quando golpes ou quedas saem muito da silhueta. */
  cellScale?: number;
  /**
   * Objetos parados (cenário): outros arquivos que entram na mesma folha, com a escala do primeiro.
   * Cada arquivo × rotação vira um quadro `idle/S/<n>`.
   */
  variants?: string[];
  /** Rotações (graus) de cada variação, para ter mais variedade. */
  rotations?: number[];
  dirs?: readonly BakedDir[];
}

const KAYKIT = "kaykit/adventurers";
const SKELETONS = "kaykit/skeletons";
const MONSTERS = "quaternius/monsters";
const ANIMALS = "quaternius/animals";

type Anims = Partial<Record<AnimName, AnimSpec>>;

function humanoid(attack: string, cast = "Spellcast_Shoot"): Anims {
  return {
    idle: { clip: "Idle", frames: 8, loop: true },
    walk: { clip: "Running_A", frames: 8, loop: true, speed: 1.15 },
    attack: { clip: attack, frames: 7, loop: false, speed: 1.3 },
    cast: { clip: cast, frames: 6, loop: false, speed: 1.3 },
    hit: { clip: "Hit_A", frames: 4, loop: false, speed: 1.4 },
    death: { clip: "Death_A", frames: 7, loop: false },
  };
}

function hero(attack: string, cast?: string): Anims {
  return { ...humanoid(attack, cast), ride: { clip: "Sit_Chair_Pose", frames: 1, loop: true, shadow: false } };
}

function bigMonster(attack: string): Anims {
  return {
    idle: { clip: "Idle", frames: 8, loop: true },
    walk: { clip: "Walk", frames: 8, loop: true, speed: 1.4 },
    attack: { clip: attack, frames: 6, loop: false },
    hit: { clip: "HitReact", frames: 4, loop: false },
    death: { clip: "Death", frames: 6, loop: false },
  };
}

const BLOB: Anims = {
  idle: { clip: "Idle", frames: 10, loop: true },
  walk: { clip: "Walk", frames: 6, loop: true },
  attack: { clip: "Bite_Front", frames: 5, loop: false },
  hit: { clip: "HitRecieve", frames: 3, loop: false },
  death: { clip: "Death", frames: 5, loop: false },
};

function flying(attack: string): Anims {
  return {
    idle: { clip: "Flying_Idle", frames: 8, loop: true },
    walk: { clip: "Fast_Flying", frames: 6, loop: true },
    attack: { clip: attack, frames: 6, loop: false },
    hit: { clip: "HitReact", frames: 3, loop: false },
    death: { clip: "Death", frames: 6, loop: false },
  };
}

function animal(attack: string): Anims {
  return {
    idle: { clip: "Idle", frames: 12, loop: true },
    walk: { clip: "Walk", frames: 8, loop: true, speed: 1.5 },
    attack: { clip: attack, frames: 7, loop: false },
    hit: { clip: "Idle_HitReact_Left", frames: 4, loop: false },
    death: { clip: "Death", frames: 7, loop: false },
  };
}

function only(anims: Anims, ...names: AnimName[]): Anims {
  return Object.fromEntries(names.map((name) => [name, anims[name]]));
}

function mount(move: string, idle = "Idle"): Anims {
  return {
    idle: { clip: idle, frames: 12, loop: true },
    walk: { clip: move, frames: 8, loop: true },
  };
}

// ---------------------------------------------------------------- roupas (heróis tingíveis)

/** Mede a altura só pelo corpo: chapéus e armas não mudam o tamanho do herói. */
const BODY = ["_Head", "_Skull", "_Body", "_Leg"];
const HERO_HEIGHT = 70;

const ROGUE_ACCESSORIES = ["Knife_Offhand", "1H_Crossbow", "2H_Crossbow", "Knife", "Throwable"];
const ROGUE_TINT: TintSpec = { skin: ["0,0"], hair: ["0,1"], primary: ["1,1"], secondary: ["1,0"], detail: ["0,5", "2,5"] };
const SKELETON_TINT: TintSpec = { primary: ["2,2"], secondary: ["0,7"], detail: ["0,3"] };

const heroBase = { height: HERO_HEIGHT, fitMeshes: BODY, seatBone: "hips", headExtra: 18 } as const;

export const OUTFITS: EntrySpec[] = [
  {
    ...heroBase,
    id: "outfit_aventureiro",
    file: `${KAYKIT}/Characters/Rogue.glb`,
    accessories: ROGUE_ACCESSORIES,
    show: ["Knife"],
    tint: ROGUE_TINT,
    anims: hero("1H_Melee_Attack_Slice_Diagonal"),
  },
  {
    ...heroBase,
    id: "outfit_guerreiro",
    file: `${KAYKIT}/Characters/Barbarian.glb`,
    accessories: ["1H_Axe_Offhand", "Barbarian_Round_Shield", "1H_Axe", "2H_Axe", "Mug"],
    show: ["1H_Axe", "Barbarian_Round_Shield"],
    tint: { skin: ["0,0"], hair: ["0,1"], primary: ["1,0", "1,1"], secondary: ["0,7"], detail: ["0,6"] },
    anims: hero("1H_Melee_Attack_Chop"),
  },
  {
    ...heroBase,
    id: "outfit_cacador",
    file: `${KAYKIT}/Characters/Rogue_Hooded.glb`,
    accessories: ROGUE_ACCESSORIES,
    show: ["Knife", "Knife_Offhand"],
    tint: ROGUE_TINT,
    anims: hero("Dualwield_Melee_Attack_Stab"),
  },
  {
    ...heroBase,
    id: "outfit_mago",
    file: `${KAYKIT}/Characters/Mage.glb`,
    accessories: ["Spellbook", "Spellbook_open", "1H_Wand", "2H_Staff"],
    show: ["2H_Staff"],
    tint: { skin: ["0,0", "2,7"], hair: ["0,1"], primary: ["1,0", "1,1"], secondary: ["1,2"], detail: ["0,5"] },
    headExtra: 30,
    cellScale: 1.25,
    anims: hero("Spellcast_Shoot", "Spellcast_Raise"),
  },
  {
    ...heroBase,
    id: "outfit_cavaleiroReal",
    file: `${KAYKIT}/Characters/Knight.glb`,
    accessories: ["1H_Sword_Offhand", "Badge_Shield", "Rectangle_Shield", "Round_Shield", "Spike_Shield", "1H_Sword", "2H_Sword"],
    show: ["1H_Sword", "Badge_Shield"],
    tint: { skin: ["0,0"], hair: ["0,1"], primary: ["1,0"], secondary: ["0,6"], detail: ["0,7"] },
    headExtra: 22,
    anims: hero("1H_Melee_Attack_Slice_Horizontal"),
  },
  {
    ...heroBase,
    id: "outfit_sombrio",
    file: `${SKELETONS}/Characters/Skeleton_Rogue.glb`,
    attach: [{ bone: "handslot.r", file: `${SKELETONS}/Assets/Skeleton_Blade.gltf` }],
    tint: SKELETON_TINT,
    anims: hero("1H_Melee_Attack_Stab"),
  },
  {
    ...heroBase,
    id: "outfit_necromante",
    file: `${SKELETONS}/Characters/Skeleton_Mage.glb`,
    attach: [{ bone: "handslot.r", file: `${SKELETONS}/Assets/Skeleton_Staff.gltf` }],
    tint: SKELETON_TINT,
    headExtra: 30,
    cellScale: 1.25,
    anims: hero("Spellcast_Shoot", "Spellcast_Raise"),
  },
];

// ---------------------------------------------------------------- monstros

export const MONSTER_SPRITES: EntrySpec[] = [
  {
    id: "monster_rat",
    file: `${MONSTERS}/Pink_Slime.glb`,
    height: 30,
    recolor: { Pink_Main: 0xf06292, Pink_Secondary: 0xc2185b },
    anims: BLOB,
  },
  { id: "monster_snake", file: `${MONSTERS}/Mushnub.glb`, height: 36, anims: BLOB },
  { id: "monster_wolf", file: `${ANIMALS}/Wolf.glb`, height: 46, anims: animal("Attack") },
  { id: "monster_orc", file: `${MONSTERS}/Orc.glb`, height: 76, anims: bigMonster("Weapon") },
  { id: "monster_troll", file: `${MONSTERS}/Yeti_B.glb`, height: 94, anims: bigMonster("Punch") },
  { id: "monster_cyclops", file: `${MONSTERS}/Demon_B.glb`, height: 110, anims: bigMonster("Weapon") },
  {
    id: "monster_orcLeader",
    file: `${SKELETONS}/Characters/Skeleton_Warrior.glb`,
    height: 100,
    fitMeshes: BODY,
    headExtra: 24,
    cellScale: 1.2,
    attach: [
      { bone: "handslot.r", file: `${SKELETONS}/Assets/Skeleton_Axe.gltf` },
      { bone: "handslot.l", file: `${SKELETONS}/Assets/Skeleton_Shield_Large_A.gltf` },
    ],
    anims: humanoid("1H_Melee_Attack_Chop"),
  },
];

// ---------------------------------------------------------------- mascotes

const PET_WALK = only(BLOB, "idle", "walk");
const PET_FLY = only(flying("Headbutt"), "idle", "walk");

export const PET_SPRITES: EntrySpec[] = [
  { id: "pet_gato", file: `${MONSTERS}/Cat.glb`, height: 36, anims: PET_WALK },
  { id: "pet_galinha", file: `${MONSTERS}/Chicken.glb`, height: 36, anims: PET_WALK },
  { id: "pet_magoMirim", file: `${MONSTERS}/Wizard.glb`, height: 40, anims: PET_WALK },
  { id: "pet_dragaozinho", file: `${MONSTERS}/Dragon.glb`, height: 22, lift: 34, anims: PET_FLY },
  {
    id: "pet_fantasma",
    file: `${MONSTERS}/Ghost.glb`,
    height: 32,
    lift: 30,
    recolor: { Ghost_Main: 0xdcd6f7 },
    anims: PET_FLY,
  },
];

// ---------------------------------------------------------------- montarias

const saddle = { seatBone: "Torso", seatLift: 10, frontMargin: 0.3 } as const;

export const MOUNT_SPRITES: EntrySpec[] = [
  { ...saddle, id: "mount_cavalo", file: `${ANIMALS}/Horse.glb`, height: 86, anims: mount("Gallop") },
  { ...saddle, id: "mount_cavaloBranco", file: `${ANIMALS}/White_Horse.glb`, height: 86, anims: mount("Gallop") },
  {
    ...saddle,
    id: "mount_loboNeves",
    file: `${ANIMALS}/Wolf.glb`,
    height: 66,
    seatLift: 8,
    recolor: { Main: 0xe4ecf4, Main_Light: 0xffffff },
    anims: mount("Gallop"),
  },
  { ...saddle, id: "mount_cervo", file: `${ANIMALS}/Stag.glb`, height: 96, anims: mount("Gallop") },
  {
    ...saddle,
    id: "mount_dragao",
    file: `${MONSTERS}/Squidle.glb`,
    height: 76,
    pitch: 72,
    lift: 26,
    seatLift: 16,
    recolor: { Squidle_Main: 0xc0392b, Squidle_Secondary: 0xf2b134, Squidle_Horn: 0xf4ead2 },
    // O voo rápido aponta o focinho para baixo depois da inclinação: o voo parado, acelerado, fica melhor.
    anims: {
      idle: { clip: "Flying_Idle", frames: 10, loop: true },
      walk: { clip: "Flying_Idle", frames: 8, loop: true, speed: 1.8 },
    },
  },
];

// ---------------------------------------------------------------- cenário

const NATURE = "quaternius/nature-megakit/glTF";
const HEXAGON = "kaykit/medieval-hexagon";
const numbered = (prefix: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${NATURE}/${prefix}_${from + i}.gltf`);

export const PROP_SPRITES: EntrySpec[] = [
  {
    id: "prop_tree",
    file: `${NATURE}/CommonTree_1.gltf`,
    variants: numbered("CommonTree", 2, 5),
    rotations: [0, 150],
    height: 118,
    footprint: 0.3,
    anims: {},
  },
  { id: "prop_pine", file: `${NATURE}/Pine_1.gltf`, variants: numbered("Pine", 2, 5), height: 132, footprint: 0.3, anims: {} },
  {
    id: "prop_rock",
    file: `${NATURE}/Rock_Medium_1.gltf`,
    variants: numbered("Rock_Medium", 2, 3),
    rotations: [0, 100, 210],
    height: 34,
    anims: {},
  },
  {
    id: "prop_bush",
    file: `${NATURE}/Bush_Common.gltf`,
    variants: [`${NATURE}/Bush_Common_Flowers.gltf`],
    rotations: [0, 120, 240],
    height: 38,
    // O arbusto comum usa a folha avermelhada da árvore retorcida; a verde combina com o resto.
    retexture: { Leaves_TwistedTree: `${NATURE}/Leaves_NormalTree_C.png` },
    anims: {},
  },
  {
    id: "prop_flowers",
    file: `${NATURE}/Flower_3_Group.gltf`,
    variants: [`${NATURE}/Flower_4_Group.gltf`, `${NATURE}/Clover_1.gltf`, `${NATURE}/Clover_2.gltf`],
    rotations: [0, 180],
    height: 18,
    anims: {},
  },
  {
    id: "prop_banner",
    file: `${HEXAGON}/decoration/props/flag_red.gltf`,
    variants: ["blue", "yellow", "green"].map((color) => `${HEXAGON}/decoration/props/flag_${color}.gltf`),
    // De frente o pano fica de perfil; girado, a bandeira aparece.
    rotations: [60],
    height: 72,
    anims: {},
  },
];

export const CATALOG: EntrySpec[] = [...OUTFITS, ...MONSTER_SPRITES, ...PET_SPRITES, ...MOUNT_SPRITES, ...PROP_SPRITES];
