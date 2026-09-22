import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";

// Peças modeladas aqui, quando nenhum pacote CC0 tem o que o jogo precisa.
// Entram no baker como "builtin:<nome>" no lugar do arquivo.

export function builtinModel(name: string): GLTF {
  const build = BUILTIN[name];
  if (!build) throw new Error(`modelo interno desconhecido: ${name}`);
  return { scene: build(), animations: [] } as unknown as GLTF;
}

/** O Cristal de Zuna: a gema do logo saindo de umas pedras. */
function crystal(): THREE.Group {
  const group = new THREE.Group();
  const gem = new THREE.MeshStandardMaterial({
    name: "crystal_gem",
    color: 0x2fdc84,
    roughness: 0.35,
    metalness: 0,
    flatShading: true,
    emissive: 0x0d6b3c,
    emissiveIntensity: 0.6,
  });
  const stone = new THREE.MeshStandardMaterial({ name: "crystal_stone", color: 0x33405c, roughness: 1, metalness: 0, flatShading: true });

  const shard = (radius: number, stretch: number) => {
    const geometry = new THREE.OctahedronGeometry(radius, 0);
    geometry.scale(1, stretch, 1);
    return new THREE.Mesh(geometry, gem);
  };

  const main = shard(0.15, 2.3);
  main.position.y = 0.3;
  main.rotation.y = Math.PI / 5;
  group.add(main);

  const left = shard(0.08, 1.9);
  left.position.set(-0.15, 0.13, 0.05);
  left.rotation.set(0, 0.4, 0.28);
  group.add(left);

  const right = shard(0.065, 1.7);
  right.position.set(0.14, 0.1, -0.04);
  right.rotation.set(0.1, -0.5, -0.32);
  group.add(right);

  for (const [x, z, size] of [
    [-0.06, 0.1, 0.14],
    [0.12, 0.06, 0.11],
    [0.01, -0.11, 0.12],
  ]) {
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), stone);
    rock.position.set(x, size * 0.32, z);
    rock.scale.y = 0.55;
    rock.rotation.y = x * 7;
    group.add(rock);
  }
  return group;
}

/** Material de metal estilizado (fosco, como o resto da arte). */
function metal(name: string, color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ name, color, roughness: 0.55, metalness: 0, flatShading: true });
}

function gemMaterial(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    name: "gem",
    color,
    roughness: 0.3,
    metalness: 0,
    flatShading: true,
    emissive: color,
    emissiveIntensity: 0.25,
  });
}

/** Amuleto: corrente de elos, moldura e uma gema no meio. */
function amulet(): THREE.Group {
  const group = new THREE.Group();
  const gold = metal("amulet_metal", 0xc98b3c);
  // Corrente em arco: elos pequenos ao longo de um meio círculo.
  for (let i = 0; i <= 14; i++) {
    const angle = Math.PI * (0.08 + (0.84 * i) / 14);
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 5, 8), gold);
    link.position.set(Math.cos(angle) * 0.28, 0.24 + Math.sin(angle) * 0.2, 0);
    link.rotation.set(i % 2 ? Math.PI / 2 : 0, 0, angle);
    group.add(link);
  }
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 6, 16), gold);
  frame.position.set(0, 0.06, 0);
  group.add(frame);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), gold);
  back.rotation.x = Math.PI / 2;
  back.position.set(0, 0.06, -0.012);
  group.add(back);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), gemMaterial(0x39c46e));
  gem.scale.set(1, 1.25, 0.6);
  gem.position.set(0, 0.06, 0.03);
  group.add(gem);
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 5, 8), gold);
  bail.position.set(0, 0.2, 0);
  group.add(bail);
  return group;
}

/** Anel: aro grosso com uma gema lapidada em cima. */
function ring(): THREE.Group {
  const group = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 8, 20), metal("ring_metal", 0xb7bcc6));
  band.rotation.x = Math.PI / 2.6;
  group.add(band);
  const setting = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.05, 8), metal("ring_metal", 0xb7bcc6));
  setting.position.set(0, 0.17, 0.06);
  setting.rotation.x = -0.6;
  group.add(setting);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), gemMaterial(0x2f7fe0));
  gem.scale.set(1, 0.8, 1);
  gem.position.set(0, 0.22, 0.09);
  gem.rotation.x = -0.6;
  group.add(gem);
  return group;
}

