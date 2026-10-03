# PvP — desenho

Data: 2026-10-03. Estado: aprovado para virar plano de implementação.
Segundo de dois. Depende do campo `pvp` criado em
[2026-10-03-andares-design.md](2026-10-03-andares-design.md).

## 1. As regras, numa frase cada

- PvP só em mundo marcado `pvp: "open"`, e só fora da zona segura — **dos dois lados**.
- Só contra quem está na sua faixa de nível, e só a partir de um nível mínimo.
- Atacar quem não te atacou deixa uma **marca** visível por alguns minutos.
- Quem morre perde **um item da mochila**, que cai para o matador.
- Item comprado com diamante **nunca** cai.

Todos os números são linha no banco, editada no painel. O código só semeia o padrão.

## 2. Onde o PvP vale

```ts
world.pvp === "open" && !inSafe(mundo, atacante.x, atacante.y) && !inSafe(mundo, vítima.x, vítima.y)
```

A zona segura tem que valer para os **dois**. Só checar a vítima deixaria alguém parado na
praça atirando para fora; só checar o atacante deixaria o contrário. `inSafe` já existe e já é
o que mantém monstro fora da cidade, então o saguão de cada andar é seguro de graça.

## 3. Faixa de nível e nível mínimo

Com nível ilimitado (§4.2 do plano do jogo), faixa em porcentagem, nunca em número absoluto —
uma faixa de "±20 níveis" que protege no nível 40 não significa nada no nível 400.

```ts
Math.max(a.level, b.level) / Math.min(a.level, b.level) <= settings.levelRatio
```

| Ajuste | Padrão | O que faz |
|---|---|---|
| `minLevel` | 30 | abaixo disso, ninguém ataca e ninguém é atacado |
| `levelRatio` | 1.5 | nenhum dos dois pode estar 50% acima do outro |
| `markMinutes` | 15 | quanto tempo a marca dura |
| `retaliationMinutes` | 10 | janela para revidar sem ganhar marca |
| `dropSlots` | 1 | quantas casas da mochila caem |
| `enabled` | true | desliga o PvP no servidor todo, sem editar mundo por mundo |

Guardados como JSON em `server_meta`, chave `pvp-config`, igual a `progressSettings` e
`checkinSettings`. O painel edita e vale na hora.

## 4. A marca

Atacar alguém que **não** te atacou e **não** está marcado deixa você marcado por
`markMinutes`. Enquanto marcado:

- qualquer um pode te atacar, **fora da faixa de nível** — é a punição que importa
- você perde `dropSlots + 1` casas da mochila ao morrer, em vez de `dropSlots`

Revidar não marca: se A te atacou, você tem `retaliationMinutes` para bater em A à vontade.
`PlayerSim` guarda `attackedBy: Map<playerId, expiraEm>`, limpo pela mesma varredura de
regeneração que já roda de segundo em segundo.

**A marca sobrevive a desconectar.** Vai em `characters.marked_until` (timestamp), não só na
memória. Sem isso, a marca não vale nada: o griefer sai e volta limpo, e o sistema inteiro
passa a ser decoração.

## 5. A morte no PvP

Você escolheu queda de item. Esta seção é o desenho que faz isso **não** virar máquina de
estorno, porque num jogo onde se paga por equipamento essa é a falha que cancela conta.

### 5.1 O que cai, e o que não cai

| | Cai? |
|---|---|
| Item solto na mochila | **sim**, `dropSlots` sorteadas (veja 5.1.1) |
| Equipamento **vestido** | **não** |
| Item marcado `bound` (comprado com diamante) | **nunca** |
| Ouro e diamante | não |

Vestido não cai de propósito. O que o jogador está usando é o que ele mostra e o que ele
sentiu caro de conseguir; tirar isso dele num encontro de dez segundos é a diferença entre
tensão e desistência. Você disse "item da mochila", e mochila é o que este spec entrega.

#### 5.1.1 De onde sai o sorteio

O sorteio é sobre as casas **ocupadas e elegíveis** da mochila — não sobre as 20 casas da grade.
Sortear casas vazias faria `dropSlots: 1` quase nunca derrubar nada numa mochila folgada, e o
sistema pareceria quebrado.

- mochila vazia, ou só com item `bound`: **nada cai**, e a morte é só a XP de sempre
- menos itens elegíveis que `dropSlots`: cai o que houver
- pilha (poções): cai a pilha inteira daquela casa, não uma unidade

### 5.2 `bound`: a trava que protege o dinheiro

