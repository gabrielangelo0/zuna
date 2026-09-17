# Plano do Jogo — Zuna

> **Seu personagem, sua jornada!** Explore, evolua, conquiste e viva um mundo repleto de aventuras. No ar em https://zuna.devfly.net.

> **Versão 4.** Direção: foco em receita, progressão paga (pay-to-progress), nível ilimitado, equipamento com teto máximo e XP estilo Tibia (cada monstro dá uma quantidade fixa de XP). O protótipo técnico (fase 0) está em `packages/` e já tem contas, personagens salvos em banco e customização com roupas, mascotes e montarias.

---

## 1. Visão

**Pitch:** um MMORPG isométrico no navegador que junta a caçada do Tibia com a progressão sem fim dos MMOs asiáticos. O nível é ilimitado, o equipamento pode ser refinado até o máximo e o poder de cada jogador fica visível para o servidor inteiro. Jogar é grátis; quem paga cresce muito mais rápido e domina os rankings.

### Pilares

1. **Progresso sem fim.** Sempre existe um próximo nível, um próximo +1 e uma próxima posição no ranking.
2. **Poder visível.** Número de poder acima da cabeça, brilho de refino, asas, auras e anúncios para o servidor inteiro.
3. **Pagar acelera e coloca no topo.** O free evolui devagar e forma a população; quem paga sobe rápido e lidera.
4. **Lindo e fluido.** Visual HD, efeitos de luz e partículas, 60 fps e sem lag.
5. **Abriu, jogou.** Do link ao primeiro monstro morto em menos de 60 segundos.

---

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Plataforma | Web (navegador), instalável como PWA e jogável no celular |
| Equipe | Solo dev |
| Visual | 2D HD isométrico |
| Multiplayer | Híbrido: cidades e mapas compartilhados + instâncias (boss pessoal, torre, dungeon) |
| Monetização | Progressão paga: loja de equipamentos, materiais e aceleradores + VIP por assinatura + nível de Patrono |
| Nível | **Ilimitado** |
| Equipamento | Evolui até um **máximo** (qualidade Mítico, refino +20, gemas nível 10) |
| Meta | Lançar com loja em ~6–7 meses |

### Choque de realidade

- **Parede suave, não dura.** O free precisa evoluir sempre, mesmo que devagar. Se ele sai, quem paga fica sem público para dominar e sai também. O plano inteiro segue essa regra.
- **Receita = tráfego × conversão × gasto médio.** Um jogo ótimo sem jogadores não fatura. Reserve orçamento para anúncios e parcerias com streamers (Tibia, MU e OTServ têm público enorme no Brasil, já acostumado com "servidor com donate").
- **Sistemas numéricos são baratos; conteúdo é caro.** Refino, gemas, VIP, ranking e torre infinita dão profundidade e receita com pouca arte nova. É isso que viabiliza lançar rápido sozinho.

---

## 3. Loops de jogo

```
CURTO (30 s – 2 min)   Caçar → loot + XP → barra enchendo → Poder subindo
        ↓
MÉDIO (20 – 60 min)    Missões diárias, boss, torre → materiais → refinar / encaixar gemas → Poder sobe
        ↓
LONGO (semanas)        Nível infinito, +20 em tudo, ranking, temporadas, novos sets a cada 50 níveis

LOOP DE GASTO          Trava num desafio (boss, andar da torre, arena, ranking)
                         → aparece a oferta certa naquele momento
                         → compra → Poder sobe NA HORA, com animação
                         → passa o desafio → próximo desafio
```

---

## 4. Progressão e fontes de poder

### 4.1 Poder de Combate (PC)

Um número único que resume a força do personagem: nível, atributos, equipamento, refino, gemas, montaria, asas e títulos.

- Aparece **acima da cabeça**, no perfil e no ranking.
- Toda melhoria mostra uma animação de **"+1.250 PODER"** subindo, com som.
- Mapas, bosses e andares da torre mostram o **PC recomendado**. Quando o jogador está abaixo, a oferta aparece.
- É calculado **sempre no servidor**.

### 4.2 Nível ilimitado

- **Sem teto de nível.**
- **5 pontos de atributo por nível** (Força, Agilidade, Inteligência, Vitalidade), com botão de distribuição automática. O público de MU e OTServ adora distribuir pontos.
- **Marcos a cada 10 níveis:** nova skill ou melhoria de skill, novo mapa, título ou baú de recompensa.
- **Novos sets de equipamento a cada 50 níveis** (50, 100, 150, …). Isso cria compra recorrente.

