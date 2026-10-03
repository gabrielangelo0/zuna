# VIP — desenho

Data: 2026-09-25. Estado: aprovado para virar plano de implementação.

## 1. O que é, e o que não é

O VIP é um **passe por prazo, comprado com diamantes**, que dá sete benefícios enquanto vale.
Não encosta na Asaas: o jogador já compra diamantes por Pix e cartão, e gasta os diamantes aqui.

Fora de escopo, de propósito:

- **Assinatura recorrente.** Renovar sozinho só funciona no cartão (no Pix o jogador paga de novo
  na mão de qualquer jeito), e traz webhook de renovação, cobrança que falha, fluxo de
  cancelamento e chargeback — suporte que um dev sozinho não tem como atender. O estado por
  baixo é `vipTier` + `vipUntil`, então acrescentar renovação depois não refaz nada disto.
- **Patrono** (§8.5 do plano do jogo): é por gasto acumulado, não por prazo. Outro sistema.
- **Coleta offline, auto-caça, refino e teleporte.** A tabela §8.4 promete esses quatro, e
  nenhum existe no código. Entram no VIP quando cada um for construído — a seção 10 deixa o
  gancho pronto.

### Por que sete benefícios e não os oito da tabela §8.4

Dos oito benefícios prometidos no plano do jogo, **dois existem** hoje (bônus de XP e perda de
XP na morte). Construir o VIP como está na tabela entregaria uma tela com seis linhas riscadas
a quem acabou de pagar — e o primeiro pedido de estorno viria no mesmo dia. Trocamos os seis
de vaporware por cinco que o código já sustenta, sem baixar o valor percebido.

## 2. Estado

O VIP é **por conta**, como os diamantes e o `spentCents`. Todos os personagens da conta são
VIP juntos. Um degrau ativo por vez, uma data de fim.

### 2.1 Duas colunas em `accounts`

```ts
vipTier: text("vip_tier").notNull().default(""),          // "" = não é VIP
vipUntil: timestamp("vip_until", { withTimezone: true }), // null = não é VIP
```

### 2.2 `vip_tiers` — o que o degrau dá

Uma linha por degrau. O painel cria, edita e desliga; o código só semeia o padrão de fábrica
uma vez, pela chave `serverMeta` `"vip"`, igual ao check-in.

| Coluna | Tipo | Ouro | Diamante |
|---|---|---|---|
| `id` | text, pk | `ouro` | `diamante` |
| `name` | text | VIP Ouro | VIP Diamante |
| `description` | text | | |
| `rank` | smallint | 1 | 2 |
| `diamondsPerDay` | integer | 9 | 22 |
| `bonusXp` | doublePrecision | 0.50 | 1.00 |
| `bonusGold` | doublePrecision | 0.20 | 0.40 |
| `deathXpFactor` | doublePrecision | 0.50 | 0 |
| `bagSlots` | smallint | 20 | 40 |
| `color` | text | `#e8b13a` | `#7dd8ff` |
| `title` | text | `""` | `Diamante` |
| `chestGold` | integer | 5000 | 15000 |
| `chestDiamonds` | integer | 5 | 15 |
| `chestXp` | doublePrecision | 0 | 0 |
| `chestItem` | text | `pocao-vida` | `pocao-vida-forte` |
| `chestItemCount` | integer | 5 | 10 |
| `enabled` | boolean | true | true |

`rank` serve para comparar degraus (subir, descer, e a tranca de montaria exclusiva).
`diamondsPerDay` é o **único** número que a conversão de degrau usa — veja a seção 4.

### 2.3 `vip_passes` — o que está à venda

| `id` | `tier` | `days` | `priceDiamonds` | `tag` | `enabled` | `sort` |
|---|---|---|---|---|---|---|
| `ouro-30` | ouro | 30 | 275 | | true | 0 |
| `diamante-30` | diamante | 30 | 660 | Mais vendido | true | 1 |

Duas tabelas e não uma: senão criar "Ouro 90 dias com desconto" obrigaria a duplicar as dez
colunas de benefício, e duplicata de regra é onde nasce a divergência silenciosa. É o mesmo
desenho de `diamond_packs` separado da moeda.