`character_items` ganha `bound: boolean`, marcado **na entrega** quando a origem é compra com
diamante. A tabela `purchases` já guarda `currency`, então a regra é legível depois: todo item
que saiu de uma compra em diamante é vinculado e não cai nunca.

Sem isso, no primeiro mês alguém perde um item farmado e abre reclamação dizendo que perdeu um
item comprado — e sem o `bound` e sem o registro da seção 7 **não há como provar o contrário**.
Com os dois, a resposta é um minuto de consulta no painel.

### 5.3 Amuleto de Proteção

O §8.6 do seu plano já lista "Proteção: Amuleto de Proteção, ressurreição no local". Ele entra
aqui: equipado, consome-se a si mesmo na morte em PvP e **nada** cai. Vendido por diamante.

É o fecho que faltava na sua escolha: queda de item cria o medo, e o amuleto vende contra o
medo. O caminho que eu recomendei antes — não arriscar nada — deixava esse laço aberto.

### 5.4 Como o item cai

Reusa `dropLoot(sim, drop, x, y, owner)`, que já existe e já dá primeira-mão ao dono por
`LOOT_OWNER_MS` antes de liberar para qualquer um. O item da vítima cai com
`owner = matador.id`. Nenhuma peça nova no sistema de drop.

A perda de XP é a de hoje (`DEATH_XP_LOSS`, reduzida para VIP). Morte para monstro **não
muda**: continua só XP, sem queda de item.

## 6. O custo real: todo caminho de dano é só de monstro

Isto é o que torna o PvP caro, e não as regras acima.

```ts
if (id && !this.monsters.has(id)) return;              // handleTarget
const target = s.target ? this.monsters.get(s.target)  // updatePlayer, handleSpell
let targets: MonsterSim[] = []                         // handleSpell
damageMonster(monster, attacker, …)
killPlayer(player, killer: MonsterSim)                 // o matador só pode ser monstro
```

E `playersAt` é `Map<tile, número>` — uma **contagem**, porque jogadores se atravessam.
`monsterAt` é `Map<tile, id>`. Então magia de área hoje não tem como achar um jogador num tile.

### 6.1 A abstração

Em vez de espalhar `MonsterSim | PlayerSim` por 3.000 linhas:

```ts
export interface Combatant {
  readonly id: string;
  readonly world: WorldSim;
  readonly state: { x: number; y: number; hp: number; maxHp: number };
}
```

`damage(alvo: Combatant, atacante: Combatant, quanto: number, crit: boolean)` despacha para
`damageMonster` ou `damagePlayer`. O código de monstro não muda de forma.

### 6.2 Os seis pontos de contato

| # | Onde | Mudança |
|---|---|---|
| 1 | `handleTarget` | aceita id de jogador, se `canAttack` deixar |
| 2 | `updatePlayer` (auto-ataque) | `this.combatant(id)` no lugar de `this.monsters.get(id)` |
| 3 | `handleSpell` | alvo e coleta de área passam a olhar `playersAt` |
| 4 | `damageMonster` | ganha irmão `damagePlayer` |
| 5 | `killPlayer` | `killer` passa a ser `Combatant` |
| 6 | `worldSim.ts` | `playersAt: Map<number, string[]>`, como o `lootAt`; `occupyPlayer` por id |

### 6.3 Uma função decide tudo

```ts
/** O que `canAttack` precisa saber de cada lado. Nem `Combatant` nem `PlayerSim`: só isto. */
export interface Fighter {
  level: number;
  markedUntil: number;
  inSafe: boolean;
  /** Quando o outro lado atacou este jogador por último (0 = nunca). */
  attackedAt: number;
}

export function canAttack(a: Fighter, b: Fighter, s: PvpSettings, agora: number): string | null
```

`Fighter` é propositalmente diferente de `Combatant` (seção 6.1): aquele é a forma de quem
*toma dano*, este é a forma de quem *tem direito de atacar*. Juntar os dois obrigaria a função
pura a conhecer `WorldSim`, e aí ela deixaria de ser testável sem subir servidor.

Devolve `null` quando pode, ou o motivo em português quando não. Pura, em `shared/pvp.ts`,
chamada dos pontos 1, 2 e 3 — uma regra, um lugar, testável sem subir servidor.

## 7. Registro de mortes, para moderação

Tabela `pvp_kills`: `id`, `killerId`, `victimId`, `worldId`, `markedKiller` (booleano),
`droppedItems` (ids separados por vírgula, como o `looks` do personagem já faz), `createdAt`.