**XP estilo Tibia: cada monstro dá uma quantidade fixa de experiência.** Quando vários jogadores batem no mesmo monstro, a XP é dividida pelo dano que cada um causou.

| Monstro | Vida | XP |
|---|---|---|
| Slime Rosa | 20 | 5 |
| Cogumelo | 25 | 10 |
| Lobo | 40 | 20 |
| Orc | 80 | 35 |
| Yeti | 120 | 50 |
| Demônio | 300 | 150 |
| Senhor Esqueleto (chefe da Invasão) | 650 | 450 |

**Curva de XP** (cúbica, a mesma forma do Tibia; implementada em `packages/shared/src/xp.ts`):

```
XP total para o nível N = 50/3 × (N³ − 6N² + 17N − 12)
```

Nível 2 = 100 XP · nível 10 = 9.300 · nível 50 ≈ 1,8 milhão · nível 100 ≈ 15,7 milhões.

- A velocidade geral é ajustada pela **rate** do servidor (`XP_RATE`), como nos OTServs.
- XP em Dobro, poções de XP e VIP multiplicam a XP que cada monstro dá.
- **XP só vem de matar monstros** (e de recompensas de missão e evento).

**Tempos-alvo com rate 1** (validar no alfa): nível 8 em ~30–40 min; nível 20 em algumas horas; nível 50 em semanas. Depois disso, cada nível exige caçadas longas em áreas perigosas, e é aí que VIP e poções de XP mais pesam.

### 4.3 Equipamento

**8 slots:** arma, elmo, armadura, calça, bota, escudo/secundária, anel e amuleto.

**Qualidade** (teto: Mítico):

| Qualidade | Cor | Como consegue |
|---|---|---|
| Comum / Incomum / Raro | Branco / Verde / Azul | Drops normais |
| Épico | Roxo | Bosses e torre |
| Lendário | Laranja | Boss mundial (raro) **ou set completo na loja** |
| Mítico | Vermelho | 100 fragmentos (boss mundial + loja), com fabricação garantida |

**Refino** (teto: +20). **Refino e gemas ficam no slot, não no item**: trocar de equipamento não perde o investimento, então o jogador não tem medo de gastar.

| Faixa | Custo | Sucesso | Visual |
|---|---|---|---|
| +1 a +5 | Ouro | 100% | — |
| +6 a +10 | Ouro + Pedra de Refino | 100% | Brilho azul em +7, roxo em +10 |
| +11 a +15 | Muitas Pedras de Refino | 100% | Brilho laranja em +15 + **anúncio no servidor** |
| +16 a +20 | Pedra Celestial (quase só loja, VIP e eventos) | 100% | Aura animada vermelho-dourada + **anúncio no servidor** |

Os bônus de conjunto em +10, +15 e +20 (todos os slots nesse nível) são outro gatilho forte de compra.

### 4.4 Outras fontes de poder

Cada sistema tem teto e é uma fonte de receita separada.

| Sistema | Teto | Como o free evolui | Como o pagante acelera | Quando entra |
|---|---|---|---|---|
| Pontos de atributo | Ilimitado | Subindo de nível | Poções de XP, VIP | Lançamento |
| Gemas (2 por slot) | Nível 10 | Drops + fusão (3 iguais → 1 acima) | Pacotes de gemas | Lançamento |
| Títulos com atributos | — | Conquistas | VIP, Patrono, topo do ranking | Lançamento |
| Montaria com atributos | 10 estrelas | Montaria básica (missão no nível 30) | Montarias premium + comida de montaria | Atualização 1 (✅ versão simples no protótipo) |
| Asas | Estágio 10 | Evento raro | Loja, Patrono | Atualização 1 |
| Pet | Nível 10 | Pet básico (login dia 7) | Pets raros (coletam ouro automaticamente) | Atualização 2 (✅ versão simples no protótipo) |

### 4.5 Conteúdo sem fim (necessário com nível ilimitado)

- **Torre Infinita:** andares com monstros cada vez mais fortes, gerados a partir dos mesmos assets. Tem ranking de andar máximo e recompensas por marco. É conteúdo infinito e barato.
- **Boss pessoal diário:** instância solo com entradas limitadas por dia (VIP tem mais; entradas extras na loja). Principal fonte de materiais.
- **Boss mundial** em horários fixos (12h, 19h, 22h, horário de Brasília): evento social que dá fragmentos Míticos para quem mais causa dano.
- **Mapas novos** a cada 50 níveis, reaproveitando tiles com variação de cor e iluminação.

