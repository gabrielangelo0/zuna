// Corrige um bug do @colyseus/better-call (1.3.x) que trava respostas HTTP grandes:
// quando a resposta passa de 16 KB, ele espera o "drain" e depois termina o laço sem chamar res.end(),
// e o navegador fica esperando o fim da resposta para sempre. Aqui o res.end() sai de dentro do laço.
// Roda sozinho depois de todo `npm install`/`npm ci` (postinstall). Pode rodar de novo sem problema.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const folder = join(root, "node_modules/@colyseus/better-call/dist/adapters/node");
const BROKEN = "\t\t\t\tres.end();\n\t\t\t}\n\t\t} catch";
const FIXED = "\t\t\t}\n\t\t\tres.end();\n\t\t} catch";

for (const file of ["request.mjs", "request.cjs"]) {
  const path = join(folder, file);
  if (!existsSync(path)) continue;
  const source = readFileSync(path, "utf8");
  if (source.includes(FIXED)) continue;
  if (!source.includes(BROKEN)) {
    console.warn(`fix-better-call: trecho não encontrado em ${file} (a biblioteca mudou?): nada alterado.`);
    continue;
  }
  writeFileSync(path, source.replace(BROKEN, FIXED));
  console.log(`fix-better-call: ${file} corrigido.`);
}
