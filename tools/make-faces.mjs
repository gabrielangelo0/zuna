// Retratos das classes para o painel: o quadro parado de cada roupa, em tom de jade.
// Chamado por tools/make-brand.sh; precisa do ImageMagick.

import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sprites = fileURLToPath(new URL("../packages/client/public/sprites/", import.meta.url));
const faces = fileURLToPath(new URL("../packages/client/public/brand/class/", import.meta.url));
mkdirSync(faces, { recursive: true });

const sheets = readdirSync(sprites).filter((name) => name.startsWith("outfit_") && name.endsWith(".json"));
for (const sheet of sheets) {
  const data = JSON.parse(readFileSync(sprites + sheet, "utf8"));
  const frame = data.frames["idle/S/0"];
  const name = data.id.replace("outfit_", "");
  execFileSync("magick", [
    sprites + data.image,
    "-crop", `${frame.w}x${frame.h}+${frame.x}+${frame.y}`, "+repage",
    "-colorspace", "gray", "-normalize", "-fill", "#7fe0a8", "-tint", "72",
    "-resize", "56x56", "-background", "none", "-gravity", "north", "-extent", "56x56",
    "-strip", `${faces}${name}.png`,
  ]);
}
console.log(`  ${sheets.length} retratos de classe`);