### 4.6 Auto-caça e caçada offline

- **Auto-caça:** com a aba aberta, o personagem caça sozinho no mapa. O free tem 1h por dia; o VIP tem uso ilimitado.
- **Coleta offline:** o servidor calcula **ouro e materiais** (não XP, que só vem de matar monstros) pelo tempo fora, pelo poder e pelo mapa desbloqueado, usando uma fórmula e sem simular o personagem. Teto de 8h para o free, 12h no VIP Ouro e 24h no VIP Diamante.
- Ao entrar, o jogador abre um **baú com animação** mostrando tudo o que ganhou. Isso traz a pessoa de volta todo dia.
- Bônus: a auto-caça oficial reduz muito o incentivo a usar bot.

### 4.7 Morte

- Perde uma % do XP do nível atual (**nunca desce de nível**) e não perde itens.
- O VIP Ouro perde metade; o VIP Diamante não perde nada.
- **Amuleto de Proteção** (loja): a próxima morte não tira XP.
- **Ressurreição no local** (loja): volta na hora, sem caminhar do templo.

### 4.8 Eventos

| Evento | Como funciona | Status |
|---|---|---|
| **XP em Dobro** | 10 min (ou um fim de semana) com toda XP de monstro em dobro, anunciado para o servidor | ✅ No protótipo |
| **Invasão** | Hordas atacam os arredores da cidade em ondas, com anúncios progressivos e um chefe no final | ✅ No protótipo (Invasão Orc) |
| **Boss mundial** | Horários fixos; recompensa proporcional ao dano causado | Fase 3 |
| **Sazonais** | Carnaval, Festa Junina, Halloween e Natal: monstros, missões e visuais temáticos, com pacotes na loja | Pós-lançamento |
| **Loot em dobro / respawn rápido** | Variações do mesmo sistema de eventos | Pós-lançamento |

No protótipo, um evento aleatório dispara a cada 20 min (`EVENT_INTERVAL_MIN`), e dá para iniciar pelo chat com `/evento xp` e `/evento invasao`.

---

## 5. Combate e classes

### 5.1 Combate

- **Movimento em grid** (tiles isométricos, 8 direções): clique para andar (A\*) + WASD.
- **Auto-ataque no alvo** + **4 a 6 skills** com cooldown (teclas 1–6).
- **Bosses com áreas de aviso** no chão: a habilidade está no posicionamento.
- **Servidor a ~10 ticks/s**, com o cliente interpolando.
- Funciona bem com lag de navegador, facilita o anti-cheat e é simples de programar sozinho.

### 5.2 Classes (3 no lançamento)

| Classe | Papel | Destaques |
|---|---|---|
| **Guardião** | Tank / corpo a corpo | Provocar, escudo, dano em área curta |
| **Caçador** | Dano à distância | Dano alto em alvo único, armadilhas |
| **Arcanista** | Mago / suporte | Dano em área, cura em grupo, controle |

A 4ª classe entra numa atualização futura, com evento e pacote de lançamento.

---

## 6. Social, PvP e rankings

- **Chat:** local, global (com cooldown), party e privado.
- **Anúncios globais:** refino +15/+20, drop Mítico, novo nº 1 do ranking, jogador Patrono entrando no jogo. Criam desejo e pressão social.
- **Party de até 4**, com XP compartilhada e bônus por membro.
- **Rankings:** Poder, Nível, Andar da Torre e Arena, com recompensas semanais para o topo.
- **Arena assíncrona (lançamento):** o jogador enfrenta uma cópia controlada pela IA do personagem de outro jogador. Sem lag, sem griefing, fácil de construir, e mostra na prática a vantagem de quem investiu. Tem ranking semanal.
- **Depois do lançamento:**
  - **Guildas + Guerra de Castelo semanal.** É o maior motor de gasto dos grandes pagantes em MMOs desse tipo: a guilda que domina o castelo ganha título, imposto e visual exclusivo.
  - **Zona PvP** com loot melhor (risco × recompensa).
  - **Servidores novos periódicos:** todo mundo começa do zero, os grandes pagantes correm de novo pelo topo e o gasto dá um pico. Servidores vazios são fundidos.
- **Moderação:** reportar, silenciar, filtro de palavras e banimento pelo painel admin.

---

## 7. Retenção: o que faz viciar

### 7.1 Sistemas

