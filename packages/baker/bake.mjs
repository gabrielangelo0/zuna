// Gera os sprites sem abrir janela: sobe o servidor do baker e roda a página no Chrome headless.
// Uso: npm run bake -w @zuna/baker [-- id1 id2 ...]
//      npm run bake -w @zuna/baker -- --survey [pasta1 pasta2]   (mostruário de modelos em previews/)
//      npm run bake -w @zuna/baker -- --overview                 (visão geral dos sprites prontos, com montarias)
//      npm run bake -w @zuna/baker -- --icons [id1 id2 ...]      (ícones dos itens: sprites/items.webp)
//      npm run bake -w @zuna/baker -- --layers [prefixo ...]     (personagem em camadas: part_* e gear_*)
//      npm run bake -w @zuna/baker -- --layer-overview [look+look ...]  (conferência: previews/layers.png)
// Para acompanhar visualmente: npm run dev -w @zuna/baker e abra http://localhost:5180/?auto=1

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TIMEOUT_MS = 30 * 60_000;

if (!existsSync(CHROME)) {
  console.error(`Chrome não encontrado em ${CHROME}. Defina CHROME_PATH ou abra http://localhost:5180 com "npm run dev".`);
  process.exit(1);
}
if (!existsSync(join(here, "../../assets/source"))) {
  console.error('Modelos não encontrados. Rode antes: npm run assets:download');
  process.exit(1);
}

const args = process.argv.slice(2);
const MODES = { "--survey": "survey", "--overview": "overview", "--icons": "icons", "--layers": "layers", "--layer-overview": "layer-overview" };
const mode = Object.entries(MODES).find(([flag]) => args.includes(flag))?.[1] ?? "";
const only = args.filter((arg) => !arg.startsWith("--")).join(",");
const server = await createServer({ configFile: join(here, "vite.config.ts") });
await server.listen();

const profile = await mkdtemp(join(tmpdir(), "baker-chrome-"));
const query = new URLSearchParams({ auto: "1" });
if (mode) query.set("mode", mode);
if (only) query.set("only", only);
const url = `http://localhost:5180/?${query}`;
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--ignore-gpu-blocklist",
    "--use-angle=metal",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    url,
  ],
  { stdio: "ignore" },
);

const result = await new Promise((resolve) => {
  process.once("bake:done", resolve);
  chrome.once("exit", (code) => resolve(`erro: o Chrome fechou antes de terminar (código ${code})`));
  setTimeout(() => resolve("erro: tempo esgotado"), TIMEOUT_MS).unref();
});

// Espera o Chrome fechar de verdade antes de apagar o perfil temporário (ele ainda grava ao sair).
if (chrome.exitCode === null) {
  const exited = new Promise((resolve) => chrome.once("exit", resolve));
  chrome.kill();
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
}
await server.close();
await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch((error) => {
  console.warn(`Aviso: não foi possível apagar ${profile}: ${error.message}`);
});
console.log(result);
process.exit(String(result).startsWith("ok") ? 0 : 1);