`vipPasses.tier` é chave estrangeira para `vipTiers.id` **sem cascata**: o banco recusa apagar
um degrau que ainda tem passe à venda, e a API do painel avisa antes com uma frase em
português em vez de deixar o erro do Postgres subir.

### 2.4 `account_vip` — o baú diário

```ts
accountId: integer.primaryKey().references(accounts.id, { onDelete: "cascade" }),
lastChestDay: text.notNull().default(""),   // "2026-09-25"
totalChests: integer.notNull().default(0),
updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
```

### 2.5 Sem tabela nova de gasto

A tabela `purchases` já grava todo gasto de diamante e de ouro (`itemId`, `currency`, `price`).
A compra de VIP grava ali com `itemId: "vip:ouro-30"`, `currency: "diamonds"`, `price: 275`.
O painel conta quanto o VIP arrecadou sem nenhuma tabela nova.

### 2.6 Migração

`npx drizzle-kit generate` produz a próxima migração da sequência — o número sai da
ferramenta conforme a ordem em que os specs forem implementados, não deste documento. O arranque aplica
sozinho, no PGlite do desenvolvimento e no Postgres da produção
([db/index.ts](../../../packages/server/src/db/index.ts)).

## 3. As quatro situações de compra

| Situação | O que acontece |
|---|---|
| Não é VIP, ou venceu | `tier = passe.tier`, `until = agora + passe.days` |
| Mesmo degrau | soma os dias: `until = max(agora, until) + passe.days` |
| Degrau maior | converte o que sobra pelo valor em diamantes (seção 4) |
| Degrau menor, ainda válido | **recusa**, com a data que ele já tem na mensagem |

Recusar a descida não é grosseria: sem isso, quem tem Diamante compraria Ouro barato para
esticar prazo, e o jogo perderia a diferença de preço.

### 3.1 Bordas do painel

O painel pode mexer num degrau depois de alguém já ter comprado. As regras, todas explícitas:

| Mudança no painel | O que acontece com quem já pagou |
|---|---|
| Benefício editado (`bonusXp`, `bagSlots`, …) | vale na hora, para melhor ou para pior: o benefício é sempre lido da linha |
| `diamondsPerDay` editado | a conversão da seção 4 usa o valor **de agora**; baixá-lo desvaloriza o prazo que os jogadores têm guardado, e o painel avisa isso na tela |
| Degrau desligado (`enabled = false`) | quem tem continua com tudo até vencer; os passes daquele degrau saem da vitrine |
| Degrau apagado | **recusado** enquanto existir passe à venda dele (chave estrangeira) **ou** qualquer conta com `vipTier` igual a ele; a API responde em português dizendo quantas contas travam |
| Passe apagado ou com preço novo | não mexe em quem já comprou; `purchases` guarda o preço da hora da compra |

Apagar um degrau que contas ainda têm deixaria `accounts.vipTier` apontando para lugar nenhum,
e o jogador perderia o VIP pago sem aviso. Daí a recusa ser no servidor e não só na tela.

## 4. A conta da conversão de degrau

Em `packages/shared/src/vip.ts`, função pura, sem data do sistema por dentro:

```ts
export function upgradeDays(restanteMs: number, de: VipTier, para: VipTier, passe: VipPass): number {
  const restanteDias = Math.max(0, restanteMs) / 86_400_000;
  const saldo = restanteDias * de.diamondsPerDay;
  return passe.days + Math.floor(saldo / para.diamondsPerDay);
}
```

Exemplo: sobram 10 dias de Ouro. Saldo = 10 × 9 = 90 💎. Diamante custa 22 💎/dia, então 90 💎
valem `floor(90 / 22) = 4` dias. O jogador fica com 30 + 4 = **34 dias de Diamante**.

A função atende **só a subida de degrau**. As outras três linhas da tabela da seção 3 não
convertem nada: somam `passe.days` a `agora` ou a `until`, o que der mais tarde.

O arredondamento é para baixo, a favor do jogo. A diferença é de centavos e protege contra
alguém achar um ciclo de compra e venda que renda dias de graça.

## 5. Onde cada benefício morde o código