| Sistema | Frequência | Função |
|---|---|---|
| Baú da coleta offline | Diária | Motivo para abrir o jogo todo dia |
| Login de 7 e 30 dias | Diária | Dia 7: pet; dia 30: montaria |
| Missões diárias → pontos de atividade → baús | Diária | Meta clara de 20–30 min |
| Boss pessoal (entradas diárias) | Diária | Materiais de refino |
| Boss mundial com horário | 3x por dia | Encontro social |
| Arena e ranking com recompensa semanal | Semanal | Competição |
| Evento semanal de recarga acumulada | Semanal | Pico de receita |
| Temporada com passe (8 semanas) | Sazonal | Novidade + receita |
| Anúncios globais | Contínua | Desejo e comparação social |
| Notificações Web Push | Gatilhos | "Coleta offline cheia", "Boss mundial em 10 min", "Suas entradas de boss renovaram" |

**Curva dos primeiros 30 minutos:** o jogador sobe do nível 1 ao 20 rápido, ganha itens bons e se sente poderoso. A primeira parede suave (um boss no nível ~25) aparece **junto com a oferta de primeira recarga**.

### 7.2 Game feel: cada ação precisa "dar gosto"

- [ ] Números de dano flutuando (crítico maior, amarelo e com tremor)
- [ ] Hit-stop de 50–80 ms no crítico e tremida leve de tela
- [ ] Monstro pisca branco ao tomar dano, com recuo leve
- [x] Loot cai do monstro com brilho por qualidade e é coletado ao passar por cima (falta o som de moedas)
- [ ] Barra de XP sempre visível, subindo a cada kill
- [ ] Level up com coluna de luz visível para todos + som
- [ ] **"+PODER" subindo** a cada refino, gema ou compra, com som e brilho
- [ ] Refino com animação de martelo e faíscas; o brilho novo aparece na hora no personagem
- [ ] Som único para cada qualidade de drop
- [ ] Resposta visual em menos de 100 ms após o clique

---

## 8. Monetização

### 8.1 Moedas

| Moeda | Como obtém | Uso |
|---|---|---|
| **Ouro** | Jogando | Refino baixo, reparo, poções, teleporte |
| **Diamantes** | Compra com dinheiro real | Loja completa |
| **Diamantes vinculados** | Missões, eventos, login, passe grátis | Parte da loja, sem troca entre jogadores. Dá ao free o gosto de "comprar" |

### 8.2 Pacotes de diamantes

| Preço | Diamantes | Bônus |
|---|---|---|
| R$ 4,90 | 50 | — |
| R$ 9,90 | 105 | +5% |
| R$ 24,90 | 275 | +10% |
| R$ 49,90 | 575 | +15% |
| R$ 99,90 | 1.200 | +20% |
| R$ 249,90 | 3.100 | +24% |
| R$ 499,90 | 6.500 | +30% |

**Pix é obrigatório.** Os preços são ponto de partida: testar e ajustar com dados.

### 8.3 Ofertas de maior conversão

1. **Primeira recarga (qualquer valor):** diamantes em dobro + arma exclusiva com brilho, forte até o nível ~80. É a oferta que mais converte o primeiro pagamento.
2. **Fundo de Crescimento (R$ 39,90, compra única):** devolve ~10x o valor em diamantes ao atingir os níveis 30, 50, 80, 100, 150 e 200. Converte e também retém.
3. **Ofertas por gatilho (24h):** travou num andar da torre → pacote de pedras; perdeu 3x para o boss → pacote de poder; chegou ao nível 100 → pacote do marco.
4. **Oferta diária (R$ 4,90):** um pacote pequeno e barato todo dia.
5. **Recarga acumulada semanal:** quem soma R$ 50 / 100 / 300 no evento ganha recompensas extras em cada faixa.

### 8.4 VIP (assinatura mensal)

| Benefício | Grátis | **VIP Ouro** R$ 24,90/mês | **VIP Diamante** R$ 59,90/mês |
|---|---|---|---|
| Bônus de XP | — | +50% | +100% |
| Coleta offline máxima | 8h | 12h | 24h |
| Auto-caça | 1h/dia | Ilimitada | Ilimitada |
| Entradas de boss pessoal | 2/dia | 3/dia | 5/dia |
| Perda de XP ao morrer | Normal | −50% | Nenhuma |
| Pedras de Refino diárias | — | 5 | 15 |
| Teleporte | Pago em ouro | Grátis | Grátis |
| Extras | — | Baú VIP diário, nome colorido | Tudo do Ouro + título com atributos + montaria exclusiva |

