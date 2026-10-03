# Andares: esgotos, escadas e montanhas — desenho

Data: 2026-10-03. Estado: aprovado para virar plano de implementação.
Primeiro de dois: o PvP vem no spec seguinte e consome o campo `pvp` criado aqui.

## 1. A decisão que define o tamanho

Andar é **mundo**, não eixo Z. Você desce a escada, a tela troca, você está no esgoto.

Não é o Tibia empilhado: aqui você **não** vê o andar de baixo, não atira escada abaixo, e o
mago lá de cima não te acerta. Essa versão foi considerada e descartada — custa semanas, mexe
em mapa, render, pathfinding, minimapa, editor e no recorte de visão recém-construído, e nada
disso é necessário para existir esgoto, mina e montanha. Se o jogo pedir andares de verdade
mais tarde, aí haverá jogador real justificando a conta.

### O que já existe e não vamos construir

A mecânica de escada está **pronta e em produção**:

| Peça | Onde | Estado |
|---|---|---|
| Portal dispara ao pisar | `enterPortal` | ✅ mesmo mundo e entre mundos |
| Nível mínimo para passar | `PortalDef.minLevel` | ✅ |
| Trava contra ficar quicando | `nextPortalAt = agora + 800` | ✅ |
| Chegada sem cair em parede | `travel` → `findFreeTile` | ✅ |
| Sprite de portal no cliente | `drawPortals` (dourado se trancado, roxo se livre) | ✅ |
| Portal no minimapa | blip roxo | ✅ |
| Editor de mundo, pintura à mão, ninhos | painel | ✅ |

Sobram quatro coisas, e é só isso que este spec faz.

## 2. Dois campos novos em `WorldDef`

```ts
/** Andar relativo: 0 = superfície, −1 = subsolo, +2 = pico. Só rótulo, não muda regra. */
depth: number;
/** Zona de PvP. Criado aqui, sem nenhum efeito até o spec do PvP. */
pvp: "off" | "open";
```

`depth` vai de −20 a +20. Serve para o jogador saber onde está e para o painel ordenar a lista
de mundos como uma torre, em vez de uma lista alfabética solta.

`pvp` nasce aqui, com padrão `"off"`, **e fica fora da tela do painel neste spec**. Uma chave
que o administrador pode virar e que não faz nada é um relatório de bug esperando acontecer;
a coluna existe para o spec do PvP não precisar de outra migração, e a tela aparece lá.

### Sem mudança de protocolo

O cliente já recebe os `WorldBlueprint` inteiros em `WorldsResponse`, e cada um carrega o
`WorldDef`. Então a HUD lê `depth` pelo slug que o `TravelEvent` já manda. Nada novo no
protocolo: a HUD passa a mostrar `Esgoto de Zuna · −1`.

## 3. Dois estilos de terreno

Em `shared/map.ts`, ao lado dos onze que já existem. Cada gerador do repositório tem 25–35
linhas (`paintCave` 24, `paintSnow` 30, `paintCrypt` 33), e estes dois ficam na mesma faixa.

### `esgoto`

Canais de água em grade, passarelas de pedra nas margens, lama nos cantos, cogumelos e barris.
Usa `Ground.Water`, `Ground.Stone`, `Ground.Mud` e `Obj.Mushroom`, `Obj.Barrel`, `Obj.Pillar`.

### `montanha`

Platôs de rocha subindo, neve a partir de certa altura, pinheiros embaixo e pinheiros nevados
em cima, cristais nas paredes. Usa `Ground.Stone`, `Ground.Snow`, `Ground.Dirt` e `Obj.Pine`,
`Obj.SnowPine`, `Obj.Rock`, `Obj.Crystal`.

### Um aviso honesto sobre a arte

**Nenhum dos dois precisa de arte nova** — ambos se montam com os tiles e objetos que já
existem. Isso é o que os torna baratos, e também é o limite deles: um esgoto feito de
`Ground.Stone` com `Obj.Pillar` de parede vai parecer **uma caverna com água**, não um esgoto
de tijolo com abóbada. A montanha se sai melhor, porque rocha e neve já são o que ela é.

Dado o padrão de arte do projeto, registro isto como a única parte deste spec que fica abaixo
da barra: para o esgoto parecer esgoto faltam tijolo, abóbada, grade e cano. É trabalho de
asset, não de código, e é uma decisão separada — o gerador aceita os tiles novos sem mudar de
forma quando eles existirem.

### Ninhos de monstro

`STYLE_ZONES` em `spawns.ts` ganha uma entrada para cada estilo novo, senão os dois caem no
`CLASSIC` e o esgoto nasce com raposas. Oito dos doze estilos já têm zona; estes dois entram na
lista com monstros que **já existem**:

| Estilo | `kind` | Nome que aparece no jogo |
|---|---|---|
| `esgoto` | `rat` | Slime Rosa |
| | `spikyBlob` | Gosma Espinhenta |
| | `glub` | Glub do Brejo |
| | `frog` | Sapo Gigante |
| `montanha` | `wolf` | Lobo |
| | `golem` | Morcego do Musgo |
| | `troll` | Yeti |
| | `yetiElder` (chefe) | Yeti Ancião |

**Atenção na implementação:** as chaves de `MONSTERS` **não batem** com os nomes mostrados.
`rat` é "Slime Rosa", `troll` é "Yeti", `golem` é "Morcego do Musgo". Quem escolher pela chave
põe o bicho errado no mapa. A coluna da direita é a que vale para decidir.

É data, poucas linhas, e o painel edita por cima depois.

## 4. `PortalDef.kind`: o desenho muda, a regra não

```ts
export type PortalKind = "portal" | "stairsDown" | "stairsUp" | "ladderDown" | "ladderUp" | "hole";
```