| Benefício | Lugar exato | Como |
|---|---|---|
| XP | [WorldRoom.ts:1917](../../../packages/server/src/WorldRoom.ts) | soma `bonusXp` ao `bonuses.xp` de pet e montaria |
| Ouro | [WorldRoom.ts:1925](../../../packages/server/src/WorldRoom.ts) | soma `bonusGold` ao `bonuses.gold` |
| Perda de XP na morte | `killPlayer` | `DEATH_XP_LOSS * deathXpFactor` |
| Mochila | `capacity()` → `bagCapacity` | veja a seção 6, tem correção |
| Nome colorido e título | `PlayerState` | ganha `vip: t.uint8()` e `title: t.string()` |
| Montaria e pet exclusivos | `CatalogItem` | ganha `vip?: number` (rank mínimo) |
| Baú diário | mensagem `vipClaim` | seção 7 |

### 5.1 O bônus de XP vale só para XP de monstro

Decisão explícita. O bônus entra em `killMonster`, no mesmo ponto onde pet e montaria já
entram. XP de missão, de baú de marco e de check-in passa por `giveXp`, que hoje **não**
recebe bônus de pet nem de montaria — mantemos a regra que já existe em vez de criar uma
segunda. Do contrário o VIP Diamante dobraria o prêmio do check-in, que o painel calibrou sem
contar com isso.

### 5.2 O nome colorido é o que vende o VIP

`players` já está dentro da `StateView` do recorte de visão, então `vip` e `title` chegam de
graça a quem está perto. O jogador vê o VIP dos outros na tela e no chat, e isso é a prova
social que o plano do jogo chama de "desejo e comparação" (§6). Sem isso o VIP é invisível, e
um benefício invisível não gera a segunda venda.

### 5.3 Expiração sem custo por tick

`PlayerSim` guarda `vipTier` e `vipUntil`. Em `shared/vip.ts` a decisão é uma função pura,
sem ler a data do sistema por dentro — é o que a torna testável:

```ts
export function vipRank(tier: VipTier | undefined, untilMs: number, agora: number): number {
  if (!tier || untilMs <= agora) return 0;
  return tier.rank;
}
```
 A varredura de regeneração, que já roda de segundo em segundo, percebe a virada,
avisa no chat ("Seu VIP Ouro terminou.") e reenvia o perfil. Nada de verificação por tick.

## 6. Correção necessária em `bagCapacity`

Hoje:

```ts
export function bagCapacity(items: readonly OwnedItem[]): number {
  const backpack = items.find((item) => item.equipped === "backpack");
  const extra = backpack ? (gearItem(backpack.itemId)?.bagSlots ?? 0) : 0;
  return Math.min(BAG_MAX, BAG_BASE + extra);   // BAG_BASE = 20, BAG_MAX = 60
}
```

Somar os 40 espaços do VIP Diamante dentro deste `Math.min` daria `20 + 40 = 60`, exatamente o
teto — e a bolsa equipada do jogador não valeria **nada**. Quem pagasse pelo degrau mais caro e
usasse a melhor bolsa do jogo perderia o bônus dela inteiro, sem aviso.

O VIP levanta o teto junto com o piso:

```ts
export function bagCapacity(items: readonly OwnedItem[], vipSlots = 0): number {
  const backpack = items.find((item) => item.equipped === "backpack");
  const extra = backpack ? (gearItem(backpack.itemId)?.bagSlots ?? 0) : 0;
  return Math.min(BAG_MAX + vipSlots, BAG_BASE + extra + vipSlots);
}
```

O parâmetro tem padrão 0, então todas as chamadas que já existem continuam valendo iguais.

## 7. Protocolo

Cliente → servidor, em `ClientMsg`:

- `VipBuy: "vipBuy"` — `{ pass: string }`
- `VipClaim: "vipClaim"` — sem corpo, abre o baú do dia

Servidor → cliente, em `ServerMsg`, só para o dono:

- `Vip: "vip"`

```ts
export interface VipEvent {
  tier: string;      // "" = não é VIP
  untilMs: number;   // 0 = não é VIP
  tiers: VipTier[];  // para a tela montar a comparação
  passes: VipPass[];
  chestReady: boolean;
}
```

O saldo de diamantes não vem aqui: já vem em `ProfileEvent`, e repetir número de dinheiro em
dois lugares é como eles divergem.