### 8.5 Patrono (VIP permanente por total gasto)

Recompensa quem mais gasta, para sempre, e acumula com a assinatura.

| Nível | Total gasto | Recompensa permanente (exemplos) |
|---|---|---|
| 1 | R$ 30 | +2% de ataque, moldura no chat |
| 3 | R$ 250 | Asas de Patrono + 1 entrada extra de boss por dia |
| 5 | R$ 1.000 | Montaria exclusiva + 5% de XP permanente |
| 7 | R$ 3.500 | Aura exclusiva + atributos extras |
| 10 | R$ 10.000 | Título único, efeito visual raro e **anúncio no servidor ao entrar no jogo** |

### 8.6 Loja (diamantes)

| Categoria | Produtos |
|---|---|
| Equipamento | Sets Lendários por faixa de nível (50, 100, 150, …), fragmentos Míticos |
| Materiais | Pedras de Refino, Pedras Celestiais, pacotes de gemas |
| Aceleradores | Poção de XP (+100% por 1h), tickets de auto-caça, entradas extras de boss |
| Proteção | Amuleto de Proteção, ressurreição no local |
| Poder visual | Asas, auras, montarias e pets, **todos com atributos** |
| Conveniência | Inventário extra, teleporte, troca de nome e visual |

### 8.7 Passe de temporada (8 semanas, 50 níveis)

- **Trilha grátis:** diamantes vinculados, pedras e poções.
- **Trilha premium (R$ 29,90):** Pedras Celestiais, gemas altas e um visual com atributos no nível 50. As recompensas premium aparecem **bloqueadas** ao lado das grátis.

### 8.8 Até onde o free chega (a parede suave)

- Sobe de nível sem limite, só que ~2,5–3x mais devagar que o VIP Diamante.
- Refina até ~+12/+15 com tempo. De +16 a +20, na prática, só pagando.
- Chega a Lendário com sorte em boss; Mítico é muito lento sem loja.
- Compete no ranking de nível no início do servidor. O ranking de Poder fica com os pagantes.
- Ganha diamantes vinculados suficientes para experimentar a loja e querer mais.

### 8.9 Regras que protegem o negócio

Não são opcionais: evitam processo, multa e estorno.

1. **Tudo que é pago tem resultado garantido.** Nada de caixa aleatória paga, roleta paga ou refino pago com chance de falha. O **ECA Digital (Lei 15.211/2025)** proíbe caixas de recompensa pagas em jogos com acesso provável de crianças e adolescentes.
2. **Preço "de/por" só se o preço anterior existiu de verdade**, e oferta com prazo precisa expirar de fato. O CDC pune propaganda enganosa.
3. **Assinatura VIP cancelável em poucos cliques**, com aviso antes da renovação.
4. **Limite mensal de gasto para contas de menores** + confirmação de compra. Reduz estornos de pais (o chargeback devolve o dinheiro e ainda cobra taxa) e o risco jurídico. O ECA Digital também traz outras obrigações para serviços acessados por menores.
5. **LGPD:** política de privacidade, consentimento e exclusão de conta. Também termos de uso e classificação indicativa.
6. **Nada de nomes, sprites, mapas ou marcas do Tibia** (propriedade da CipSoft).
7. **CNPJ e contador antes da primeira venda.**

> Validar tudo com um advogado de direito digital e games antes de abrir a loja.

### 8.10 Conta de exemplo (ilustrativa, não é previsão)

| | Valor |
|---|---|
| Jogadores ativos no mês | 5.000 |
| Pagantes (5%) | 250 |
| Gasto médio por pagante | R$ 90 |
| **Receita bruta** | **R$ 22.500/mês** |
| Taxas de pagamento + impostos + servidor | ~20–25% |
| Anúncios | Variável: só escalar quando o LTV do jogador passar o custo por jogador trazido |

---

## 9. Arte: lindo de verdade

### 9.1 Pipeline (solo dev)

**Já implementado** (`packages/baker`, detalhes no README):