`drawPortals` escolhe o visual pelo `kind`; `enterPortal` **não olha** para ele. É cosmético,
mais uma dica de leitura para quem edita no painel. O minimapa passa a usar cores diferentes
para descida e subida, e aí ele se lê como mapa de masmorra.

Por que um campo no portal e não um objeto novo na paleta: com objeto, o administrador teria
que pintar a escada **e** colocar o portal em cima, duas coisas que divergem no primeiro
descuido. Escada que não leva a lugar nenhum é confusão; buraco sem volta é jogador preso para
sempre. Com `kind`, há **uma** coisa para colocar e ela não pode desencontrar de si mesma.

## 5. Escada de volta automática

`POST /api/admin/portal` ganha `withReturn?: boolean`. Quando verdadeiro, num portal novo, o
painel cria o par espelhado junto:

| Campo do par | Valor |
|---|---|
| origem | `(toWorldId, toX, toY)` |
| destino | `(worldId, x, y)` |
| `kind` | invertido: `stairsDown` ↔ `stairsUp`, `ladderDown` ↔ `ladderUp` |
| `minLevel` | **0, sempre** |
| `name` | "Volta para {nome do mundo de origem}" |

Três recusas e um aviso, todos com frase em português:

1. **Tile de destino não caminhável** — recusa o portal inteiro. O `travel` usa `findFreeTile`
   e o jogador não ficaria preso, mas a escada de volta nasceria longe do lugar onde ele caiu,
   e isso se lê como bug.
2. **Já existe portal no tile de destino** — cria só o de ida e avisa que o par não foi feito.
3. **Passou de `WORLD_MAX_PORTALS`** (80) em qualquer um dos dois mundos — recusa os dois.

O `minLevel: 0` na volta é a regra mais importante deste spec. Um portal de ida com nível 50 e
uma volta com nível 50 tranca quem entrou de nível 50 e morreu para nível 49 lá dentro. A volta
nunca cobra nível.

**4. Mundo de destino sem nenhuma saída** — não recusa, **avisa**. É aviso e não recusa porque
o administrador legitimamente monta o andar em duas sessões: cria a descida hoje, a subida
amanhã. Recusar travaria o trabalho dele; ficar calado deixaria um andar sem volta no ar.

O `hole` é de mão única de propósito (cair num buraco e não poder subir por ele), e é
exatamente por isso que o aviso 4 existe: quem usa `hole` tem que colocar a escada de saída em
outro lugar, e nada no `kind` obriga a isso.

## 6. Migração

`npx drizzle-kit generate` produz a próxima migração da sequência com `worlds.depth`,
`worlds.pvp` e `portals.kind`. O número sai da ferramenta conforme a ordem em que os specs
forem implementados, não deste documento. Aplicado no arranque, no PGlite do desenvolvimento e no Postgres
da produção. Os três têm padrão, então os mundos e portais que já existem continuam valendo.

## 7. Arquivos

```
packages/shared/src/map.ts        paintSewer, paintMountain, MAP_STYLES, reachableTiles (movida)
packages/shared/src/world.ts      depth, pvp, PortalKind, validação dos limites
packages/server/src/db/schema.ts  worlds.depth, worlds.pvp, portals.kind
packages/server/src/spawns.ts     STYLE_ZONES dos dois estilos; importa reachableTiles de shared
packages/server/src/adminWorldApi.ts  withReturn e as três recusas
packages/client/src/WorldScene.ts drawPortals passa a olhar o kind
packages/client/src/minimap.ts    cor por kind
packages/client/src/hud.ts        nome do mundo + andar
packages/client/src/admin/worlds.ts  campo depth, seletor de kind, caixa "criar escada de volta"
```

### A refatoração mínima

`reachableTiles` é hoje uma função privada de `spawns.ts`. Ela é matemática de mapa pura e só
depende de `isWalkable`, que já mora em `map.ts`. Vai para `shared/map.ts` e passa a ser
exportada; `spawns.ts` importa. É o que permite o teste da seção 8, e não há outro motivo para
mexer nela.

## 8. Como provamos que funciona

O teste que importa não é sobre escada, é sobre **mapa que prende jogador**. Um gerador de
esgoto que faça bolsões isolados cria um mundo onde o jogador cai e não sai, e isso não aparece
olhando a tela — aparece no suporte, dias depois.

Em `packages/shared/src/map.test.ts`, com o `node --test` que já vem no Node:

- para 20 sementes de cada estilo novo, o tile de nascimento é caminhável
- e a partir dele, `reachableTiles` alcança pelo menos 80% dos tiles caminháveis do mapa
- o mesmo nos tamanhos extremos, `WORLD_MIN_SIZE` (32) e `WORLD_MAX_SIZE` (160)
- nos onze estilos que já existem, o teste **mede e grava a linha de base** em vez de exigir
  os mesmos 80%: eu não medi nenhum deles, e cravar um limiar que `ilha` ou `vazio` talvez não
  alcance faria o teste falhar por um defeito que não existe. A asserção é "não piorou", que é
  o que de fato protege a mudança de `reachableTiles` de lugar

À mão, no jogo local: criar um esgoto, criar a escada com volta automática, descer, voltar,
e conferir o rótulo do andar na HUD. Depois tentar as três recusas da seção 5 e ler as
mensagens.

## 9. Fora de escopo

- **Andares empilhados com visão entre eles** (seção 1).
- **PvP.** O campo `pvp` nasce aqui sem efeito e sem tela; o comportamento é o spec seguinte.
- **Arte de tijolo e abóbada para o esgoto** (seção 3).
- **Masmorra com instância por grupo** — o §4.9 do plano do jogo marca como Fase 3, e continua.
