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
| Poderes | `1` a `6` (atalhos) · `P` abre o grimório |
| Guarda-roupa e loja | `O` |
| Ranking | `R` |
| Mapa grande | `N` |
| Montar / desmontar | `M` |
| Chat | `Enter` |
| Zoom | Roda do mouse |

## Comandos de chat

- `/ajuda`, `/online`
- Só para testes: `/evento xp`, `/evento invasao`, `/xp 500`, `/ouro 2000`, `/diamantes 1000`

## Poderes

- São seis famílias, liberadas por nível: Cura (1), Golpe Giratório (4), Raio Flamejante (8), Tremor (14), Drenar Vida (20) e Tempestade (30).
- Cada família ganha um **grau novo** de tantos em tantos níveis (Cura a cada 6, Raio a cada 8, Tempestade a cada 12, e assim por diante). O grau sobe a força em 18% e a mana em 15%, sem teto: no nível 100 já existe um Raio Flamejante XII.
- O jogador tem **6 atalhos** (teclas `1` a `6`) e escolhe quais poderes ficam neles no grimório (`P`): clica no poder e depois no atalho. Dá para trocar a qualquer momento, e os atalhos ficam salvos no personagem.
- Quando abre um grau melhor, o atalho sobe sozinho (Raio II vira Raio III), e poder novo entra numa vaga livre.
- As famílias e os números de cada uma estão em `packages/shared/src/spells.ts`.
- Cada poder tem efeito visual próprio, em camadas (`packages/client/src/effects.ts`): a Cura abre um círculo mágico verde com coluna de luz; o Golpe Giratório gira duas lâminas em volta do herói; o Raio Flamejante é uma bola de fogo com rastro que explode no alvo e deixa o chão queimado; o Tremor racha o chão com brilho de lava, levanta pedras e poeira; o Drenar Vida puxa almas roxas em curva do alvo até o herói; e a Tempestade escurece o céu e derruba raios em zigue-zague por toda a área.

## Drops e ranking

- Cada monstro pode deixar cair **moedas** (comum), um **Baú de Ouro** (raro, vale de 3 a 6 vezes o ouro normal) e o **Cristal de Zuna** (lendário, vale diamantes e é anunciado para o servidor). As chances ficam em `packages/shared/src/monsters.ts` e o sorteio em `loot.ts`.
- O drop cai no chão, no tile da morte, e é coletado ao passar por cima. Nos primeiros 20 s só quem derrubou o monstro pega; depois libera para todos. O que ninguém pegar some em 90 s.
- O ranking tem três listas (nível, ouro e caçadas), servidas por `GET /api/ranking?board=level|gold|kills` com cache de 30 s. Aparecem na tecla `R` dentro do jogo e ao lado do menu de login.

## Mundos e portais

