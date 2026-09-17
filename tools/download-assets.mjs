// Baixa os modelos 3D (todos CC0) usados para gerar os sprites do jogo.
// Idempotente: arquivos que já existem são pulados. Uso: npm run assets:download

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../assets/source/", import.meta.url));
const PARALLEL = 8;

/** Pacotes da KayKit no GitHub. Só a parte glTF (os FBX não são usados). */
const KAYKIT = [
  {
    repo: "KayKit-Character-Pack-Adventures-1.0",
    dir: "kaykit/adventurers",
    folders: {
      "addons/kaykit_character_pack_adventures/Characters/gltf/": "Characters",
      "addons/kaykit_character_pack_adventures/Assets/gltf/": "Assets",
    },
  },
  {
    repo: "KayKit-Character-Pack-Skeletons-1.0",
    dir: "kaykit/skeletons",
    folders: {
      "addons/kaykit_character_pack_skeletons/Characters/gltf/": "Characters",
      "addons/kaykit_character_pack_skeletons/Assets/gltf/": "Assets",
    },
  },
  {
    repo: "KayKit-Medieval-Hexagon-Pack-1.0",
    dir: "kaykit/medieval-hexagon",
    folders: { "addons/kaykit_medieval_hexagon_pack/Assets/gltf/": "" },
  },
  {
    repo: "KayKit-Dungeon-Remastered-1.0",
    dir: "kaykit/dungeon",
    folders: {
      "addons/kaykit_dungeon_remastered/Assets/gltf/": "",
      "addons/kaykit_dungeon_remastered/Assets/texture/": "texture",
    },
    // O pacote inteiro tem 43 MB; daqui só saem os drops (moedas e baús).
    only: /^(coin|chest|dungeon_texture)/,
  },
];

