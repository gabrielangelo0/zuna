# Arena assíncrona — desenho

> Quarto e último dos sistemas pedidos em "PVP, arena de batalhas, VIP, andares". Os outros
> três estão no ar. Este é o que o §6 do plano do jogo chama de **arena assíncrona**: o
> jogador enfrenta uma cópia controlada pela IA do personagem de outro jogador.

## 1. Por que assíncrona

O plano do jogo (`docs/plano-do-jogo.md:226`) já decidiu: *"Sem lag, sem griefing, fácil de
construir, e mostra na prática a vantagem de quem investiu."* As três razões continuam valendo
e a terceira é a que paga a conta — a arena é a vitrine onde o equipamento comprado aparece.

A consequência de projeto é maior do que parece: **a arena não é combate, é simulação.** Ela não
usa a `WorldRoom`, não abre sala do Colyseus, não tem tick, não tem posição, não tem caminho.
É uma função pura que recebe dois lutadores e uma semente e devolve o combate inteiro já
resolvido. O cliente recebe esse registro e **anima uma reprise**.

Isso compra três coisas de graça: o combate é testável sem subir servidor, não há lag possível
porque não há nada ao vivo, e o resultado é reproduzível — guardar a semente e os dois retratos
é guardar a luta inteira.

## 2. Arenas, no plural

O pedido foi "crie arenas". São arenas de verdade, no plural: uma **tabela** de praças, cada uma
com sua faixa de nível, seu preço e suas recompensas, criadas e editadas no painel. O código
semeia três de fábrica e nada mais:

| Arena | Faixa | Entradas/dia | Entrada extra |
|---|---|---|---|
| Arena dos Novatos | 10–40 | 5 | 10 💎 |
| Coliseu de Zuna | 40–120 | 5 | 20 💎 |
| Arena dos Campeões | 120+ | 3 | 40 💎 |

Faixa de nível separada por arena é o que impede o nível 300 de catar nível 20 — e é por faixa,
não por pontuação, porque pontuação na faixa errada ainda junta gente de poder incomparável.

## 3. O retrato (snapshot)

Cada personagem tem **um** retrato na arena: nível, classe, vida, dano, armadura, aparência e
nome. É dele que a IA do adversário é feita.

**Quando atualiza:** sempre que o próprio personagem abre a arena, e a cada luta dele. Nunca
quando ele é *escolhido* como adversário — senão abrir a arena viraria uma escrita por
adversário listado.

> **Armadilha medida:** retrato que nunca atualiza congela o jogador forte como adversário
> fraco, e a arena passa a mentir sobre quem investiu — o oposto do propósito do sistema.

## 4. Manequins: a arena tem que funcionar com um jogador

Zuna não tem população. Numa lista montada só com gente de verdade, o primeiro jogador abre a
arena, vê a lista vazia, e o sistema está quebrado no dia do lançamento.

**Decisão: cada arena tem manequins**, gerados da faixa de nível dela com os números de classe
de fábrica, e criados no painel como qualquer outro conteúdo. A lista de adversários é
*gente de verdade primeiro, manequim para completar*.

**Manequim não dá pontuação** — só ouro e XP. Sem essa regra o ranking semanal é uma lista de
quem moeu mais boneco, e a competição morre na primeira semana.

## 5. A simulação

Por rodadas, em tempo simulado. Cada lutador tem `maxHp`, `maxDamage`, `armor` e os fatores da
classe. A cada passo, quem tem o próximo golpe vencido bate.

```
dano = round(maxDamage * (0,35 + r*0,65) * (crítico ? 1,8 : 1)) - armadura do outro
```

Os números são **os mesmos do combate ao vivo** (`playerStats` em `xp.ts`, `CRIT_CHANCE` e
`CRIT_MULTIPLIER` em `spells.ts`, `PLAYER_ATTACK_MS` em `constants.ts`). Dano que não bate com
o do mundo faria a arena ensinar o jogador a errado.

**Cura.** Quem tem a família `heal` na classe e vida abaixo de 35% cura em vez de bater, se
tiver mana. A cura usa `magicFactor` — é o que faz Druida e Feiticeiro jogarem diferente de
Cavaleiro em vez de serem só números maiores ou menores.

**Mana não regenera na luta.** Sem isso, dois curandeiros nunca terminam.

**Iniciativa sai da semente, não de quem desafiou.** Com dano alto, bater primeiro decide — e
desafiante sempre primeiro faria todo mundo esperar ser desafiado.

**Teto de rodadas.** Batendo o teto, ganha quem tem mais vida proporcional; empate exato é
derrota do desafiante, porque empate que premia quem desafiou premia enrolar.

> **Armadilha que custaria caro e aparece tarde:** a simulação **não pode** chamar
> `Math.random` em lugar nenhum. Tudo pela semente. Um único `Math.random` e a reprise que o
> cliente anima mostra um vencedor diferente do que o servidor gravou — e o defeito só aparece
> quando alguém reclama que ganhou na tela e perdeu no ranking.

## 6. Pontuação e temporada

Elo de K fixo, com piso. Ganhar de quem é mais forte vale mais; perder para quem é mais fraco
custa mais. Pontuação inicial e K vêm do painel.

A temporada é **semanal**, com chave `2026-W40` no mesmo fuso do check-in. Ao virar a semana,
a arena paga os degraus de recompensa configurados e zera a pontuação para o valor inicial.

> **Armadilha:** o pagamento tem que ser **idempotente**. O servidor reinicia, e um pagamento
> que roda duas vezes é diamante criado do nada. A temporada já paga fica gravada.

## 7. Entradas

Grátis por dia, por arena. VIP ganha entradas a mais (o degrau diz quantas). Acabou,
compra entrada avulsa em diamantes — é o gancho de monetização, e é por entrada, não por
vitória: vender vitória é vender ranking.

## 8. O que a arena **não** faz

- **Não tira XP e não derruba item.** A arena é segura. Fosse perigosa, seria o PvP com passos
  a mais, e ninguém entraria duas vezes.
- **Não dá item.** Ouro, XP e diamante no ranking semanal. Item na arena brigaria com a curva
  de equipamento que o PvP e as masmorras já sustentam.
- **Não tem sala, nem posição, nem caminho.** Ver §1.

## 9. Painel

Tudo editável, como manda a regra: arenas (nome, faixa, entradas, preço, ligada), manequins,
ajustes (K, pontuação inicial, teto de rodadas, limiar de cura), degraus de recompensa semanal,
e a lista de quem está em que posição. O código só semeia o padrão de fábrica.

## 10. Verificação

Testes puros, sem servidor: a simulação com a mesma semente dá o mesmo resultado duas vezes;
lutador muito mais forte ganha; cura segura o fraco por mais rodadas; mana acaba; teto de
rodadas decide por vida; Elo sobe e desce certo; manequim não mexe na pontuação; entrada
desconta e recusa quando acaba; chave de semana vira na hora certa.

À mão, no jogo local: abrir a arena com um personagem só e ver manequins na lista; lutar e ver
a reprise animada bater com o resultado; gastar as entradas até a recusa; comprar entrada;
ver a pontuação mudar contra gente de verdade e não mudar contra manequim; criar uma arena nova
no painel e vê-la aparecer no jogo sem reiniciar.

## 11. Fora de escopo

- **Ranking semanal com premiação automática por cron.** A virada acontece na primeira abertura
  da arena depois da semana virar, não num agendador. Agendador é infraestrutura a mais para
  um ganho que ninguém percebe.
- **Guilda e guerra de castelo** — §6, pós-lançamento.
- **Aposta entre jogadores** — vender vitória, ver §7.