- O jogo tem vários mundos ao mesmo tempo. Todos rodam na mesma sala do Colyseus: quem está em outro mundo não aparece na sua tela, mas o chat e os anúncios chegam a todo mundo.
- Cada mundo tem seu terreno (gerado por uma semente), sua praça protegida, seus ninhos de monstro e seus tesouros no chão.
- **Portais** ligam um ponto a outro, no mesmo mundo ou entre mundos. Basta pisar em cima; um portal pode pedir nível mínimo.
- O personagem volta para o mundo onde estava ao sair, e renasce na praça do mundo em que morreu.
- Tudo isso é criado e editado no painel, sem tocar em código. Veja [Mapas, portais e eventos](#mapas-portais-e-eventos).

A praça de Zuna tem seis portais, cada um para um mundo temático maior que a cidade (120 a 144 tiles de lado), com quatro estradas sinuosas saindo da praça, monstros mais fortes quanto mais longe e um **chefe** no fundo do mapa (nome dourado com ★; quando cai, o servidor inteiro fica sabendo):

| Mundo | Nível do portal | Monstros | Chefe |
|---|---|---|---|
| Floresta Sombria | 8 | Raposa Sombria, Lobo, Cogumelo Venenoso, Morcego do Musgo | Rei Cogumelo |
| Pântano Nebuloso | 12 | Gosma Espinhenta, Cogumelo, Sapo Gigante, Glub do Brejo | Sapo Rei |
| Deserto Escaldante | 25 | Cactinho, Vespa Gigante, Raptor, Cacto Guerreiro | Raptor Alfa |
| Montanhas Geladas | 35 | Yeti Filhote, Espírito do Gelo, Bisão das Neves, Yeti | Yeti Ancião |
| Cripta Esquecida | 45 | Esqueleto, Caveira Assombrada, Esqueleto Mago | Lorde Necromante |
| Vulcão Rubro | 60 | Diabrete, Demônio, Demônio Azul | Dragão Ancião |

- Cada terreno tem chão e cenário próprios: mata escura com árvores retorcidas e samambaias; lama, poças e vitórias-régias; dunas, oásis e ruínas; neve, pinheiros nevados, lagos e cristais; salões escuros com paredes de rocha; cinza vulcânica com rios de lava animada.
- Cada mundo tem quatro baús escondidos longe da praça, que voltam a cada 10 minutos.
- Os mundos, os portais, os baús e dois eventos (Caçada Dourada e Noite dos Mortos) são criados sozinhos no primeiro arranque (`packages/server/src/content.ts`) e marcados em `server_meta`: depois disso são dados comuns, e o que for apagado no painel não volta.
- Os monstros de cada mundo só são baixados quando o jogador chega lá.

## Contas, personagens e loja

- Conta com usuário e senha. A senha é guardada com scrypt; a sessão é um token de 30 dias, salvo no banco só como hash.
- Até 2 personagens por conta. Nível, XP, vida, mana, ouro, posição e visual são salvos ao sair, ao subir de nível e a cada 60 s.
- **Customização:** pele, cabelo e 3 cores por roupa, grátis. Roupas, mascotes e montarias extras são comprados com ouro ou diamantes e ficam na conta. O catálogo está em `packages/shared/src/cosmetics.ts`.
- Mascotes dão bônus de XP ou ouro; montarias aumentam a velocidade.
- Toda compra é uma transação: debita o saldo, desbloqueia o item e registra em `purchases`, ou não faz nada.

## Compra de diamantes (Asaas)

- Tecla **L**, o botão "Comprar diamantes" da HUD ou o **+** do guarda-roupa abrem a loja. Os 7 pacotes estão em `packages/shared/src/payments.ts` (R$ 4,90 = 50 até R$ 499,90 = 6.500). A **primeira recarga da conta vale em dobro**.
- **Pix:** o QR Code e o copia e cola aparecem dentro do jogo. **Cartão:** abre a página segura da Asaas (o jogo nunca vê o número do cartão).
- Na primeira compra o jogador informa nome e CPF (a Asaas exige para o Pix). O CPF vai só para a Asaas; o jogo guarda apenas o id do cliente (`accounts.payer_id`).
- O diamante só entra quando a Asaas confirma. A confirmação chega pelo webhook, pela tela de pagamento (que pergunta a cada 3 s) ou pela conferência automática a cada 90 s. Qualquer um deles credita **uma vez só** (`payment_orders.status` passa de `pending` para `paid` numa única atualização), e o jogador online vê o saldo mudar na hora.
- Estorno ou chargeback tira os diamantes de volta (o saldo não fica negativo). `accounts.spent_cents` soma tudo o que a conta já pagou e nunca desce, então o dobro da primeira recarga não se repete.
- Sem `ASAAS_API_KEY`, em desenvolvimento, os pedidos são de mentira e a tela mostra "Simular pagamento (teste)". Em produção sem chave, a loja aparece como "abre em breve".
- O painel tem a aba **Vendas**: receita de hoje, 30 dias e total, pagantes, ticket médio, estornos e todos os pedidos, com um botão para conferir o pedido na Asaas na hora.

**Para ligar em produção:**

1. Crie a conta na [Asaas](https://www.asaas.com) e pegue a chave em *Integrações → Chaves de API*. Para testar antes, use uma conta do [sandbox](https://sandbox.asaas.com) (a chave de sandbox não cobra nada).
2. Em *Integrações → Webhooks*, crie um webhook com a URL `https://api.zuna.devfly.net/api/payments/webhook`, um **token de autenticação** inventado por você (uma senha longa), envio sequencial e os eventos de **Cobranças**.
3. Na Railway: `ASAAS_API_KEY=<chave>` e `ASAAS_WEBHOOK_TOKEN=<o mesmo token do passo 2>`, e publique de novo.

## Variáveis de ambiente do servidor

| Variável | Padrão | O que faz |
|---|---|---|
| `GAME_PORT` | `2567` | Porta do servidor do jogo e da API (em produção, vale também `PORT`) |
| `NODE_ENV` | — | `production` faz o servidor entregar o cliente compilado e desliga os comandos de teste |
| `DATABASE_URL` | — | Postgres de produção. Sem ela, usa o PGlite local |
| `PGLITE_DIR` | `packages/server/.data/pglite` | Pasta do banco local |
| `XP_RATE` | `1` | Multiplicador global de XP |
| `EVENT_INTERVAL_MIN` | `20` | `0` desliga os eventos automáticos (o intervalo de cada evento é definido no painel) |
| `DEV_COMMANDS` | ligado fora de produção | `0` desliga e `1` liga os comandos de teste |
| `ADMIN_USERS` | — | Contas que ganham acesso ao painel ao subir o servidor (separadas por vírgula) |
| `ASAAS_API_KEY` | — | Chave da Asaas. `$aact_prod_...` cobra de verdade; qualquer outra usa o sandbox. Sem ela, a loja de diamantes fica fechada em produção |
| `ASAAS_WEBHOOK_TOKEN` | — | O token configurado no webhook da Asaas. Sem ele, os avisos da Asaas são recusados |

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

## No celular

A interface do jogo começa fechada para sobrar tela: no alto à esquerda fica só o nome e o nível (toque abre ouro, diamantes e os botões), e no alto à direita dois botões redondos abrem o mapa e a conversa — a bolinha vermelha avisa mensagem nova. Atalhos de poder vazios somem da barra. No computador nada muda: tudo continua aberto.

## Painel de administração

Fica em `/admin` (a mesma URL do jogo), com login pela conta do jogo. A tela tem barra lateral, faixa ilustrada no topo e sete telas:

- **Visão geral** — contas, personagens, gente online, maior nível, ouro e diamantes do mundo, caçadas e compras; gráfico de cadastros dos últimos 14 dias; estado do servidor (evento em andamento, monstros vivos, salas, tempo no ar); os maiores heróis e as últimas ações do painel.
- **Jogadores** — busca por conta ou personagem, ordenação (nível, ouro, caçadas, contas novas, nome) e páginas de 40. Dá para editar nível, XP, ouro, diamantes, caçadas e classe direto na linha, tornar a conta administradora ou bloqueá-la, e abrir a **ficha completa**: senha nova, motivo do bloqueio, itens liberados (dar e tirar), compras, histórico da conta e, para cada personagem, nome, posição, mascote, montaria, vida, mana e os comandos de mestre — curar, levar ao templo, mandar recado, expulsar, silenciar, invocar monstros e apagar o personagem.
- **Mundo ao vivo** — começa ou encerra qualquer evento, manda anúncio para todo o servidor e lista quem está jogando agora, em que mundo, com vida, mana, posição e as ações rápidas de mestre (recado, curar, praça, levar para outro mundo, silenciar, expulsar). Atualiza sozinho a cada 6 segundos.
- **Mapas** — cria, copia e apaga mundos, e abre o editor de mapa. Veja abaixo.
- **Eventos** — monta os eventos do jogo: nome, anúncios, duração, bônus de XP e de ouro, mundo, disparo automático e as levas de monstros. Dá para começar um na hora.
- **Loja** — preço, moeda e o que está à venda, com quanto cada item já vendeu, quanto arrecadou e quantas contas o têm. O preço novo vale na hora, até para quem está com a loja aberta no jogo.
- **Histórico** — tudo que os administradores fizeram, com filtro por administrador, alvo ou ação.

### Mapas, portais e eventos

A aba **Mapas** lista os mundos e abre o editor. No editor, o mapa aparece de cima, um quadrado por tile:

- **Pintar chão** e **pôr cenário** com pincel de 1, 3, 5 ou 7 tiles; **preencher área** troca a mancha inteira de uma vez; **apagar pintura** devolve o tile ao terreno que o gerador desenhou. O que foi pintado à mão fica com um contorno dourado.
- **Portal** — clique num lugar para criar: nome, mundo de destino, onde chega e nível mínimo.
- **Ninho de monstro** — que monstro, quantos ficam vivos ao mesmo tempo, o raio em que nascem e em quanto tempo voltam.
- **Tesouro no chão** — moedas, baú ou cristal, com ouro, diamantes e o tempo para voltar depois de alguém pegar.
- **Centro do mundo** — onde os jogadores nascem e voltam à vida; em volta dele fica a praça protegida.
- O painel lateral mostra os dados do mundo (nome, terreno, semente, tamanho, raio da praça) e as listas de portais, ninhos e tesouros, com botões para mostrar no mapa, mudar e apagar.
- Cada traço do pincel é salvo na hora e chega a quem está jogando **sem ninguém precisar sair** — o terreno é redesenhado ao vivo. `Desfazer` volta o último traço.
- Um mundo novo escolhe o terreno (campina, caverna, ilha ou vazio), o tamanho (32 a 160 tiles) e se espalha monstros sozinho. Mundo **fechado** some do jogo e trava os portais que levam a ele; o mundo **principal** é onde os personagens novos nascem e não pode ser fechado nem apagado.

Como funciona por dentro:

- O acesso é por conta: `ADMIN_USERS=meu_usuario` marca a conta como administradora quando o servidor sobe. Depois disso, um administrador pode promover outros pelo painel. Ninguém consegue tirar o próprio acesso nem se bloquear.
- Mapas, portais, ninhos, tesouros, eventos e preços ficam no banco, não no código. O terreno em si continua sendo gerado pela semente nos dois lados: só o que foi pintado à mão trafega pela rede.
- Quem está jogando recebe as mudanças na hora, sem precisar sair: o painel avisa a sala do Colyseus pela ponte em `packages/server/src/live.ts`.
- Conta bloqueada não entra no jogo nem no painel, e quem estiver online é desconectado; o motivo aparece na tela de quem tenta entrar.
- Toda mudança fica registrada na aba Histórico (tabela `admin_actions`): quem fez, o quê, em quem e quando.
- As rotas ficam em `packages/server/src/adminApi.ts` (jogadores e comandos) e `adminWorldApi.ts` (mundos, mapas, eventos e loja); as consultas em `adminRepository.ts` e `worldRepository.ts`; as telas em `packages/client/src/admin/`.
- A arte do painel (faixa, cena lateral e retratos das classes) sai do `npm run brand`, recortada da referência em `assets/brand/` e dos próprios sprites do jogo.

## Banco de dados

As migrações são aplicadas sozinhas quando o servidor inicia. Depois de mudar `packages/server/src/db/schema.ts`, gere a migração nova:

```bash
npm run db:generate -w @zuna/server
```

## Identidade visual

- A logo é a arte em `assets/brand/zuna-logo.png`: a palavra em pedra com a gema esmeralda em cima e embaixo. Ela aparece no menu do jogo e no topo do painel.
- Frase e cores vêm do mesmo pôster: azul-noite com verde esmeralda. O dourado aparece só no ouro. As cores são variáveis no topo de `packages/client/src/style.css`.
- Fontes empacotadas no cliente (Fontsource, sem Google Fonts): Lilita One nos títulos, Permanent Marker na frase, Montserrat no resto e Cinzel nos títulos do painel. Todas são SIL Open Font License.
- A HUD usa o kit de interface em `assets/ui/hud-kit.png`, recortado em peças em `packages/client/public/ui/` (orbes de vida e mana, molduras de barra, slots das magias, painéis, chat e minimapa). Veja a ressalva de licença em [assets/CREDITS.md](assets/CREDITS.md).
- Tudo o que deriva da logo sai de um comando só:

```bash
npm run brand
```

  Ele lê `assets/brand/` e escreve em `packages/client/public/`: `brand/zuna-logo.png` (a logo sem o fundo preto, 1024px), os ícones `favicon.png`, `icon-192.png`, `icon-512.png` e `apple-touch-icon.png` (a gema sobre o azul-noite), a `og-image.jpg` de 1200×630 para a prévia dos links e a arte do painel (`brand/panel-*.jpg` e os retratos em `brand/class/`). Precisa do ImageMagick (`brew install imagemagick`); só roda quando a arte muda.

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

- `packages/shared`: regras usadas por cliente e servidor (mapa determinístico e os quatro terrenos, mundos e portais em `world.ts`, pathfinding A\*, curva de XP, monstros, magias, catálogo de cosméticos, eventos, validações, protocolo)
- `packages/server`: sala do mundo no Colyseus (movimento, IA dos monstros, combate, XP, morte, portais, compras), um `worldSim.ts` por mundo aberto, eventos vindos do banco (`events.ts`), API de contas e personagens (`api.ts`), banco com Drizzle (`db/`, `repository.ts`, `worldRepository.ts`)
- `packages/client`: Phaser 4 com interface em HTML (menu de conta e criação de personagem, HUD com orbes de vida e mana, minimapa, guarda-roupa, loja e ranking, renderização isométrica, efeitos). Sprites e tingimento em `sprites.ts`, personagens animados em `actors.ts`, drops no chão em `loot.ts`, minimapa em `minimap.ts`
- `packages/baker`: gera os sprites a partir dos modelos 3D
- `tools/download-assets.mjs`: baixa os modelos 3D originais para `assets/source/` (fora do git)

O chão (grama, terra, areia, pedra) ainda é desenhado em canvas pelo cliente (`packages/client/src/textures.ts`). A água tem gerador próprio em `packages/client/src/water.ts`: ondas contínuas calculadas pela posição na tela (sem a grade dos losangos), água rasa clareando perto da terra e espuma animada na beira.

## Checagem de tipos

```bash
npm run typecheck
```
