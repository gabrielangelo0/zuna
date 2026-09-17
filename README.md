# Zuna

**Seu personagem, sua jornada!** Zuna é um MMORPG isométrico no navegador, no estilo Tibia: explore, evolua, conquiste e viva um mundo repleto de aventuras, sem downloads. Jogue em https://zuna.devfly.net.

Este repositório está na fase 0 (protótipo técnico) do [plano do jogo](docs/plano-do-jogo.md).

## Rodar

Requer Node.js 20.19 ou mais recente. Não é preciso instalar banco de dados.

```bash
npm install
npm run dev
```

Abra http://localhost:5173, crie uma conta e um personagem. Para ver o multiplayer, abra outra aba e entre com outro personagem.

- Cliente (Vite + Phaser): `http://localhost:5173`
- Servidor do jogo e API (Colyseus): `http://localhost:2567`
- Banco local: PGlite (Postgres embutido), gravado em `packages/server/.data/`. Para zerar tudo, pare o servidor e apague essa pasta.

## Controles

| Ação | Tecla |
|---|---|
| Andar | Clique no chão, `WASD` ou setas |
| Atacar | Clique no monstro · `Tab` ataca o mais próximo · `Esc` para |
| Magias | `1` Cura · `2` Golpe Giratório |
| Guarda-roupa e loja | `O` |
| Ranking | `R` |
| Mapa grande | `N` |
| Montar / desmontar | `M` |
| Chat | `Enter` |
| Zoom | Roda do mouse |

## Comandos de chat

- `/ajuda`, `/online`
- Só para testes: `/evento xp`, `/evento invasao`, `/xp 500`, `/ouro 2000`, `/diamantes 1000`

## Drops e ranking

- Cada monstro pode deixar cair **moedas** (comum), um **Baú de Ouro** (raro, vale de 3 a 6 vezes o ouro normal) e o **Cristal de Zuna** (lendário, vale diamantes e é anunciado para o servidor). As chances ficam em `packages/shared/src/monsters.ts` e o sorteio em `loot.ts`.
- O drop cai no chão, no tile da morte, e é coletado ao passar por cima. Nos primeiros 20 s só quem derrubou o monstro pega; depois libera para todos. O que ninguém pegar some em 90 s.
- O ranking tem três listas (nível, ouro e caçadas), servidas por `GET /api/ranking?board=level|gold|kills` com cache de 30 s. Aparecem na tecla `R` dentro do jogo e ao lado do menu de login.

## Contas, personagens e loja

- Conta com usuário e senha. A senha é guardada com scrypt; a sessão é um token de 30 dias, salvo no banco só como hash.
- Até 2 personagens por conta. Nível, XP, vida, mana, ouro, posição e visual são salvos ao sair, ao subir de nível e a cada 60 s.
- **Customização:** pele, cabelo e 3 cores por roupa, grátis. Roupas, mascotes e montarias extras são comprados com ouro ou diamantes e ficam na conta. O catálogo está em `packages/shared/src/cosmetics.ts`.
- Mascotes dão bônus de XP ou ouro; montarias aumentam a velocidade.
- Toda compra é uma transação: debita o saldo, desbloqueia o item e registra em `purchases`, ou não faz nada.
- A compra de diamantes com dinheiro real (Pix e cartão) ainda não existe: é a fase 2 do plano.

## Variáveis de ambiente do servidor

| Variável | Padrão | O que faz |
|---|---|---|
| `GAME_PORT` | `2567` | Porta do servidor do jogo e da API (em produção, vale também `PORT`) |
| `NODE_ENV` | — | `production` faz o servidor entregar o cliente compilado e desliga os comandos de teste |
| `DATABASE_URL` | — | Postgres de produção. Sem ela, usa o PGlite local |
| `PGLITE_DIR` | `packages/server/.data/pglite` | Pasta do banco local |
| `XP_RATE` | `1` | Multiplicador global de XP |
| `EVENT_INTERVAL_MIN` | `20` | Minutos entre eventos automáticos (`0` desliga) |
| `DEV_COMMANDS` | ligado fora de produção | `0` desliga e `1` liga os comandos de teste |

## Publicação