Plural porque `dropSlots` é ajustável e pode passar de 1 — um campo singular aqui perderia
exatamente a informação de que a disputa vai depender.

Não é enfeite. Você escolheu queda de item, então vai haver disputa — "me mataram em zona
segura", "perdi um item que eu comprei", "aquele cara só mata novato". Sem registro, a resposta
é adivinhação. O painel mostra as últimas mortes com filtro por jogador, e o §6 do plano do
jogo já pede moderação pelo painel.

## 8. Cliente

- `PlayerState` ganha `marked: t.boolean()`. Já está dentro da `StateView`, então quem está
  perto recebe de graça: a marca aparece em cima do personagem.
- A mira passa a pegar jogador, e a barra de vida aparece sobre jogador como já aparece sobre
  monstro.
- Ao entrar num mundo `pvp: "open"`, aviso na tela: "Zona de PvP — você pode ser atacado aqui."
- Tentativa recusada mostra o motivo que `canAttack` devolveu, em vez de o clique não fazer nada.

### 8.1 Um aviso honesto: o PvP vai ser escorregadio

Jogadores se atravessam (`playersAt` é contagem, e `blockedForPlayer` só olha monstro). No
Tibia, prender o outro com o corpo é metade da tática de PvP. Aqui não vai existir: ninguém
encurrala ninguém, e toda briga é de perseguição.

Mudar isso significa jogador bloquear jogador, e aí a praça da cidade entope, o A\* passa a
falhar com gente parada no caminho, e o custo sai deste spec e vira outro. Fica como está, e
registro a consequência em vez de deixar você descobrir jogando.

## 9. Migração

A próxima migração da sequência: `characters.marked_until`, `character_items.bound` e a tabela
`pvp_kills`. O número sai do `drizzle-kit`, não deste documento.

**Este spec depende do dos andares**, que cria `worlds.pvp`. Implementar o PvP primeiro obriga a
trazer essa coluna para cá. Aqui o campo ganha tela no painel e passa a ter efeito.

## 10. Arquivos

```
packages/shared/src/pvp.ts          PvpSettings, padrão de fábrica, canAttack, escolha do que cai
packages/server/src/db/schema.ts    marked_until, bound, pvp_kills
packages/server/src/pvp.ts          carrega e salva os ajustes          (molde: progress.ts)
packages/server/src/adminPvpApi.ts  ajustes + lista de mortes           (molde: adminProgressApi.ts)
packages/server/src/worldSim.ts     playersAt por id
packages/server/src/WorldRoom.ts    Combatant, damagePlayer, os seis pontos da seção 6.2
packages/client/src/WorldScene.ts   marca, barra de vida e mira em jogador
packages/client/src/admin/pvp.ts    tela dos ajustes e das mortes
packages/client/src/admin/worlds.ts o campo pvp ganha tela
```

## 11. Como provamos que funciona

`canAttack` é a função onde um erro vira griefing ou vira PvP que não funciona, e a escolha do
que cai é onde um erro tira item pago de alguém. As duas são puras, então o teste é direto, em
`packages/shared/src/pvp.test.ts`:

- abaixo de `minLevel`, recusa dos dois lados
- fora de `levelRatio`, recusa; dentro, deixa
- em mundo `off`, recusa; em zona segura de qualquer um dos dois, recusa
- marcado é atacável **fora** da faixa de nível
- dentro da janela de revide, bater de volta não marca; fora dela, marca
- a escolha do que cai **nunca** devolve item `bound`, nem item vestido
- com Amuleto de Proteção equipado, devolve lista vazia e marca o amuleto como consumido
- marcado derruba `dropSlots + 1`

À mão, com dois personagens no jogo local: bater na praça (recusado), bater no esgoto (vale),
tomar marca, deixar o outro revidar sem marca, morrer e ver o item cair com o dono certo,
conferir que o item comprado com diamante ficou, e desconectar marcado para ver a marca voltar.

## 12. Fora de escopo

- **Arena.** Era o terceiro sistema dos quatro e não entrou neste pedido. O §6 do plano do jogo
  quer arena **assíncrona** (cópia do personagem do outro controlada pela IA), que não usa nada
  desta sala — é simulação, não combate ao vivo. Spec próprio.
- **Guilda e guerra de castelo** — §6, pós-lançamento.
- **Jogador bloquear jogador** (seção 8.1).
- **Ressurreição no local** — o §8.6 lista junto com o amuleto; vale um spec com o resto da
  loja de proteção.
