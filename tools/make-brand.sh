#!/usr/bin/env bash
# Gera os arquivos da marca a partir da arte original em assets/brand/.
#
#   ./tools/make-brand.sh      (ou: npm run brand)
#
# Precisa do ImageMagick 7 (brew install imagemagick). Roda só quando a arte muda;
# o resultado fica versionado em packages/client/public/.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
art="$root/assets/brand/zuna-logo.png"
ogbg="$root/assets/brand/og-background.jpg"
out="$root/packages/client/public"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

command -v magick >/dev/null || { echo "Falta o ImageMagick 7 (brew install imagemagick)."; exit 1; }

# 1. Recorta o fundo preto da arte.
#
# A logo foi desenhada sobre preto e tem brilho ao redor: um recorte "duro" comeria o brilho.
# Por isso o canal alfa vira o brilho de cada pixel (o maior entre R, G e B) e as cores
# continuam como estão — o mesmo que a arte original sobre um fundo escuro, só que agora
# ela se apoia no fundo da página em vez de carregar um retângulo preto.
magick "$art" -channel RGB -separate +channel -evaluate-sequence max -depth 8 "$work/mask.png"
magick "$art" "$work/mask.png" -alpha off -compose CopyOpacity -composite \
  -channel A -level 2%,100% +channel \
  -fuzz 0.5% -trim +repage "$work/logo.png"

# 2. Logo do menu e do painel: 1024px de largura, com paleta reduzida (99 KB em vez de 634 KB).
magick "$work/logo.png" -resize 1024x -strip -colors 200 -define png:compression-level=9 \
  "$out/brand/zuna-logo.png"

# 3. Ícones: a gema do alto da logo sobre o azul-noite do jogo.
# O recorte e o losango valem para a arte atual, que fica com 1366x825 depois do passo 1.
magick "$work/logo.png" -crop 300x300+527+0 +repage "$work/gem-raw.png"
magick -size 300x300 xc:black -fill white -draw "polygon 150,0 288,146 150,294 12,146" -blur 0x2 "$work/gem-mask.png"
magick "$work/gem-raw.png" "$work/gem-mask.png" -alpha off -compose CopyOpacity -composite "$work/gem.png"

magick -size 512x512 radial-gradient:"#1d2c66"-"#070a1f" \
  \( "$work/gem.png" -resize 400x400 -alpha extract -blur 0x26 \
     -background "#2ee07d" -alpha shape -channel A -evaluate multiply 0.45 +channel \) \
  -gravity center -compose over -composite \
  \( "$work/gem.png" -resize 400x400 \) -gravity center -compose over -composite \
  -strip "$work/icon.png"

for size in 512 192 180 96; do
  case $size in
    512) file="$out/icon-512.png" ;;
    192) file="$out/icon-192.png" ;;
    180) file="$out/apple-touch-icon.png" ;;
    96) file="$out/favicon.png" ;;
  esac
  magick "$work/icon.png" -resize ${size}x${size} -colors 255 -define png:compression-level=9 "$file"
done

# 4. Imagem de compartilhamento: a logo sobre o fundo já pronto (cena do jogo + textos).
magick "$ogbg" \( "$work/logo.png" -resize 390x \) -geometry +52+14 -compose over -composite \
  -quality 84 -strip "$out/og-image.jpg"

printf 'pronto:\n'
ls -lh "$out/brand/zuna-logo.png" "$out/icon-512.png" "$out/icon-192.png" \
  "$out/apple-touch-icon.png" "$out/favicon.png" "$out/og-image.jpg" | awk '{print "  " $9 "  " $5}'
