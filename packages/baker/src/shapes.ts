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

const BUILTIN: Record<string, () => THREE.Group> = { crystal };