1. **Modelos 3D CC0** consistentes: KayKit (heróis, esqueletos, construções) e Quaternius (monstros, animais, natureza), com as animações que já vêm nos pacotes.
2. **three.js dentro do Chrome headless** (sem Blender) com câmera ortográfica a 30° renderiza **5 direções** (+3 espelhadas) de cada animação e monta os atlas. Um comando gera tudo: `npm run bake`.
3. Mesma luz (principal, contorno e preenchimento), sombra suave, contorno escuro e supersampling ×3 em tudo: o visual fica coeso mesmo misturando pacotes.
4. **Roupas tingíveis:** as partes de pele, cabelo e roupa viram cinza + mapa de grupos; o cliente aplica as cores de cada jogador.
5. **Montarias:** ponto da sela por quadro e camada "frente" para a cabeça do animal cobrir o cavaleiro.

**Próximos passos da arte:**

- Chão com transições suaves entre terrenos (hoje ainda é desenhado por código) e construções na cidade.
- Sprites em 2× para zoom e telas de alta densidade (hoje são 1×; o zoom máximo é 1,6×).
- Montaria voadora com pose própria (o Dragão Rubro é um modelo em pé, inclinado).
- **Normal maps** para iluminação dinâmica em 2D e pacotes premium para ampliar o catálogo.

### 9.2 O poder tem que aparecer

O personagem é montado em **camadas**, e quem pagou precisa ser reconhecido de longe:

```
Montaria → Corpo (outfit) → Arma (muda com o item) → Brilho do refino → Asas → Aura → Pet
```

A armadura não muda o visual (o corpo vem do outfit). Isso reduz muito o trabalho de arte, e as camadas que chamam atenção (arma, brilho, asas, aura, montaria) são exatamente as que vendem.

### 9.3 Polimento visual

- **Iluminação dinâmica:** tochas, magias e drops iluminando o chão
- **Bloom e glow** (WebGL) em magias, itens raros e refino alto
- **Partículas:** faíscas, poeira ao andar, folhas caindo, magias
- **Ciclo dia/noite e clima** (chuva, neblina, neve) por mapa
- **Sombras projetadas** e água animada
- **UI caprichada:** animações suaves, ícones de qualidade, som em todo clique
- **60 fps em notebook comum**, com mapas carregados sob demanda

### 9.4 Onde investir dinheiro

- **Antes do lançamento:** packs premium consistentes + freelancer para logo, UI, ícones e arte de divulgação.
- **Depois da receita:** artista fixo para montarias, asas, auras e outfits, que são o que vende.

### 9.5 Customização (já no protótipo)

Tudo o que é comprado fica na **conta** (vale para todos os personagens) e tem resultado garantido.

| Camada | Como funciona | Grátis | Pago |
|---|---|---|---|
| Aparência | 7 tons de pele e 8 cores de cabelo | Tudo | — |
| Roupa | Cada roupa é um modelo; 3 cores por roupa (principal, secundária e detalhes), como no Tibia | Aventureiro, Guerreiro, Caçador | Mago Arcano (ouro); Cavaleiro Real, Assassino Sombrio e Necromante (diamantes) |
| Mascote | Segue o dono, ao lado; os voadores flutuam | — | Gato Tigrado e Galinha (ouro); Mago Mirim, Dragãozinho e Fantasminha (diamantes). Bônus de 3% a 10% de XP e/ou ouro |
| Montaria | Tecla `M` monta e desmonta | — | Cavalo (ouro, +25% de velocidade); Cavalo Branco, Lobo das Neves, Cervo Real e Dragão Rubro (diamantes, +33% a +67% de velocidade, com bônus extras) |

- O guarda-roupa (tecla `O`) permite **experimentar** qualquer item antes de comprar.
- Catálogo e preços são dados em `packages/shared/src/cosmetics.ts`, fáceis de balancear.
- Cada compra é **uma transação no banco**: debita o saldo, desbloqueia o item e registra em `purchases`, ou não faz nada.
- Falta: comprar diamantes com dinheiro real (fase 2), estrelas e atributos de combate nas montarias, nível nos mascotes, asas e auras.

---

## 10. Arquitetura técnica

### 10.1 Stack