A compra entra na fila `enqueue(player, …)`, igual `handleBuy`, e desconta com o mesmo padrão
atômico de `purchaseItem`:

```ts
.update(accounts).set({ diamonds: sql`${accounts.diamonds} - ${preco}` })
.where(and(eq(accounts.id, contaId), gte(accounts.diamonds, preco)))
.returning({ diamonds: accounts.diamonds })
```

Nenhuma linha devolvida significa saldo insuficiente, sem ler antes de escrever e sem corrida.

O baú usa `checkinDayKey(agora, offsetHours)` do check-in, com o **mesmo** `offsetHours`, para
os dois presentes diários virarem na mesma hora. Dois cliques no mesmo dia: o segundo é
recusado. Depois da hora de virada: liberado.

## 8. Arquivos

Cada um segue um molde que já existe no repositório:

```
packages/shared/src/vip.ts          tipos, padrão de fábrica, upgradeDays, vipRank
packages/server/src/db/schema.ts    três tabelas novas + duas colunas em accounts
packages/server/src/vip.ts          carrega, semeia uma vez, recarrega   (molde: checkin.ts)
packages/server/src/repository.ts   purchaseVip, claimVipChest           (molde: purchaseItem)
packages/server/src/adminVipApi.ts  CRUD de degraus e passes             (molde: adminCheckinApi.ts)
packages/server/src/live.ts         pushVip()                            (molde: pushCheckin)
packages/server/src/WorldRoom.ts    handleVipBuy, handleVipClaim, os ganchos da seção 5
packages/client/src/vip.ts          painel do jogador                   (molde: checkin.ts, shop.ts)
packages/client/src/admin/vip.ts    duas listas + quantos VIPs ativos   (molde: admin/checkin.ts)
```

## 9. Guarda-corpos legais

- O passe é **licença por prazo**. A tela diz a data e a hora em que termina **antes** do
  clique, não depois.
- A compra tem **dois cliques**: o segundo mostra o que sai da conta e o que entra.
- O baú VIP tem **conteúdo fixo**, definido no painel, de propósito. Prêmio aleatório pago é
  caixa de recompensa, e caixa de recompensa é a discussão de loteria que não queremos comprar.
- Subir de degrau nunca queima saldo (seção 4), e o painel registra cada compra em `purchases`,
  então há trilha para responder a qualquer reclamação.

## 10. O gancho para os quatro benefícios que faltam

`vipTiers` ganha as colunas quando cada sistema existir, e a única coisa que muda no VIP é a
tela de comparação. O ponto de leitura é sempre o mesmo: `vipTierOf(player)` devolve a linha do
degrau, e quem precisa do número lê a coluna dali.

| Sistema futuro | Coluna que ele acrescenta |
|---|---|
| Coleta offline | `offlineHours` |
| Auto-caça | `autoHuntMinutes` (0 = ilimitado) |
| Refino | `refineStonesDaily` |
| Teleporte | `freeTeleport` |

## 11. Como provamos que funciona

O repositório **não tem nenhum teste** hoje; `npm run typecheck` é o único portão. A conta da
seção 4 mexe com diamante de quem pagou, e errar ali é tirar dinheiro do jogador sem ele ver.
Então este spec traz o **primeiro teste do repositório**, com o `node --test` que já vem no
Node — nenhuma dependência nova, um arquivo só (`packages/shared/src/vip.test.ts`), sobre as funções
puras de `shared/vip.ts` e sobre a correção da seção 6 em `shared/items.ts`:

- subir de Ouro para Diamante não perde saldo, e o exemplo dos 34 dias fecha
- descer de degrau é recusado enquanto o maior vale
- comprar o mesmo degrau soma dias, e somar sobre um VIP vencido parte de agora
- `vipRank` vira 0 no primeiro milissegundo depois do vencimento
- `bagCapacity` com 40 espaços de VIP **e** a maior bolsa equipada devolve mais que 60

Além disso, no jogo local: comprar cada passe, conferir o desconto de diamante, ver o nome
colorido a partir de um segundo personagem, abrir o baú duas vezes no mesmo dia, e deixar um
VIP vencer para ver o aviso no chat.
