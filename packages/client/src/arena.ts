import { fightDuration, type ArenaBlow, type ArenaDef, type ArenaEvent, type ArenaFightEvent, type ArenaLook, type ArenaOpponent } from "@zuna/shared";
import { element, formatNumber } from "./dom.ts";
import { LookPreview } from "./lookPreview.ts";

// Tela da arena (tecla B): escolher a praça, ver os adversários e assistir à luta.
//
// A luta já vem resolvida do servidor, golpe a golpe. Aqui não se decide nada: só se **anima**
// o que já aconteceu. É o que dá uma reprise sem lag e igual para todo mundo.

export interface ArenaHandlers {
  open(arena: string): void;
  fight(arena: string, characterId: number, dummyId: number, paid: boolean): void;
}

/** Quanto tempo a reprise deve durar na tela. A luta simulada é mais longa e roda acelerada. */
const REPLAY_MS = 7000;
/** Nunca mais lenta que isto: reprise em velocidade real de uma luta curta fica arrastada. */
const MIN_SPEED = 1.6;

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const appearanceOf = (look: ArenaLook) => ({
  skin: look.skin,
  hairColor: look.hairColor,
  outfit: look.outfit,
  primary: look.colorPrimary,
  secondary: look.colorSecondary,
  detail: look.colorDetail,
});

const vazio: ArenaEvent = {
  enabled: true, arenas: [], arena: "", opponents: [], me: null, rating: 0, wins: 0, losses: 0,
  entriesLeft: 0, entriesTotal: 0, entryPrice: 0, season: "", board: [], nextLevel: 0,
};

export class ArenaPanel {
  private readonly root = element("#arena");
  private readonly body = element("#arena-body");
  private readonly handlers: ArenaHandlers;
  private data: ArenaEvent = vazio;
  /** Confirmação em dois passos da entrada paga: o segundo clique é o que cobra. */
  private confirming = "";
  /** A reprise em andamento. Enquanto ela roda, a lista não é redesenhada por baixo dela. */
  private replay: { stop: () => void } | null = null;
  private pendingData: ArenaEvent | null = null;
  /** Posição dos números que sobem: alternada, para dois seguidos não virarem um número só. */
  private floatSeq = 0;