| Camada | Tecnologia | Por quê |
|---|---|---|
| Linguagem | **TypeScript** (cliente e servidor) | Uma linguagem só, fórmulas e dados compartilhados |
| Renderização | **Phaser** (WebGL) | Leve na web, mapas isométricos do Tiled, luzes e efeitos |
| Interface | **HTML/CSS** sobre o canvas (React opcional) | Loja, inventário e menus muito mais fáceis |
| Mapas | **Tiled** (isométrico) | Editor gratuito que exporta JSON |
| Servidor de jogo | **Colyseus** (Node.js) | Multiplayer autoritativo com rooms: cidade, mapa, boss e torre |
| API | Rotas HTTP no mesmo servidor Node | Contas, loja, pagamentos e rankings num processo só no começo |
| Banco | **PostgreSQL** + **Drizzle** (PGlite embutido no desenvolvimento) | Transações para ouro, itens e compras; roda local sem instalar nada |
| Cache | **Redis** | Só quando precisar escalar |
| Login | E-mail/senha + Google + Discord (no protótipo: usuário e senha, sessão por token) | Menos atrito |
| Pagamentos | **Mercado Pago** ou **Stripe** (Pix + cartão + assinatura) | Entrega só via webhook confirmado |
| Painel admin | App web interno | Ofertas, eventos, anúncios, receita e banimentos sem deploy |
| Notificações | **PWA + Web Push** | Traz o jogador de volta |
| Analytics | **PostHog** | Funis, retenção e conversão |
| Erros | **Sentry** | Erros do cliente e do servidor |
| Hospedagem | VPS em **São Paulo** + Cloudflare | Latência baixa no Brasil e custo inicial baixo |

### 10.2 Diagrama

```
 ┌────────────────────────────────┐        ┌──────────────────┐
 │  Navegador / PWA               │        │  Painel Admin    │
 │  Phaser (mundo) + HTML (UI)    │        │  ofertas, eventos│
 └──────┬──────────────────┬──────┘        └────────┬─────────┘
        │ WebSocket        │ HTTPS                  │
        ▼                  ▼                        ▼
 ┌─────────────────────────────────────────────────────────────┐
 │  Servidor Node.js                                           │
 │  ├─ Colyseus Rooms: Cidade · Mapa · BossPessoal · Torre     │
 │  ├─ Poder de Combate · Caçada offline · Arena assíncrona    │
 │  └─ API: contas, loja, VIP, rankings, anúncios              │
 └──────┬──────────────────────────────┬───────────────────────┘
        ▼                              ▼
   PostgreSQL                  Mercado Pago / Stripe
   (+ Redis depois)            webhook → entrega em transação
```

### 10.3 Princípios inegociáveis

1. **Servidor autoritativo.** O cliente só envia intenções. Dano, loot, ouro, poder e posição são decididos no servidor.
2. **Conteúdo e ofertas como dados** (JSON / painel admin), para balancear e criar promoções sem mexer em código.
3. **Compras à prova de erro:** webhook idempotente (o mesmo aviso recebido duas vezes não entrega duas vezes), entrega em transação, registro de toda compra e estorno que remove o que foi entregue.
4. **Toda operação de ouro, diamante e item em transação no banco**, com log. Duplicação de itens destrói a economia e a receita.
5. **Área de interesse:** cada jogador só recebe o que está perto.
6. **Nível ilimitado gera números enormes:** XP em `BIGINT` e formatação amigável (1,2 mi / 3,4 bi).

### 10.4 Estrutura do repositório

```
game/
├─ packages/
│  ├─ shared/    # tipos, fórmulas (XP, poder, refino), constantes
│  ├─ client/    # Phaser + UI
│  ├─ server/    # Colyseus rooms, lógica de jogo, API, pagamentos
│  └─ admin/     # painel interno
├─ content/      # JSON: itens, monstros, loot, skills, ofertas + mapas do Tiled
├─ tools/        # scripts (render de sprites no Blender)
└─ docs/
```

### 10.5 Armadilhas conhecidas

- **Ordenação de profundidade isométrica:** ordenar pela posição Y do "pé". Resolver no protótipo.
- **Tamanho do download:** atlas, compressão e carregamento por mapa. Meta: menos de 15 MB iniciais.
- **Camadas do personagem** (montaria, asas, aura) multiplicam sprites: definir o formato cedo.

---

## 11. MVP de lançamento

**Entra:**
- 3 classes, **nível ilimitado**, pontos de atributo
- 1 cidade + 4 mapas de caça + Torre Infinita + boss pessoal + boss mundial
- 8 slots, 6 qualidades, refino +20, gemas, títulos, **Poder de Combate**
- Auto-caça, coleta offline, missões diárias, login de 7 e 30 dias
- Party, chat, anúncios globais, rankings, arena assíncrona
- **Loja completa:** diamantes, primeira recarga, VIP Ouro/Diamante, Patrono, Fundo de Crescimento, ofertas por gatilho, oferta diária
- Painel admin, PWA e Web Push

**Fica para as atualizações:** montarias e pets com estrelas, nível e atributos (a versão cosmética com bônus simples já existe), asas, guildas e guerra de castelo, zona PvP, mercado entre jogadores, 4ª classe, passe de temporada.