/** Modelos da Quaternius no Poly Pizza: [pacote, nome, uuid do arquivo em static.poly.pizza]. */
const POLY_PIZZA = [
  ["monsters", "Mushnub", "55c64684-49a4-4fcc-b393-113126add89b"],
  ["monsters", "Pink Slime", "3ddbff73-430c-4ca0-bb25-11211683fbb9"],
  ["monsters", "Green Blob", "64ab590e-1f77-4678-b357-78c430fd73bf"],
  ["monsters", "Orc Enemy", "3076c5f7-9bdf-4c27-8083-f280ee6cd64b"],
  ["monsters", "Ninja", "42162a27-0aaa-40be-b50e-919776021a11"],
  ["monsters", "Cat", "7ccb71fe-dabb-4a6f-a98a-8992bb5e6bc7"],
  ["monsters", "Pigeon", "2ad33f9e-e0d5-4a11-821b-7aafe8d13dd3"],
  ["monsters", "Chicken", "a0001762-9352-48c3-9abd-be91e42db114"],
  ["monsters", "Cactoro", "625862f9-590e-4fbd-88bc-9056047885dd"],
  ["monsters", "Alien", "0bb74be9-e9d1-4321-aedb-a9eccecb04a1"],
  ["monsters", "Mushnub Evolved", "84bc88a5-22d8-44e6-af9b-58f8465eb238"],
  ["monsters", "Yeti", "085b078d-b72a-4d8e-a030-000d36c58447"],
  ["monsters", "Wizard", "d206c071-7934-40eb-9091-35ebdf93c317"],
  ["monsters", "Fish", "f7d91eb6-da8e-405d-a647-18ff54b97752"],
  ["monsters", "Birb", "05dac745-bdd0-4169-9e64-f497ca21f69a"],
  ["monsters", "Green Spiky Blob", "cd25a048-719e-4ec4-bbf5-a266776fe129"],
  ["monsters", "Glub", "f64d32a9-c1da-4978-8f83-158130703e6c"],
  ["monsters", "Armabee", "de63aaf6-9170-47f7-933d-439af68826a6"],
  ["monsters", "Alpaking", "acb0f155-4a8a-4084-a2a8-9c17cbff7d21"],
  ["monsters", "Armabee Evolved", "fb7d7a9e-5584-4e0b-a1bf-251fc9946696"],
  ["monsters", "Goleling Evolved", "d6308fbf-fa2e-4cfe-b235-def7ede1ab90"],
  ["monsters", "Dragon", "ae5b8510-1fa5-4d53-b943-a4f3b88fb629"],
  ["monsters", "Goleling", "51bf31d7-1aee-4a51-acb1-d667843af205"],
  ["monsters", "Glub Evolved", "27590c4e-41ee-41b5-aaaa-581de0031605"],
  ["monsters", "Alpaking Evolved", "c50fd18d-9441-491b-b2c0-835e6a8757e3"],
  ["monsters", "Ghost", "810f60a2-6e45-4c4e-a0d5-da91cd7288bd"],
  ["monsters", "Ghost Skull", "0716bf8e-1894-4a90-8d10-34868975a239"],
  ["monsters", "Hywirl", "6500a805-0588-4823-bb8d-2f8ffdf338ab"],
  ["monsters", "Tribal", "1b4759ca-2c00-4718-90f6-2f84bc8e44f9"],
  ["monsters", "Demon", "c2e39eb4-4b8e-4d31-b014-d637bf4e15c6"],
  ["monsters", "Squidle", "cbe8419d-59d4-4ee8-92f1-8bccb25af378"],
  ["monsters", "Dragon Evolved", "90ed3740-d8c4-4910-88ce-ac2ed426022d"],
  ["monsters", "Frog", "9018566d-c4e9-4f20-9c99-964622a6e674"],
  ["monsters", "Cactoro", "e88090e2-46af-430b-91e5-ad5520de4939"],
  ["monsters", "Ninja", "2ed11876-720e-457a-8a69-4a14ba7234dc"],
  ["monsters", "Monkroose", "54ca5c4d-aa20-40ff-a510-25c1c6a48ee9"],
  ["monsters", "Dino", "1c1ae302-b948-4de4-961a-44f762b722cf"],
  ["monsters", "Mushroom King", "798301fb-b950-460c-9c67-526621ad8500"],
  ["monsters", "Alien", "b048d82a-7fc2-4631-b859-4bde0ed19b59"],
  ["monsters", "Blue Demon", "6fbb8914-bd11-45e1-a906-51ace2ca5d2d"],
  ["monsters", "Fish", "6c98561f-4fb5-404c-91e9-a54024e1f6c5"],
  ["monsters", "Yeti", "40a831b3-686a-4af8-b189-a13b38a3c26a"],
  ["monsters", "Demon", "46b52ba4-5d2a-4fc8-85cc-3e980f199141"],
  ["monsters", "Orc", "52a479b3-a635-4a23-92cb-6697eaa5eed5"],
  ["monsters", "Bunny", "084b5ebe-c3eb-4e64-9b17-06e2d1e3da5d"],
  ["animals", "Cow", "382b3d4a-a7c9-4c03-9858-3df630d90047"],
  ["animals", "Donkey", "ca29f94e-0874-41b6-8334-66642af56a61"],
  ["animals", "Deer", "4b6c2a41-43c7-404c-ae37-e8c4645ff93b"],
  ["animals", "Alpaca", "444228bb-745d-49b2-89ef-cc12805deaa8"],
  ["animals", "Bull", "5704ef69-2c27-4de8-a942-70a29458af21"],
  ["animals", "Fox", "e18e86df-1692-48d8-ac6e-1e25ab4ad574"],
  ["animals", "Shiba Inu", "ba6d0ee3-bcc0-4ef0-9d3c-a3e245b41c77"],
  ["animals", "Stag", "a9c69fbc-bf7c-4585-9a49-a82e0be1ac6b"],
  ["animals", "Husky", "611d25c7-430f-4bb5-ab2c-d8f5f3cb9712"],
  ["animals", "Wolf", "f1d12388-e39b-4157-b32a-646a1d089fc4"],
  ["animals", "White Horse", "3edc2bd9-3378-4b43-a50d-d5e1f858562b"],
  ["animals", "Horse", "d37dbc87-ca61-4b2c-a2da-d2f0c4240bef"],
];

