import type { AnimName, BakedDir, TintGroup } from "@zuna/shared";
import type { LayerPlan, LegSplit } from "./model.ts";
import { ICON_HUES as SHARED_HUES } from "@zuna/shared";

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
  /** Tira a textura e pinta o material de uma cor lisa (pinheiro com neve). */
  flat?: Record<string, number>;
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
  /** Só estes nós ficam visíveis (uma peça de dentro de um personagem, como o elmo do cavaleiro). */
  only?: string[];
  /** Gira o modelo de lado, em graus (espada deitada na diagonal do ícone). */
  roll?: number;
  /** Multiplica a cor de todos os materiais (a mesma peça em versões de outra raridade). */
  hue?: number;
  /** Ícone de calça ("legs") ou de bota ("boots"): só essa metade da perna. */
  split?: LegSplit;
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

  // Floresta Sombria
  {
    id: "monster_fox",
    file: `${ANIMALS}/Fox.glb`,
    height: 42,
    recolor: { Main: 0x3a3f58, Main_Light: 0x9aa3c7 },
    anims: animal("Attack"),
  },
  {
    id: "monster_mushroomBrute",
    file: `${MONSTERS}/Mushnub_Evolved.glb`,
    height: 50,
    recolor: { MushroomKing_Secondary: 0x7b3fb0 },
    anims: BLOB,
  },
  { id: "monster_golem", file: `${MONSTERS}/Goleling.glb`, height: 60, lift: 10, anims: flying("Punch") },
  {
    id: "monster_mushroomKing",
    file: `${MONSTERS}/Mushroom_King.glb`,
    height: 124,
    cellScale: 1.2,
    headExtra: 20,
    anims: bigMonster("Punch"),
  },

  // Pântano
  { id: "monster_spikyBlob", file: `${MONSTERS}/Green_Spiky_Blob.glb`, height: 40, anims: BLOB },
  { id: "monster_frog", file: `${MONSTERS}/Frog.glb`, height: 62, anims: bigMonster("Punch") },
  { id: "monster_glub", file: `${MONSTERS}/Glub_Evolved.glb`, height: 56, lift: 22, anims: flying("Headbutt") },
  {
    id: "monster_frogKing",
    file: `${MONSTERS}/Frog.glb`,
    height: 118,
    cellScale: 1.2,
    headExtra: 20,
    recolor: { Frog_Main: 0x3f8f3a, Frog_Secondary: 0xd4b43a },
    anims: bigMonster("Weapon"),
  },

  // Deserto
  { id: "monster_cactus", file: `${MONSTERS}/Cactoro.glb`, height: 44, anims: BLOB },
  { id: "monster_wasp", file: `${MONSTERS}/Armabee.glb`, height: 40, lift: 26, anims: flying("Headbutt") },
  {
    id: "monster_raptor",
    file: `${MONSTERS}/Dino.glb`,
    height: 78,
    recolor: { Dino_Main: 0x9a6a2a, Dino_Secondary: 0x5a3d1c },
    anims: bigMonster("Punch"),
  },
  { id: "monster_cactusWarrior", file: `${MONSTERS}/Cactoro_B.glb`, height: 84, anims: bigMonster("Punch") },
  {
    id: "monster_raptorAlpha",
    file: `${MONSTERS}/Dino.glb`,
    height: 124,
    cellScale: 1.2,
    headExtra: 20,
    recolor: { Dino_Main: 0x8a1f2a, Dino_Secondary: 0x2a2a2a },
    anims: bigMonster("Weapon"),
  },

  // Montanhas Geladas
  { id: "monster_yetiCub", file: `${MONSTERS}/Yeti.glb`, height: 52, anims: BLOB },
  {
    id: "monster_iceSpirit",
    file: `${MONSTERS}/Hywirl.glb`,
    height: 54,
    lift: 20,
    recolor: { Hywirl_Main: 0x7fc8f0 },
    anims: flying("Punch"),
  },
  {
    id: "monster_bison",
    file: `${ANIMALS}/Bull.glb`,
    height: 74,
    recolor: { Main: 0x5a4636, Main_Light: 0xe8e4dc },
    anims: animal("Attack_Headbutt"),
  },
  {
    id: "monster_yetiElder",
    file: `${MONSTERS}/Yeti_B.glb`,
    height: 132,
    cellScale: 1.2,
    headExtra: 20,
    recolor: { Yeti_Main: 0xeef4f8, Yeti_Secondary: 0x7fb6d4 },
    anims: bigMonster("Punch"),
  },

  // Cripta
  {
    id: "monster_skeleton",
    file: `${SKELETONS}/Characters/Skeleton_Minion.glb`,
    height: 68,
    fitMeshes: BODY,
    headExtra: 18,
    attach: [{ bone: "handslot.r", file: `${SKELETONS}/Assets/Skeleton_Blade.gltf` }],
    anims: humanoid("1H_Melee_Attack_Chop"),
  },
  { id: "monster_ghostSkull", file: `${MONSTERS}/Ghost_Skull.glb`, height: 50, lift: 24, anims: flying("Headbutt") },
  {
    id: "monster_skeletonMage",
    file: `${SKELETONS}/Characters/Skeleton_Mage.glb`,
    height: 70,
    fitMeshes: BODY,
    headExtra: 30,
    cellScale: 1.25,
    attach: [{ bone: "handslot.r", file: `${SKELETONS}/Assets/Skeleton_Staff.gltf` }],
    anims: humanoid("Spellcast_Shoot", "Spellcast_Raise"),
  },
  {
    id: "monster_necroLord",
    file: `${SKELETONS}/Characters/Skeleton_Mage.glb`,
    height: 112,
    fitMeshes: BODY,
    headExtra: 34,
    cellScale: 1.3,
    attach: [{ bone: "handslot.r", file: `${SKELETONS}/Assets/Skeleton_Staff.gltf` }],
    anims: humanoid("Spellcast_Raise", "Spellcast_Shoot"),
  },

  // Vulcão
  { id: "monster_imp", file: `${MONSTERS}/Demon.glb`, height: 54, lift: 24, anims: flying("Punch") },
  { id: "monster_blueDemon", file: `${MONSTERS}/Blue_Demon.glb`, height: 112, cellScale: 1.15, anims: bigMonster("Weapon") },
  {
    id: "monster_dragon",
    file: `${MONSTERS}/Dragon_Evolved.glb`,
    height: 120,
    lift: 30,
    cellScale: 1.3,
    headExtra: 20,
    anims: flying("Headbutt"),
  },

  // Covil dos Dragões
  {
    id: "monster_dragonGreen",
    file: `${MONSTERS}/Dragon.glb`,
    height: 60,
    lift: 24,
    recolor: { Dragon_Main: 0x3f8a3a, Dragon_Secondary: 0xd8c070, Dragon_Horn: 0xe8e0c8 },
    anims: flying("Headbutt"),
  },
  {
    id: "monster_dragonIce",
    file: `${MONSTERS}/Dragon.glb`,
    height: 64,
    lift: 26,
    recolor: { Dragon_Main: 0x9fd6ee, Dragon_Secondary: 0xeaf6ff, Dragon_Horn: 0x4a6fa0 },
    anims: flying("Headbutt"),
  },
  {
    id: "monster_dragonRed",
    file: `${MONSTERS}/Dragon_Evolved.glb`,
    height: 128,
    lift: 30,
    cellScale: 1.3,
    headExtra: 16,
    recolor: { Dragon_Main: 0xb3261e, Dragon_Secondary: 0x3a1a14, Dragon_Horn: 0xe8d8b0 },
    anims: flying("Headbutt"),
  },
  {
    id: "monster_dragonLord",
    file: `${MONSTERS}/Dragon_Evolved.glb`,
    height: 134,
    lift: 32,
    cellScale: 1.3,
    headExtra: 22,
    recolor: { Dragon_Main: 0x2a2438, Dragon_Secondary: 0xc8322a, Dragon_Horn: 0xe8c060 },
    anims: flying("Headbutt"),
  },

  // Abismo Demoníaco
  {
    id: "monster_hellfire",
    file: `${MONSTERS}/Demon_B.glb`,
    height: 120,
    cellScale: 1.2,
    headExtra: 16,
    recolor: { Demon_Main: 0x2a1616, Black: 0xff6a1f },
    anims: bigMonster("Weapon"),
  },
  {
    id: "monster_shadowBeast",
    file: `${MONSTERS}/Alien_B.glb`,
    height: 104,
    cellScale: 1.2,
    recolor: { Alien_Main: 0x2c2240, Alien_Secondary: 0x9a4ad8 },
    anims: bigMonster("Punch"),
  },
  {
    id: "monster_behemoth",
    file: `${MONSTERS}/Yeti.glb`,
    height: 118,
    cellScale: 1.3,
    headExtra: 14,
    recolor: { Yeti_Main: 0x4a3a30, Yeti_Secondary: 0x8a6a4a },
    anims: BLOB,
  },
  {
    id: "monster_archdemon",
    file: `${MONSTERS}/Demon_B.glb`,
    height: 150,
    cellScale: 1.3,
    headExtra: 22,
    recolor: { Demon_Main: 0x5a1a6a, Black: 0x1a0a20 },
    anims: bigMonster("Weapon"),
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
const DUNGEON = "kaykit/dungeon";
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
    id: "prop_deadtree",
    file: `${NATURE}/DeadTree_1.gltf`,
    variants: numbered("DeadTree", 2, 5),
    rotations: [0, 140],
    height: 108,
    footprint: 0.3,
    anims: {},
  },
  {
    id: "prop_twisted",
    file: `${NATURE}/TwistedTree_1.gltf`,
    variants: numbered("TwistedTree", 2, 5),
    rotations: [0, 160],
    height: 122,
    footprint: 0.3,
    // A folha vem vermelho vivo; escurecida vira a mata da Floresta Sombria.
    recolor: { Leaves_TwistedTree: 0x7c4f8c },
    anims: {},
  },
  {
    id: "prop_mushroom",
    file: `${NATURE}/Mushroom_Common.gltf`,
    variants: [`${NATURE}/Mushroom_Laetiporus.gltf`],
    rotations: [0, 120, 240],
    height: 22,
    anims: {},
  },
  {
    id: "prop_snowpine",
    file: `${NATURE}/Pine_1.gltf`,
    variants: numbered("Pine", 2, 5),
    height: 132,
    footprint: 0.3,
    flat: { Leaves_Pine: 0xdfeef6 },
    recolor: { Bark_NormalTree: 0x9a8a80 },
    anims: {},
  },
  {
    id: "prop_crystal",
    file: "builtin:crystal",
    rotations: [15, 110, 220],
    height: 58,
    recolor: { crystal_gem: 0x8a7dff },
    anims: {},
  },
  {
    id: "prop_lavarock",
    file: `${NATURE}/Rock_Medium_1.gltf`,
    variants: numbered("Rock_Medium", 2, 3),
    rotations: [0, 100, 210],
    height: 38,
    recolor: { Rocks: 0x4a3530 },
    anims: {},
  },
  {
    id: "prop_lily",
    file: `${HEXAGON}/decoration/nature/waterlily_A.gltf`,
    variants: [`${HEXAGON}/decoration/nature/waterlily_B.gltf`],
    rotations: [0, 90, 200],
    // A folha é quase plana: a escala sai da altura, então a altura é bem pequena.
    height: 3,
    anims: {},
  },
  {
    id: "prop_fern",
    file: `${NATURE}/Fern_1.gltf`,
    variants: [`${NATURE}/Plant_7.gltf`, `${NATURE}/Plant_1.gltf`],
    rotations: [0, 150],
    height: 28,
    anims: {},
  },
  {
    id: "prop_barrel",
    file: `${HEXAGON}/decoration/props/barrel.gltf`,
    variants: [`${HEXAGON}/decoration/props/crate_A_big.gltf`, `${HEXAGON}/decoration/props/crate_B_big.gltf`],
    rotations: [20],
    height: 34,
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

/** Drops no chão: moedas (comum), baú (raro) e o Cristal de Zuna (lendário). */
export const LOOT_SPRITES: EntrySpec[] = [
  {
    id: "loot_coins",
    file: `${DUNGEON}/coin_stack_small.gltf.glb`,
    variants: [`${DUNGEON}/coin_stack_medium.gltf.glb`, `${DUNGEON}/coin_stack_large.gltf.glb`],
    rotations: [0, 120],
    height: 22,
    anims: {},
  },
  { id: "loot_chest", file: `${DUNGEON}/chest_gold.glb`, rotations: [25], height: 36, anims: {} },
  { id: "loot_crystal", file: "builtin:crystal", rotations: [15], height: 34, anims: {} },
];

// ---------------------------------------------------------------- ícones de itens
// Um quadro por ícone, todos no mesmo atlas (sprites/items.webp). Armas e escudos são modelos soltos;
// elmos, armaduras e botas são as peças de dentro dos heróis e esqueletos (`only`).

const ADV = `${KAYKIT}/Assets`;
const SKEL = `${SKELETONS}/Assets`;
const weapon = (id: string, file: string, roll = -45, extra: Partial<EntrySpec> = {}): EntrySpec => ({
  id,
  file,
  height: 64,
  anims: {},
  roll,
  yaw: 20,
  ...extra,
});
const shield = (id: string, file: string, extra: Partial<EntrySpec> = {}): EntrySpec => ({ id, file, height: 64, anims: {}, yaw: 20, ...extra });
const part = (id: string, file: string, only: string[], extra: Partial<EntrySpec> = {}): EntrySpec => ({
  id,
  file,
  height: 64,
  anims: {},
  only,
  yaw: 25,
  ...extra,
});
const knight = `${KAYKIT}/Characters/Knight.glb`;
const barbarian = `${KAYKIT}/Characters/Barbarian.glb`;
const mage = `${KAYKIT}/Characters/Mage.glb`;
const rogue = `${KAYKIT}/Characters/Rogue.glb`;
const warrior = `${SKELETONS}/Characters/Skeleton_Warrior.glb`;
const skelMage = `${SKELETONS}/Characters/Skeleton_Mage.glb`;
const skelRogue = `${SKELETONS}/Characters/Skeleton_Rogue.glb`;

export const ITEM_ICONS: EntrySpec[] = [
  // Armas
  weapon("sword", `${ADV}/sword_1handed.gltf`),
  weapon("greatsword", `${ADV}/sword_2handed.gltf`),
  weapon("greatsword_royal", `${ADV}/sword_2handed_color.gltf`),
  weapon("axe", `${ADV}/axe_1handed.gltf`),
  weapon("greataxe", `${ADV}/axe_2handed.gltf`),
  weapon("dagger", `${ADV}/dagger.gltf`),
  weapon("wand", `${ADV}/wand.gltf`),
  weapon("staff", `${ADV}/staff.gltf`),
  weapon("crossbow", `${ADV}/crossbow_1handed.gltf`, 0),
  weapon("heavy_crossbow", `${ADV}/crossbow_2handed.gltf`, 0),
  weapon("bone_axe", `${SKEL}/Skeleton_Axe.gltf`),
  weapon("bone_blade", `${SKEL}/Skeleton_Blade.gltf`),
  weapon("bone_staff", `${SKEL}/Skeleton_Staff.gltf`),
  weapon("bone_crossbow", `${SKEL}/Skeleton_Crossbow.gltf`, 0),
  // Escudos e livros
  shield("shield_round", `${ADV}/shield_round.gltf`),
  shield("shield_round_color", `${ADV}/shield_round_color.gltf`),
  shield("shield_barbarian", `${ADV}/shield_round_barbarian.gltf`),
  shield("shield_badge", `${ADV}/shield_badge.gltf`),
  shield("shield_badge_color", `${ADV}/shield_badge_color.gltf`),
  shield("shield_spikes", `${ADV}/shield_spikes.gltf`),
  shield("shield_spikes_color", `${ADV}/shield_spikes_color.gltf`),
  shield("shield_square", `${ADV}/shield_square.gltf`),
  shield("shield_square_color", `${ADV}/shield_square_color.gltf`),
  shield("bone_shield_large", `${SKEL}/Skeleton_Shield_Large_A.gltf`),
  shield("bone_shield_large_b", `${SKEL}/Skeleton_Shield_Large_B.gltf`),
  shield("bone_shield_small", `${SKEL}/Skeleton_Shield_Small_A.gltf`),
  shield("spellbook", `${ADV}/spellbook_closed.gltf`),
  // Elmos
  part("helm_knight", knight, ["Knight_Helmet"]),
  part("helm_barbarian", barbarian, ["Barbarian_Hat"]),
  part("hat_mage", mage, ["Mage_Hat"]),
  part("helm_bone", warrior, ["Skeleton_Warrior_Helmet"]),
  part("hat_necro", skelMage, ["Skeleton_Mage_Hat"]),
  part("hood_rogue", skelRogue, ["Skeleton_Rogue_Hood"]),
  // Armaduras
  part("armor_knight", knight, ["Knight_Body"]),
  part("armor_barbarian", barbarian, ["Barbarian_Body"]),
  part("robe_mage", mage, ["Mage_Body"]),
  part("tunic_rogue", rogue, ["Rogue_Body"]),
  part("armor_bone", warrior, ["Skeleton_Warrior_Body"]),
  // Calças (a perna sem o pé) e botas (só o pé)
  part("legs_knight", knight, ["Knight_LegLeft", "Knight_LegRight"], { split: "legs" }),
  part("legs_barbarian", barbarian, ["Barbarian_LegLeft", "Barbarian_LegRight"], { split: "legs" }),
  part("legs_mage", mage, ["Mage_LegLeft", "Mage_LegRight"], { split: "legs" }),
  part("legs_rogue", rogue, ["Rogue_LegLeft", "Rogue_LegRight"], { split: "legs" }),
  part("boots_knight", knight, ["Knight_LegLeft", "Knight_LegRight"], { split: "boots" }),
  part("boots_barbarian", barbarian, ["Barbarian_LegLeft", "Barbarian_LegRight"], { split: "boots" }),
  part("boots_mage", mage, ["Mage_LegLeft", "Mage_LegRight"], { split: "boots" }),
  part("boots_rogue", rogue, ["Rogue_LegLeft", "Rogue_LegRight"], { split: "boots" }),
  // Amuleto, anel e poções (modelados no baker), bolsa e flechas
  { id: "amulet", file: "builtin:amulet", height: 64, anims: {}, yaw: 10 },
  { id: "ring", file: "builtin:ring", height: 64, anims: {}, yaw: 20, pitch: 55 },
  { id: "sack", file: "builtin:backpack", height: 64, anims: {}, yaw: 30 },
  { id: "arrows", file: `${ADV}/arrow_bundle.gltf`, height: 64, anims: {}, yaw: 20, roll: -30 },
  ...["potion_red", "potion_red_big", "potion_red_huge", "potion_blue", "potion_blue_big", "potion_blue_huge"].map(
    (id): EntrySpec => ({ id, file: `builtin:${id}`, height: 64, anims: {}, yaw: 15 }),
  ),
];

/** Versões de outra cor das peças principais, para os itens mais fortes: tom multiplicado sobre a textura. */
const ICON_HUES = SHARED_HUES;
const HUED = [
  "sword", "greatsword", "axe", "greataxe", "dagger", "staff", "wand", "crossbow",
  "shield_round", "shield_badge", "shield_square", "bone_shield_large",
  "helm_knight", "helm_bone", "hat_mage", "armor_knight", "armor_bone", "robe_mage", "legs_knight", "legs_mage",
  "boots_knight", "boots_mage", "amulet", "ring", "sack", "arrows",
];
for (const base of HUED) {
  const spec = ITEM_ICONS.find((entry) => entry.id === base)!;
  for (const [name, hue] of Object.entries(ICON_HUES)) ITEM_ICONS.push({ ...spec, id: `${base}_${name}`, hue });
}

// ---------------------------------------------------------------- personagem em camadas
// Cada roupa vira partes (cabeça, chapéu, tronco, calça, botas, arma e escudo) e cada equipamento
// vira uma camada no lugar de uma parte. Todas as camadas de uma roupa têm a mesma escala e a mesma
// célula da folha inteira, e o resto do corpo esconde o que fica atrás: no jogo, basta empilhar.

export type BodyPart = "head" | "hat" | "torso" | "legs" | "boots" | "weapon" | "shield";

export const BODY_PARTS: readonly BodyPart[] = ["head", "hat", "torso", "legs", "boots", "weapon", "shield"];

/** Nós de cada parte, por roupa. Pernas: "legs" e "boots" vêm da mesma malha, divididas pelo osso do pé. */
const OUTFIT_PARTS: Record<string, Partial<Record<Exclude<BodyPart, "boots">, string[]>>> = {
  aventureiro: {
    head: ["Rogue_Head"],
    torso: ["Rogue_Body", "Rogue_ArmLeft", "Rogue_ArmRight", "Rogue_Cape"],
    legs: ["Rogue_LegLeft", "Rogue_LegRight"],
    weapon: ["Knife"],
  },
  guerreiro: {
    head: ["Barbarian_Head"],
    hat: ["Barbarian_Hat"],
    torso: ["Barbarian_Body", "Barbarian_ArmLeft", "Barbarian_ArmRight", "Barbarian_Cape"],
    legs: ["Barbarian_LegLeft", "Barbarian_LegRight"],
    weapon: ["1H_Axe"],
    shield: ["Barbarian_Round_Shield"],
  },
  cacador: {
    head: ["Rogue_Head_Hooded"],
    torso: ["Rogue_Body", "Rogue_ArmLeft", "Rogue_ArmRight", "Rogue_Cape"],
    legs: ["Rogue_LegLeft", "Rogue_LegRight"],
    weapon: ["Knife"],
    shield: ["Knife_Offhand"],
  },
  mago: {
    head: ["Mage_Head"],
    hat: ["Mage_Hat"],
    torso: ["Mage_Body", "Mage_ArmLeft", "Mage_ArmRight", "Mage_Cape"],
    legs: ["Mage_LegLeft", "Mage_LegRight"],
    weapon: ["2H_Staff"],
  },
  cavaleiroReal: {
    head: ["Knight_Head"],
    hat: ["Knight_Helmet"],
    torso: ["Knight_Body", "Knight_ArmLeft", "Knight_ArmRight", "Knight_Cape"],
    legs: ["Knight_LegLeft", "Knight_LegRight"],
    weapon: ["1H_Sword"],
    shield: ["Badge_Shield"],
  },
  sombrio: {
    head: ["Skeleton_Rogue_Head", "Skeleton_Rogue_Jaw", "Skeleton_Rogue_Eyes"],
    hat: ["Skeleton_Rogue_Hood"],
    torso: ["Skeleton_Rogue_Body", "Skeleton_Rogue_ArmLeft", "Skeleton_Rogue_ArmRight", "Skeleton_Rogue_Cape"],
    legs: ["Skeleton_Rogue_LegLeft", "Skeleton_Rogue_LegRight"],
    weapon: ["@attach"],
  },
  necromante: {
    head: ["Skeleton_Mage_Skull", "Skeleton_Mage_Jaw", "Skeleton_Mage_Eyes"],
    hat: ["Skeleton_Mage_Hat"],
    torso: ["Skeleton_Mage_Body", "Skeleton_Mage_ArmLeft", "Skeleton_Mage_ArmRight"],
    legs: ["Skeleton_Mage_LegLeft", "Skeleton_Mage_LegRight"],
    weapon: ["@attach"],
  },
};

/** Aparência de um equipamento: de que peça vem e que parte do corpo substitui. */
export interface GearLook {
  id: string;
  part: Exclude<BodyPart, "head">;
  borrow?: { file: string; nodes: string[]; split?: "legs" | "boots" };
  hold?: { bone: string; file: string };
}

const heroFile = (name: string) => `${KAYKIT}/Characters/${name}.glb`;
const skeletonFile = (name: string) => `${SKELETONS}/Characters/Skeleton_${name}.glb`;
const hat = (id: string, file: string, node: string): GearLook => ({ id, part: "hat", borrow: { file, nodes: [node] } });
const torso = (id: string, file: string, nodes: string[]): GearLook => ({ id, part: "torso", borrow: { file, nodes } });
const legs = (id: string, file: string, prefix: string): GearLook => ({
  id,
  part: "legs",
  borrow: { file, nodes: [`${prefix}_LegLeft`, `${prefix}_LegRight`], split: "legs" },
});
const boots = (id: string, file: string, prefix: string): GearLook => ({
  id,
  part: "boots",
  borrow: { file, nodes: [`${prefix}_LegLeft`, `${prefix}_LegRight`], split: "boots" },
});
const right = (id: string, file: string): GearLook => ({ id, part: "weapon", hold: { bone: "handslot.r", file } });
const left = (id: string, file: string): GearLook => ({ id, part: "shield", hold: { bone: "handslot.l", file } });

export const GEAR_LOOKS: GearLook[] = [
  hat("helm_knight", heroFile("Knight"), "Knight_Helmet"),
  hat("helm_barbarian", heroFile("Barbarian"), "Barbarian_Hat"),
  hat("hat_mage", heroFile("Mage"), "Mage_Hat"),
  hat("helm_bone", skeletonFile("Warrior"), "Skeleton_Warrior_Helmet"),
  hat("hat_necro", skeletonFile("Mage"), "Skeleton_Mage_Hat"),
  hat("hood_rogue", skeletonFile("Rogue"), "Skeleton_Rogue_Hood"),
  torso("armor_knight", heroFile("Knight"), ["Knight_Body", "Knight_ArmLeft", "Knight_ArmRight"]),
  torso("armor_barbarian", heroFile("Barbarian"), ["Barbarian_Body", "Barbarian_ArmLeft", "Barbarian_ArmRight"]),
  torso("robe_mage", heroFile("Mage"), ["Mage_Body", "Mage_ArmLeft", "Mage_ArmRight"]),
  torso("tunic_rogue", heroFile("Rogue"), ["Rogue_Body", "Rogue_ArmLeft", "Rogue_ArmRight"]),
  torso("armor_bone", skeletonFile("Warrior"), ["Skeleton_Warrior_Body", "Skeleton_Warrior_ArmLeft", "Skeleton_Warrior_ArmRight"]),
  legs("legs_knight", heroFile("Knight"), "Knight"),
  legs("legs_barbarian", heroFile("Barbarian"), "Barbarian"),
  legs("legs_mage", heroFile("Mage"), "Mage"),
  legs("legs_rogue", heroFile("Rogue"), "Rogue"),
  boots("boots_knight", heroFile("Knight"), "Knight"),
  boots("boots_barbarian", heroFile("Barbarian"), "Barbarian"),
  boots("boots_mage", heroFile("Mage"), "Mage"),
  boots("boots_rogue", heroFile("Rogue"), "Rogue"),
  right("sword", `${ADV}/sword_1handed.gltf`),
  right("greatsword", `${ADV}/sword_2handed.gltf`),
  right("greatsword_royal", `${ADV}/sword_2handed_color.gltf`),
  right("axe", `${ADV}/axe_1handed.gltf`),
  right("greataxe", `${ADV}/axe_2handed.gltf`),
  right("dagger", `${ADV}/dagger.gltf`),
  right("wand", `${ADV}/wand.gltf`),
  right("staff", `${ADV}/staff.gltf`),
  right("crossbow", `${ADV}/crossbow_1handed.gltf`),
  right("heavy_crossbow", `${ADV}/crossbow_2handed.gltf`),
  right("bone_axe", `${SKEL}/Skeleton_Axe.gltf`),
  right("bone_blade", `${SKEL}/Skeleton_Blade.gltf`),
  right("bone_staff", `${SKEL}/Skeleton_Staff.gltf`),
  left("shield_round", `${ADV}/shield_round.gltf`),
  left("shield_round_color", `${ADV}/shield_round_color.gltf`),
  left("shield_barbarian", `${ADV}/shield_round_barbarian.gltf`),
  left("shield_badge", `${ADV}/shield_badge.gltf`),
  left("shield_badge_color", `${ADV}/shield_badge_color.gltf`),
  left("shield_spikes", `${ADV}/shield_spikes.gltf`),
  left("shield_spikes_color", `${ADV}/shield_spikes_color.gltf`),
  left("shield_square", `${ADV}/shield_square.gltf`),
  left("shield_square_color", `${ADV}/shield_square_color.gltf`),
  left("bone_shield_large", `${SKEL}/Skeleton_Shield_Large_A.gltf`),
  left("bone_shield_large_b", `${SKEL}/Skeleton_Shield_Large_B.gltf`),
  left("bone_shield_small", `${SKEL}/Skeleton_Shield_Small_A.gltf`),
  left("spellbook", `${ADV}/spellbook_closed.gltf`),
];

export interface LayerSheet {
  id: string;
  outfit: EntrySpec;
  plan: LayerPlan;
  /** Partes do próprio personagem são tingidas com as cores do jogador; equipamentos não. */
  tint: boolean;
}

/** Todas as folhas em camadas: as partes de cada roupa e cada equipamento em cada roupa. */
export function layerSheets(): LayerSheet[] {
  const sheets: LayerSheet[] = [];
  for (const outfit of OUTFITS) {
    const key = outfit.id.slice("outfit_".length);
    const parts = OUTFIT_PARTS[key];
    if (!parts) continue;
    for (const part of BODY_PARTS) {
      const nodes = part === "boots" ? parts.legs : parts[part];
      if (!nodes?.length) continue;
      const split = part === "legs" ? "legs" : part === "boots" ? "boots" : undefined;
      sheets.push({ id: `part_${key}_${part}`, outfit, tint: true, plan: { show: nodes, split, shadow: part === "head" } });
    }
    for (const look of GEAR_LOOKS) {
      const replaced = look.part === "boots" ? parts.legs : parts[look.part];
      sheets.push({
        id: `gear_${key}_${look.id}`,
        outfit,
        tint: false,
        plan: {
          show: [],
          borrow: look.borrow,
          hold: look.hold,
          shadow: false,
          hide: replaced,
          hideSplit: look.part === "legs" ? "legs" : look.part === "boots" ? "boots" : undefined,
        },
      });
    }
  }
  return sheets;
}

export const CATALOG: EntrySpec[] = [
  ...OUTFITS,
  ...MONSTER_SPRITES,
  ...PET_SPRITES,
  ...MOUNT_SPRITES,
  ...PROP_SPRITES,
  ...LOOT_SPRITES,
];