Produção roda na [Railway](https://railway.com) com um só serviço (o `Dockerfile` da raiz) e um Postgres:

- `https://zuna.devfly.net`: o jogo. O próprio servidor entrega o cliente compilado (`packages/client/dist`).
- `https://api.zuna.devfly.net`: API e WebSocket. O cliente é compilado com `VITE_SERVER_URL=https://api.zuna.devfly.net`; sem essa variável, ele fala com o mesmo endereço que entregou a página.
- O DNS do devfly.net fica na Cloudflare, com os dois subdomínios em CNAME para a Railway.
- `railway.json` define o healthcheck (`/__healthcheck`), uma réplica só (o mundo fica na memória do processo) e 30 s para salvar os jogadores antes de desligar.

Variáveis do serviço na Railway: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `VITE_SERVER_URL=https://api.zuna.devfly.net` e `PORT=8080`. O `NODE_ENV=production` já vem da imagem.

Para publicar uma versão nova a partir da sua máquina:

```bash
railway up
```

Para testar a imagem de produção localmente:

```bash
docker build --build-arg VITE_SERVER_URL=http://localhost:8091 -t zuna .
```

## Banco de dados

As migrações são aplicadas sozinhas quando o servidor inicia. Depois de mudar `packages/server/src/db/schema.ts`, gere a migração nova:

```bash
npm run db:generate -w @zuna/server
```

## Identidade visual

- Logo, frase e cores vêm do pôster do Zuna: azul-noite com verde esmeralda. O dourado aparece só no ouro. As cores são variáveis no topo de `packages/client/src/style.css`.
- Fontes empacotadas no cliente (Fontsource, sem Google Fonts): Lilita One no logo e nos títulos, Permanent Marker na frase e Montserrat no resto, inclusive nos nomes dentro do jogo.
- Ícones e prévia de link ficam em `packages/client/public/`: `favicon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `og-image.jpg` (1200×630, montada com o mapa e os sprites do jogo) e `site.webmanifest`.

## Arte (sprites)

Personagens, monstros, mascotes, montarias e cenário são **modelos 3D CC0** (KayKit e Quaternius, veja [assets/CREDITS.md](assets/CREDITS.md)) transformados em sprites isométricos pelo baker (`packages/baker`). Ele usa o three.js dentro do Chrome, com a mesma câmera (30°), luz, contorno e sombra para tudo.

- Cada personagem tem 5 direções desenhadas (as outras 3 são espelhadas) e as animações parado, andar, golpe, magia, dano, morte e montado.
- As roupas saem com um mapa de grupos de cor: o cliente tinge pele, cabelo e as 3 cores de cada jogador, como no Tibia.
- As montarias têm o ponto da sela em cada quadro e uma camada "frente" para a cabeça do animal ficar na frente do cavaleiro.
- Os sprites prontos ficam em `packages/client/public/sprites/` (versionados). O catálogo do que é gerado fica em `packages/baker/src/catalog.ts`.

Para gerar de novo (precisa do Google Chrome instalado):

```bash
npm run assets:download
npm run bake
```

Outros modos do baker:

```bash
npm run bake -- outfit_mago mount_cavalo
npm run bake -- --overview
npm run bake -- --survey quaternius/monsters
```

O primeiro gera só os itens citados. O `--overview` monta uma folha com todos os sprites e o cavaleiro em cada montaria, e o `--survey` mostra todos os modelos de uma pasta. As folhas de conferência ficam em `packages/baker/previews/` (fora do git). Para acompanhar a geração na tela, rode `npm run dev -w @zuna/baker` e abra http://localhost:5180/?auto=1.

## Estrutura

- `packages/shared`: regras usadas por cliente e servidor (mapa determinístico, pathfinding A\*, curva de XP, monstros, magias, catálogo de cosméticos, validações, protocolo)
- `packages/server`: sala do mundo no Colyseus (movimento, IA dos monstros, combate, XP, morte, eventos, compras), API de contas e personagens (`api.ts`), banco com Drizzle (`db/`, `repository.ts`)
- `packages/client`: Phaser 4 com interface em HTML (menu de conta e criação de personagem, HUD com orbes de vida e mana, minimapa, guarda-roupa, loja e ranking, renderização isométrica, efeitos). Sprites e tingimento em `sprites.ts`, personagens animados em `actors.ts`, drops no chão em `loot.ts`, minimapa em `minimap.ts`
- `packages/baker`: gera os sprites a partir dos modelos 3D
- `tools/download-assets.mjs`: baixa os modelos 3D originais para `assets/source/` (fora do git)

O chão (grama, terra, água, pedra) ainda é desenhado em canvas pelo cliente (`packages/client/src/textures.ts`).

## Checagem de tipos

```bash
npm run typecheck
```