const NATURE_MEGAKIT = {
  url: "https://opengameart.org/sites/default/files/stylized_nature_megakitstandard.zip",
  dir: "quaternius/nature-megakit",
};

async function fetchOk(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} em ${url}`);
  return response;
}

async function saveUrl(url, file) {
  if (existsSync(file)) return "pulado";
  let bytes = Buffer.from(await (await fetchOk(url)).arrayBuffer());
  // Arquivos grandes podem estar no Git LFS: o link "raw" devolve só o ponteiro.
  if (bytes.length < 512 && bytes.toString("utf8").startsWith("version https://git-lfs")) {
    const lfsUrl = url.replace("raw.githubusercontent.com/", "media.githubusercontent.com/media/");
    bytes = Buffer.from(await (await fetchOk(lfsUrl)).arrayBuffer());
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return "baixado";
}

async function runPool(tasks) {
  const results = { baixado: 0, pulado: 0, erro: 0 };
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const task = tasks[next++];
      try {
        results[await task()]++;
      } catch (error) {
        results.erro++;
        console.error(`  erro: ${error.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return results;
}

async function kaykitTasks() {
  const tasks = [];
  for (const pack of KAYKIT) {
    const api = `https://api.github.com/repos/KayKit-Game-Assets/${pack.repo}/git/trees/main?recursive=1`;
    const { tree } = await (await fetchOk(api)).json();
    for (const entry of tree) {
      if (entry.type !== "blob") continue;
      const raw = `https://raw.githubusercontent.com/KayKit-Game-Assets/${pack.repo}/main/${encodeURI(entry.path)}`;
      if (/^license/i.test(entry.path)) {
        tasks.push(() => saveUrl(raw, join(ROOT, pack.dir, entry.path)));
        continue;
      }
      for (const [prefix, target] of Object.entries(pack.folders)) {
        if (!entry.path.startsWith(prefix)) continue;
        const name = entry.path.slice(prefix.length);
        if (pack.only && !pack.only.test(name)) continue;
        tasks.push(() => saveUrl(raw, join(ROOT, pack.dir, target, name)));
      }
    }
  }
  return tasks;
}

function polyPizzaTasks() {
  const seen = new Map();
  return POLY_PIZZA.map(([pack, name, uuid]) => {
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    const fileName = `${name.replace(/\s+/g, "_")}${count > 1 ? "_B" : ""}.glb`;
    return () => saveUrl(`https://static.poly.pizza/${uuid}.glb`, join(ROOT, "quaternius", pack, fileName));
  });
}

async function downloadNatureMegakit() {
  const dir = join(ROOT, NATURE_MEGAKIT.dir);
  const marker = join(dir, ".extraido");
  if (existsSync(marker)) return "pulado";
  const zip = join(ROOT, "quaternius", "nature-megakit.zip");
  await saveUrl(NATURE_MEGAKIT.url, zip);
  await mkdir(dir, { recursive: true });
  execFileSync("unzip", ["-q", "-o", zip, "-d", dir]);
  await writeFile(marker, new Date().toISOString());
  await rm(zip);
  return "baixado";
}

async function main() {
  console.log(`Destino: ${ROOT}`);

  console.log("KayKit (GitHub)...");
  console.log("  ", await runPool(await kaykitTasks()));

  console.log("Quaternius (Poly Pizza)...");
  console.log("  ", await runPool(polyPizzaTasks()));

  console.log("Quaternius Stylized Nature MegaKit (OpenGameArt, 104 MB)...");
  console.log("  ", await downloadNatureMegakit());

  const credits = await readFile(new URL("../assets/CREDITS.md", import.meta.url), "utf8").catch(() => "");
  if (!credits) console.warn("Aviso: assets/CREDITS.md não encontrado.");
  console.log("Pronto.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