---

## 12. Roadmap

| Fase | Duração* | Entregas | Critério para avançar |
|---|---|---|---|
| **0 · Protótipo técnico** ✅ | 3–4 sem. | Feito: mapa isométrico no Phaser; andar por clique e WASD; multiplayer via Colyseus; 7 monstros com IA; combate; XP fixa por monstro; níveis; morte; chat; 2 magias; eventos XP em Dobro e Invasão; contas e personagens salvos em Postgres; criação de personagem; guarda-roupa e loja com roupas, mascotes e montarias | "É gostoso matar esse monstro?" |
| **1 · Core + progressão** | 8 sem. | Combate e skills das 3 classes; nível ilimitado + atributos; loot; 8 slots; refino; gemas; Poder de Combate; 1 cidade + 4 mapas | "Ver o Poder subir é viciante?" |
| **2 · Loja e VIP** | 5–6 sem. | Diamantes + Pix/cartão; primeira recarga; VIP; Patrono; Fundo de Crescimento; ofertas; painel admin | Compra real de ponta a ponta, sem erro de entrega |
| **3 · Social e endgame** | 6 sem. | Party; chat; anúncios; bosses; Torre Infinita; arena; rankings; auto-caça e offline; diárias; login; Web Push | Jogadores de teste voltam sozinhos no dia seguinte |
| **4 · Alpha com dinheiro real** | 3–4 sem. | 100–300 jogadores; medir conversão; balancear; corrigir exploits | Conversão ≥ 3% e nenhum bug de economia |
| **🚀 Lançamento** | **~6–7 meses** | | |

\* Estimativa com dedicação próxima de tempo integral. Em tempo parcial, conte com ~2x.

### Pós-lançamento (uma novidade a cada 2–4 semanas)

Cada atualização adiciona **uma nova fonte de poder, e portanto uma nova fonte de receita**:

1. Montarias → 2. Asas → 3. Pets → 4. Guildas + Guerra de Castelo → 5. Zona PvP → 6. Passe de temporada → 7. Novos sets a cada 50 níveis → 8. 4ª classe → 9. Servidores novos a cada ~2–3 meses

**Em paralelo desde a fase 0:** Discord, devlog semanal curto (TikTok, Shorts, Reels) e lista de espera. Na fase 4, parcerias com streamers de Tibia, MU e OTServ.

---

## 13. Métricas

| Métrica | Meta / uso |
|---|---|
| Tempo até o primeiro kill | < 60 s |
| Retenção D1 / D7 / D30 | ≥ 35% / ≥ 15% / ≥ 5% |
| Conversão (pagou ao menos 1x) | 3–8% |
| Primeira recarga até o dia 3 | Acompanhar e otimizar a oferta |
| ARPDAU (receita por jogador ativo no dia) | Acompanhar diariamente |
| ARPPU (gasto médio por pagante) | Acompanhar por faixa de Patrono |
| Assinaturas VIP ativas e cancelamentos | Mensal |
| LTV × custo por jogador (anúncios) | Só escalar anúncio com LTV maior que o custo |
| Onde travam | Nível, andar da torre, boss: é onde entram as ofertas por gatilho |

---

## 14. Riscos

| Risco | Mitigação |
|---|---|
| Free abandona na parede | Parede suave; o free sempre evolui; diamantes vinculados |
| Servidor vazio (pagante sem público) | Um servidor por vez; fusão; eventos com horário; anúncios |
| Lucro não vem rápido | Receita depende de tráfego: orçamento de anúncios, streamers, medir LTV antes de escalar |
| Problema jurídico | Regras da seção 8.9 + advogado |
| Estornos | Limite para menores, confirmação de compra, registro de tudo |
| Bug de entrega ou duplicação | Webhook idempotente, transações, logs |
| Inflação de poder | Tetos claros, novas fontes de poder em ritmo controlado |
| Cheats e bots | Servidor autoritativo; auto-caça oficial |
| Burnout solo | Fases curtas; painel admin para operar sem código |

---

## 15. Perguntas em aberto

1. **Ambientação:** fantasia clássica, dark fantasy ou **folclore brasileiro** (Curupira, Boitatá e Mula-sem-cabeça como bosses)?
2. **Nome do jogo.**
3. **Dedicação:** tempo integral ou parcial?
4. **Orçamento** para arte e anúncios.
5. **Experiência atual** com TypeScript, Node e game dev.
