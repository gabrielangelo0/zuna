import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
/** Sprites prontos, usados pelo jogo. */
const OUTPUT_DIR = resolve(here, "../client/public/sprites");
/** Folhas de conferência (fora do git). */
const PREVIEW_DIR = resolve(here, "previews");
/** Modelos 3D originais, servidos na raiz (ex.: /kaykit/adventurers/Characters/Knight.glb). */
const SOURCE_DIR = resolve(here, "../../assets/source");

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolveBody(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

/** Só aceita caminhos dentro da pasta de destino. */
function safePath(root: string, relative: string | null): string | null {
  if (!relative) return null;
  const file = resolve(root, relative);
  return file.startsWith(root + sep) ? file : null;
}

/** Rotas que a página do baker usa para gravar arquivos e avisar o `npm run bake`. */
function bakeServer(): Plugin {
  return {
    name: "bake-server",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith("/__bake/")) return next();
        const url = new URL(request.url, "http://localhost");
        const body = await readBody(request);

        if (url.pathname === "/__bake/save" || url.pathname === "/__bake/preview") {
          const root = url.pathname === "/__bake/save" ? OUTPUT_DIR : PREVIEW_DIR;
          const file = safePath(root, url.searchParams.get("file"));
          if (!file) {
            response.statusCode = 400;
            response.end("caminho inválido");
            return;
          }
          await mkdir(dirname(file), { recursive: true });
          await writeFile(file, body);
          response.end("ok");
          return;
        }
        if (url.pathname.startsWith("/__bake/sprite/")) {
          const file = safePath(OUTPUT_DIR, decodeURIComponent(url.pathname.slice("/__bake/sprite/".length)));
          if (!file) {
            response.statusCode = 400;
            response.end("caminho inválido");
            return;
          }
          try {
            response.end(await readFile(file));
          } catch {
            response.statusCode = 404;
            response.end("não encontrado");
          }
          return;
        }
        if (url.pathname === "/__bake/list") {
          const dir = safePath(SOURCE_DIR, url.searchParams.get("dir"));
          const files = dir ? (await readdir(dir)).filter((name) => /\.(glb|gltf)$/i.test(name)).sort() : [];
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify(files));
          return;
        }
        if (url.pathname === "/__bake/log") {
          console.log(`[baker] ${body.toString()}`);
          response.end("ok");
          return;
        }
        if (url.pathname === "/__bake/done") {
          process.emit("bake:done" as never, body.toString() as never);
          response.end("ok");
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root: here,
  publicDir: SOURCE_DIR,
  server: { port: 5180, strictPort: true },
  plugins: [bakeServer()],
});