  constructor(handlers: ArenaHandlers) {
    this.handlers = handlers;
    element("#arena-close").addEventListener("click", () => this.close());
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  setData(data: ArenaEvent) {
    // Redesenhar a lista no meio da reprise apagaria a luta da tela. Guarda e aplica no fim.
    if (this.replay) {
      this.pendingData = data;
      return;
    }
    this.data = data;
    this.confirming = "";
    if (this.isOpen) this.draw();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    this.root.hidden = false;
    this.handlers.open(this.data.arena);
    this.draw();
  }

  close() {
    this.replay?.stop();
    this.replay = null;
    this.root.hidden = true;
  }

  // ------------------------------------------------------------ a lista

  private draw() {
    this.body.replaceChildren();
    if (!this.data.enabled) {
      this.body.append(make("p", "arena-empty", "A arena está fechada agora. Volte mais tarde."));
      return;
    }
    if (this.data.arenas.length === 0) {
      const texto = this.data.nextLevel > 0
        ? `A arena abre no nível ${this.data.nextLevel}. Você está no ${this.data.me?.level ?? 1}.`
        : "Nenhuma arena está aberta agora.";
      this.body.append(make("p", "arena-empty", texto));
      return;
    }

    // Abas das praças. Só aparecem quando há mais de uma: aba única é ruído.
    if (this.data.arenas.length > 1) {
      const abas = make("div", "arena-tabs");
      for (const arena of this.data.arenas) {
        const aba = make("button", arena.id === this.data.arena ? "arena-tab is-on" : "arena-tab", arena.name);
        aba.type = "button";
        aba.addEventListener("click", () => this.handlers.open(arena.id));
        abas.append(aba);
      }
      this.body.append(abas);
    }

    const arena = this.data.arenas.find((a) => a.id === this.data.arena);
    if (arena?.description) this.body.append(make("p", "arena-hint", arena.description));

    this.body.append(this.statusBar(arena));
    this.body.append(this.opponentList(arena));
    if (this.data.board.length > 0) this.body.append(this.boardTable());
  }

  private statusBar(arena: ArenaDef | undefined): HTMLElement {
    const linha = make("div", "arena-status");
    linha.append(this.chip("Pontos", formatNumber(this.data.rating), "arena-chip-rating"));
    linha.append(this.chip("Vitórias", `${this.data.wins}V · ${this.data.losses}D`));
    const entradas = `${this.data.entriesLeft} de ${this.data.entriesTotal}`;
    linha.append(this.chip("Entradas hoje", entradas, this.data.entriesLeft === 0 ? "arena-chip-out" : ""));
    if (this.data.season) linha.append(this.chip("Temporada", this.data.season));
    return linha;
  }

  private chip(rotulo: string, valor: string, extra = ""): HTMLElement {
    const chip = make("div", `arena-chip ${extra}`.trim());
    chip.append(make("small", "", rotulo), make("strong", "", valor));
    return chip;
  }

  private opponentList(arena: ArenaDef | undefined): HTMLElement {
    const caixa = make("div", "arena-list");
    if (this.data.opponents.length === 0) {
      caixa.append(make("p", "arena-empty", "Nenhum adversário nesta faixa ainda."));
      return caixa;
    }
    const meuPoder = this.data.me?.power ?? 0;
    for (const alvo of this.data.opponents) {
      caixa.append(this.opponentCard(alvo, meuPoder, arena));
    }
    return caixa;
  }

  private opponentCard(alvo: ArenaOpponent, meuPoder: number, arena: ArenaDef | undefined): HTMLElement {
    const card = make("div", "arena-card");
    const canvas = make("canvas", "arena-face");
    canvas.width = 72;
    canvas.height = 96;
    // footY deixa espaço abaixo de propósito: o LookPreview encolhe a escala para caber o que o
    // sprite passa da linha do pé, e footY colado no fundo colapsa o boneco. Medido: 92 num
    // canvas de 96 dava 5 px de altura.
    new LookPreview(canvas, { dir: "SE", scale: 1.1, footY: 74, animate: false }).set({ appearance: appearanceOf(alvo.look) });

    const nome = make("div", "arena-card-name");
    nome.append(make("strong", "", alvo.name));
    if (alvo.dummyId > 0) {
      // Dizer que é manequim, e que não vale pontos, evita a reclamação de ranking parado.
      nome.append(make("span", "arena-tag", "treino"));
    }
    const detalhe = alvo.dummyId > 0
      ? `Nível ${alvo.level}${alvo.vocation ? ` · ${alvo.vocation}` : ""} · não vale pontos`
      : `Nível ${alvo.level}${alvo.vocation ? ` · ${alvo.vocation}` : ""} · ${formatNumber(alvo.rating)} pontos`;

    // A comparação de poder é a razão de o jogador comprar equipamento: ela fica em destaque.
    const delta = meuPoder > 0 ? Math.round(((alvo.power - meuPoder) / meuPoder) * 100) : 0;
    const classe = delta <= -10 ? "arena-power is-weak" : delta >= 10 ? "arena-power is-strong" : "arena-power is-even";
    const poder = make("div", classe);
    poder.append(make("small", "", "Poder"), make("strong", "", formatNumber(alvo.power)));
    if (meuPoder > 0) poder.append(make("span", "", delta === 0 ? "igual ao seu" : `${delta > 0 ? "+" : ""}${delta}% vs você`));
    poder.append(make("small", "arena-stats", `${formatNumber(alvo.maxHp)} vida · ${formatNumber(alvo.maxDamage)} dano · ${formatNumber(alvo.armor)} armadura`));

    const info = make("div", "arena-card-info");
    info.append(nome, make("small", "", detalhe));

    const acoes = make("div", "arena-card-acts");
    const temEntrada = this.data.entriesLeft > 0;
    const chave = `${alvo.characterId}:${alvo.dummyId}`;
    if (temEntrada) {
      const botao = make("button", "arena-go", "Desafiar");
      botao.type = "button";
      botao.addEventListener("click", () => this.handlers.fight(this.data.arena, alvo.characterId, alvo.dummyId, false));
      acoes.append(botao);
    } else if (arena && arena.entryPrice > 0) {
      const confirmando = this.confirming === chave;
      const botao = make("button", confirmando ? "arena-go is-confirm" : "arena-go is-paid", confirmando ? `Confirmar · ${arena.entryPrice} 💎` : `Entrada · ${arena.entryPrice} 💎`);
      botao.type = "button";
      botao.addEventListener("click", () => {
        if (!confirmando) {
          this.confirming = chave;
          this.draw();
          return;
        }
        this.confirming = "";
        this.handlers.fight(this.data.arena, alvo.characterId, alvo.dummyId, true);
      });
      acoes.append(botao);
    } else {
      acoes.append(make("span", "arena-done", "sem entradas"));
    }

    card.append(canvas, info, poder, acoes);
    return card;
  }

  private boardTable(): HTMLElement {
    const caixa = make("div", "arena-board");
    caixa.append(make("h3", "", "Classificação da semana"));
    const tabela = make("table", "arena-table");
    const corpo = make("tbody");
    for (const linha of this.data.board) {
      const tr = make("tr", linha.mine ? "is-mine" : "");
      tr.append(
        make("td", "arena-rank", `${linha.rank}º`),
        make("td", "", linha.name),
        make("td", "arena-num", formatNumber(linha.rating)),
        make("td", "arena-num", `${linha.wins}V · ${linha.losses}D`),
      );
      corpo.append(tr);
    }
    tabela.append(corpo);
    caixa.append(tabela);
    return caixa;
  }

  // ------------------------------------------------------------ a reprise

  /** Mostra a luta: dois lutadores de frente, barras de vida e os golpes na ordem. */
  showFight(event: ArenaFightEvent) {
    if (!this.isOpen) this.root.hidden = false;
    this.replay?.stop();
    const palco = make("div", "arena-stage");
    const titulo = make("div", "arena-stage-top");
    titulo.append(make("strong", "", "Combate"), make("span", "arena-stage-round", ""));
    const pular = make("button", "arena-skip", "Pular");
    pular.type = "button";
    titulo.append(pular);

    const esquerda = this.fighterSide(event.me, false);
    const direita = this.fighterSide(event.opponent, true);
    const arena = make("div", "arena-fight");
    arena.append(esquerda.root, make("div", "arena-versus", "VS"), direita.root);

    const resultado = make("div", "arena-result");
    resultado.hidden = true;

    palco.append(titulo, arena, resultado);
    this.body.replaceChildren(palco);

    const lados = [esquerda, direita];
    const rodada = titulo.querySelector(".arena-stage-round") as HTMLElement;
    const total = Math.max(1, fightDuration(event.fight));
    const speed = Math.max(MIN_SPEED, total / REPLAY_MS);

    lados[0].setMax(event.me.maxHp);
    lados[1].setMax(event.opponent.maxHp);
    lados[0].setHp(event.me.maxHp);
    lados[1].setHp(event.opponent.maxHp);

    let i = 0;
    let quadro = 0;
    let espera = 0;
    const inicio = performance.now();

    const encerrar = () => {
      // Põe as barras no estado final: pular no meio não pode deixar vida errada na tela.
      const ultimo = event.fight.blows[event.fight.blows.length - 1];
      if (ultimo) {
        lados[0].setHp(ultimo.hp[0]);
        lados[1].setHp(ultimo.hp[1]);
      }
      i = event.fight.blows.length;
      // Sem isto o brilho do último golpe fica preso no perdedor enquanto o resultado aparece.
      lados[0].calm();
      lados[1].calm();
      pular.hidden = true;
      rodada.textContent = `${event.fight.rounds} rodadas`;
      this.showResult(resultado, event);
      this.replay = null;
      // A lista que chegou durante a reprise entra agora.
      if (this.pendingData) {
        this.data = this.pendingData;
        this.pendingData = null;
      }
    };

    const tick = (agora: number) => {
      const decorrido = (agora - inicio) * speed;
      while (i < event.fight.blows.length && event.fight.blows[i].at <= decorrido) {
        const golpe = event.fight.blows[i];
        this.playBlow(golpe, lados);
        rodada.textContent = `rodada ${Math.ceil((i + 1) / 2)}`;
        i++;
      }
      if (i >= event.fight.blows.length) {
        // Deixa o último golpe respirar antes do resultado.
        espera = window.setTimeout(encerrar, 600);
        return;
      }
      quadro = requestAnimationFrame(tick);
    };
    quadro = requestAnimationFrame(tick);

    const stop = () => {
      cancelAnimationFrame(quadro);
      clearTimeout(espera);
    };
    this.replay = { stop };
    pular.addEventListener("click", () => {
      stop();
      encerrar();
    });
  }

  private fighterSide(lutador: ArenaOpponent, espelhado: boolean) {
    const root = make("div", espelhado ? "arena-side is-foe" : "arena-side");
    const canvas = make("canvas", "arena-body-sprite");
    canvas.width = 96;
    canvas.height = 150;
    // Não há direção virada para a esquerda nos sprites assados: desenha a mesma e espelha no
    // CSS (`.is-foe .arena-body-sprite`), que é o que põe os dois de frente um para o outro.
    new LookPreview(canvas, { dir: "SE", scale: 1.6, footY: 112, animate: true }).set({
      appearance: appearanceOf(lutador.look),
    });
    const nome = make("div", "arena-side-name", lutador.name);
    const barra = make("div", "arena-hp");
    const fill = make("div", "arena-hp-fill");
    barra.append(fill);
    const numero = make("div", "arena-hp-num", "");
    const flutuantes = make("div", "arena-floats");
    root.append(flutuantes, canvas, nome, barra, numero);

    // A vida máxima sai do primeiro quadro da luta: o servidor não manda os atributos crus.
    let maxHp = 1;
    return {
      root,
      canvas,
      flutuantes,
      setMax(valor: number) {
        maxHp = Math.max(1, valor);
      },
      setHp(valor: number) {
        const fracao = Math.max(0, Math.min(1, valor / maxHp));
        fill.style.width = `${fracao * 100}%`;
        fill.classList.toggle("is-low", fracao <= 0.25);
        numero.textContent = `${formatNumber(Math.max(0, valor))} / ${formatNumber(maxHp)}`;
      },
      calm() {
        root.classList.remove("is-hit", "is-crit", "is-healed");
      },
      hit(kind: ArenaBlow["kind"]) {
        root.classList.remove("is-hit", "is-crit", "is-healed");
        // Forçar o recálculo faz a animação reiniciar em golpes seguidos.
        void root.offsetWidth;
        root.classList.add(kind === "heal" ? "is-healed" : kind === "crit" || kind === "spellCrit" ? "is-crit" : "is-hit");
      },
    };
  }

  private playBlow(golpe: ArenaBlow, lados: ReturnType<ArenaPanel["fighterSide"]>[]) {
    const quemApanha = golpe.kind === "heal" ? golpe.by : golpe.by === 0 ? 1 : 0;
    lados[0].setHp(golpe.hp[0]);
    lados[1].setHp(golpe.hp[1]);
    lados[quemApanha].hit(golpe.kind);

    const texto =
      golpe.kind === "heal" ? `+${formatNumber(golpe.amount)}`
      : golpe.kind === "block" ? "bloqueou"
      : `−${formatNumber(golpe.amount)}`;
    const classe =
      golpe.kind === "heal" ? "arena-float is-heal"
      : golpe.kind === "block" ? "arena-float is-block"
      : golpe.kind === "crit" || golpe.kind === "spellCrit" ? "arena-float is-crit"
      : golpe.kind === "spell" ? "arena-float is-spell"
      : "arena-float";
    const flutuante = make("div", classe, texto);
    if (golpe.kind === "crit" || golpe.kind === "spellCrit") flutuante.append(make("small", "", "CRÍTICO"));
    // Alternado, e não sorteado: com posição aleatória dois números caíam no mesmo lugar e
    // "−39" e "−70" liam-se como "−3970". A altura também escalona, para três seguidos caberem.
    const vez = this.floatSeq++ % 3;
    flutuante.style.left = `${[30, 50, 70][vez]}%`;
    flutuante.style.top = `${30 + vez * 9}%`;
    lados[quemApanha].flutuantes.append(flutuante);
    window.setTimeout(() => flutuante.remove(), 1200);
  }

  private showResult(caixa: HTMLElement, event: ArenaFightEvent) {
    caixa.hidden = false;
    caixa.classList.add(event.won ? "is-win" : "is-loss");
    caixa.append(make("strong", "arena-verdict", event.won ? "VITÓRIA" : "DERROTA"));

    const premios = make("div", "arena-prizes");
    if (event.gold > 0) premios.append(make("span", "", `+${formatNumber(event.gold)} ouro`));
    if (event.xp > 0) premios.append(make("span", "", `+${formatNumber(event.xp)} XP`));
    if (event.dummy) {
      premios.append(make("span", "arena-neutral", "treino: não vale pontos"));
    } else {
      const sinal = event.ratingDelta > 0 ? "+" : "";
      premios.append(make("span", event.ratingDelta > 0 ? "arena-up" : "arena-down", `${sinal}${event.ratingDelta} pontos · ${formatNumber(event.rating)}`));
    }
    caixa.append(premios);

    const voltar = make("button", "arena-go", event.entriesLeft > 0 ? `Lutar de novo (${event.entriesLeft} restantes)` : "Voltar à lista");
    voltar.type = "button";
    voltar.addEventListener("click", () => this.draw());
    caixa.append(voltar);
  }
}