/** Poção: frasco de vidro com o líquido colorido dentro, gargalo e rolha. */
function potion(liquidColor: number, size: number): () => THREE.Group {
  return () => {
    const group = new THREE.Group();
    const glass = new THREE.MeshStandardMaterial({
      name: "potion_glass",
      color: 0xdff4ff,
      roughness: 0.2,
      metalness: 0,
      transparent: true,
      opacity: 0.45,
      flatShading: true,
    });
    const liquid = new THREE.MeshStandardMaterial({
      name: "potion_liquid",
      color: liquidColor,
      roughness: 0.35,
      metalness: 0,
      flatShading: true,
      emissive: liquidColor,
      emissiveIntensity: 0.25,
    });
    const radius = 0.16 * size;
    const bottle = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), glass);
    bottle.position.y = radius;
    group.add(bottle);
    const fill = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.86, 10, 8, 0, Math.PI * 2, Math.PI * 0.28, Math.PI * 0.72), liquid);
    fill.position.y = radius;
    group.add(fill);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.32, radius * 0.4, radius * 0.9, 8), glass);
    neck.position.y = radius * 2.25;
    group.add(neck);
    const cork = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.36, radius * 0.3, radius * 0.45, 8),
      new THREE.MeshStandardMaterial({ name: "potion_cork", color: 0x9a6a3c, roughness: 1, metalness: 0, flatShading: true }),
    );
    cork.position.y = radius * 2.85;
    group.add(cork);
    return group;
  };
}

/** Mochila de aventureiro: corpo de couro, aba com fivela, bolso, alças e um saco de dormir enrolado em cima. */
function backpack(): THREE.Group {
  const group = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ name: "pack_leather", color: 0x8a5a34, roughness: 0.9, metalness: 0, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ name: "pack_strap", color: 0x5a3820, roughness: 0.9, metalness: 0, flatShading: true });
  const buckle = metal("pack_buckle", 0xd9b44a);
  const roll = new THREE.MeshStandardMaterial({ name: "pack_roll", color: 0x4f7a5a, roughness: 1, metalness: 0, flatShading: true });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.26, 2, 2, 2), leather);
  body.position.y = 0.25;
  group.add(body);
  // Aba arredondada caindo pela frente.
  const flap = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.44, 10, 1, false, 0, Math.PI), leather);
  flap.rotation.z = Math.PI / 2;
  flap.scale.set(1, 1, 0.7);
  flap.position.set(0, 0.5, 0.0);
  group.add(flap);
  const flapFront = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.2, 0.03), dark);
  flapFront.position.set(0, 0.42, 0.14);
  group.add(flapFront);
  const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.03), buckle);
  clasp.position.set(0, 0.33, 0.155);
  group.add(clasp);
  // Bolso da frente.
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.08), leather);
  pocket.position.set(0, 0.14, 0.16);
  group.add(pocket);
  const pocketFlap = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.05, 0.09), dark);
  pocketFlap.position.set(0, 0.22, 0.165);
  group.add(pocketFlap);
  // Alças laterais.
  for (const side of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.46, 0.28), dark);
    strap.position.set(side * 0.2, 0.26, 0);
    group.add(strap);
  }
  // Saco de dormir enrolado em cima.
  const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 10), roll);
  bedroll.rotation.z = Math.PI / 2;
  bedroll.position.set(0, 0.66, -0.02);
  group.add(bedroll);
  for (const side of [-1, 1]) {
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.015, 5, 10), dark);
    tie.rotation.y = Math.PI / 2;
    tie.position.set(side * 0.13, 0.66, -0.02);
    group.add(tie);
  }
  return group;
}

const BUILTIN: Record<string, () => THREE.Group> = {
  crystal,
  backpack,
  amulet,
  ring,
  potion_red: potion(0xe0314a, 0.85),
  potion_red_big: potion(0xe0314a, 1),
  potion_red_huge: potion(0xff4d8a, 1.15),
  potion_blue: potion(0x2f7fe0, 0.85),
  potion_blue_big: potion(0x2f7fe0, 1),
  potion_blue_huge: potion(0x7a5cff, 1.15),
};
