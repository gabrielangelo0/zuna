import {
  ARENA_MAX_ENTRIES,
  ARENA_MAX_GOLD,
  ARENA_MAX_LEVEL,
  ARENA_MAX_PRICE,
  ARENA_MAX_ROUNDS,
  liveVocations,
  type AdminArenaResponse,
  type ArenaDef,
  type ArenaDummy,
  type ArenaReward,
  type ArenaSettings,
} from "@zuna/shared";
import { ask, notify, run } from "./session.ts";
import { askConfirm, askForm, badge, button, cell, frame, h, iconButton, num, retitle, sheet } from "./ui.ts";

// Aba da arena: as praças, os manequins, os degraus do prêmio semanal e os ajustes da
// simulação. Quatro listas porque são quatro coisas com vida própria — praça apagada não pode
// levar o prêmio geral com ela.
//
// Os ajustes da simulação não são enfeite: `spellFactor` e `healFactor` foram medidos, e mexer
// neles sem medir de novo quebra o ritmo da luta. O formulário avisa.

const faixa = (arena: ArenaDef) => (arena.maxLevel > 0 ? `${arena.minLevel}–${arena.maxLevel}` : `${arena.minLevel}+`);

export async function renderArena(root: HTMLElement) {
  const box = frame("Arena", undefined, "sword");
  const pracas = h("div");
  const manequins = h("div");
  const premios = h("div");
  const tabela = h("div");
  const novaPraca = button("Nova arena", () => void editArena(null, reload), "good");
  const novoManequim = button("Novo manequim", () => void editDummy(null, data.arenas, reload), "good");
  const novoPremio = button("Novo degrau", () => void editReward(null, data.arenas, reload), "good");
  const ajustar = button("Ajustes da simulação", () => void editSettings(data.settings, reload));
  box.body.append(
    h(
      "div",
      { class: "row" },
      h("p", {
        class: "note",
        text: "A luta é simulada, não é ao vivo: o jogador enfrenta uma cópia do personagem de outro controlada pela IA. Manequim não mexe na pontuação.",
      }),
      h("span", { class: "spacer" }),
      ajustar,
    ),
    h("div", { class: "row" }, h("h3", { text: "Praças" }), h("span", { class: "spacer" }), novaPraca),
    pracas,
    h("div", { class: "row" }, h("h3", { text: "Manequins — para a arena funcionar com um jogador só" }), h("span", { class: "spacer" }), novoManequim),
    manequins,
    h("div", { class: "row" }, h("h3", { text: "Prêmio semanal" }), h("span", { class: "spacer" }), novoPremio),
    premios,
    h("h3", { text: "Classificação da temporada" }),
    tabela,
  );
  root.replaceChildren(box.root);

  let data: AdminArenaResponse;

  async function reload() {
    data = await ask<AdminArenaResponse>("/api/admin/arena");
    retitle(
      box.root,
      "Arena",
      `${data.season} · ${num(data.players)} competidores · ${num(data.fights)} lutas${data.settings.enabled ? "" : " · DESLIGADA"}`,
      "sword",
    );
    pracas.replaceChildren(
      sheet(
        ["Arena", "Faixa", "Entradas/dia", "Entrada avulsa", "Vitória paga", "Ações"],
        data.arenas.map((arena) => arenaRow(arena, reload)),
        "Nenhuma arena.",
      ),
    );
    manequins.replaceChildren(
      sheet(
        ["Manequim", "Arena", "Nível", "Classe", "Força", "Ações"],
        data.dummies.map((dummy) => dummyRow(dummy, data.arenas, reload)),
        "Nenhum manequim. Sem eles, quem abrir a arena sozinho vê lista vazia.",
      ),
    );
    premios.replaceChildren(
      sheet(
        ["Posições", "Arena", "Ouro", "Diamantes", "Ações"],
        data.rewards.map((reward) => rewardRow(reward, data.arenas, reload)),
        "Nenhum degrau de prêmio.",
      ),
    );
    tabela.replaceChildren(
      sheet(
        ["Arena", "Pos.", "Competidor", "Pontos", "V", "D"],
        data.board.map((linha) =>
          h(
            "tr",
            {},
            cell(linha.arena),
            cell(`${linha.rank}º`),
            cell(linha.name),
            cell(num(linha.rating)),
            cell(num(linha.wins)),
            cell(num(linha.losses)),
          ),
        ),
        "Ninguém lutou nesta temporada ainda.",
      ),
    );
  }

  await reload();
}

// ---------------------------------------------------------------- praças

async function editArena(arena: ArenaDef | null, reload: () => Promise<void>) {
  const answer = await askForm(arena ? `Arena ${arena.name}` : "Nova arena", [
    { id: "id", label: "Chave", value: arena?.id ?? "", hint: arena ? "Não mude: é o que liga a classificação a esta arena." : "Sem acento, ex.: novatos" },
    { id: "name", label: "Nome", value: arena?.name ?? "Arena" },
    { id: "description", label: "Descrição", value: arena?.description ?? "" },
    { id: "minLevel", label: "Nível mínimo", kind: "number", value: arena?.minLevel ?? 10, min: 1, max: ARENA_MAX_LEVEL },
    { id: "maxLevel", label: "Nível máximo", kind: "number", value: arena?.maxLevel ?? 0, min: 0, max: ARENA_MAX_LEVEL, hint: "0 = sem teto. Teto abaixo do mínimo sobe para o mínimo." },
    { id: "freeEntries", label: "Entradas de graça por dia", kind: "number", value: arena?.freeEntries ?? 5, min: 0, max: ARENA_MAX_ENTRIES },
    { id: "entryPrice", label: "Entrada avulsa (💎)", kind: "number", value: arena?.entryPrice ?? 10, min: 0, max: ARENA_MAX_PRICE, hint: "0 = não vende entrada avulsa." },
    { id: "rewardGold", label: "Ouro da vitória", kind: "number", value: arena?.rewardGold ?? 400, min: 0, max: ARENA_MAX_GOLD, hint: "A derrota paga a metade; manequim paga a metade também." },
    { id: "rewardXp", label: "XP da vitória", kind: "number", value: arena?.rewardXp ?? 250, min: 0, max: ARENA_MAX_GOLD },
    { id: "sort", label: "Ordem", kind: "number", value: arena?.sort ?? 1, min: 0, max: 999 },
    { id: "enabled", label: "Aberta", kind: "check", value: arena?.enabled ?? true },
  ]);
  if (!answer) return;
  const ok = await run(null, async () => {
    await ask("/api/admin/arena/praca", {
      method: "POST",
      body: {
        id: answer.id,
        name: answer.name,
        description: answer.description,
        minLevel: Number(answer.minLevel),
        maxLevel: Number(answer.maxLevel),
        freeEntries: Number(answer.freeEntries),
        entryPrice: Number(answer.entryPrice),
        rewardGold: Number(answer.rewardGold),
        rewardXp: Number(answer.rewardXp),
        sort: Number(answer.sort),
        enabled: answer.enabled === "true",
      },
    });
  });
  if (!ok) return;
  notify("Arena salva.");
  await reload();
}

function arenaRow(arena: ArenaDef, reload: () => Promise<void>): HTMLTableRowElement {
  const linha = h("div", { class: "who-line" }, h("strong", { text: arena.name }));
  if (!arena.enabled) linha.append(badge("banned", "fechada"));
  const quem = h("div", { class: "who-cell" }, linha, h("small", { text: arena.description || arena.id }));

  const remove = iconButton(
    "trash",
    "Apagar",
    () => {
      void (async () => {
        if (!(await askConfirm(`Apagar a arena ${arena.name}?`, "Arena com competidores não pode ser apagada: feche-a em vez disso, para a classificação não ficar órfã.", "Apagar"))) return;
        const ok = await run(remove, async () => {
          await ask("/api/admin/arena/praca", { method: "POST", body: { id: arena.id, remove: true } });
        });
        if (!ok) return;
        notify("Arena apagada.");
        await reload();
      })();
    },
    "bad",
  );
  return h(
    "tr",
    {},
    h("td", {}, quem),
    cell(faixa(arena)),
    cell(String(arena.freeEntries)),
    cell(arena.entryPrice > 0 ? `${num(arena.entryPrice)} 💎` : "não vende"),
    cell(`${num(arena.rewardGold)} ouro · ${num(arena.rewardXp)} XP`),
    h("td", { class: "acts" }, iconButton("edit", "Editar", () => void editArena(arena, reload)), remove),
  );
}

// ---------------------------------------------------------------- manequins

async function editDummy(dummy: ArenaDummy | null, arenas: ArenaDef[], reload: () => Promise<void>) {
  const classes = [{ id: "", label: "sem classe" }, ...liveVocations().map((v) => ({ id: v.id, label: v.name }))];
  const answer = await askForm(dummy ? `Manequim ${dummy.name}` : "Novo manequim", [
    { id: "arena", label: "Arena", kind: "select", options: arenas.map((a) => ({ id: a.id, label: a.name })), value: dummy?.arena ?? arenas[0]?.id ?? "" },
    { id: "name", label: "Nome", value: dummy?.name ?? "Manequim" },
    { id: "level", label: "Nível", kind: "number", value: dummy?.level ?? 20, min: 1, max: ARENA_MAX_LEVEL, hint: "Mantenha dentro da faixa da arena, senão ele nunca aparece como adversário." },
    { id: "vocation", label: "Classe", kind: "select", options: classes, value: dummy?.vocation ?? "" },
    { id: "power", label: "Força", kind: "number", value: dummy?.power ?? 1, min: 0.1, max: 10, step: "0.1", hint: "Multiplica vida, dano e armadura. 1 = igual a um jogador nu desse nível." },
    { id: "outfit", label: "Roupa", value: dummy?.outfit ?? "aventureiro" },
    { id: "skin", label: "Pele", kind: "number", value: dummy?.skin ?? 0, min: 0, max: 15 },
    { id: "hairColor", label: "Cabelo", kind: "number", value: dummy?.hairColor ?? 0, min: 0, max: 15 },
    { id: "colorPrimary", label: "Cor 1", kind: "number", value: dummy?.colorPrimary ?? 0, min: 0, max: 15 },
    { id: "colorSecondary", label: "Cor 2", kind: "number", value: dummy?.colorSecondary ?? 0, min: 0, max: 15 },
    { id: "colorDetail", label: "Detalhe", kind: "number", value: dummy?.colorDetail ?? 0, min: 0, max: 15 },
    { id: "enabled", label: "Em uso", kind: "check", value: dummy?.enabled ?? true },
  ]);
  if (!answer) return;
  const ok = await run(null, async () => {
    await ask("/api/admin/arena/manequim", {
      method: "POST",
      body: {
        id: dummy?.id ?? 0,
        arena: answer.arena,
        name: answer.name,
        level: Number(answer.level),
        vocation: answer.vocation,
        power: Number(answer.power.replace(",", ".")),
        outfit: answer.outfit,
        skin: Number(answer.skin),
        hairColor: Number(answer.hairColor),
        colorPrimary: Number(answer.colorPrimary),
        colorSecondary: Number(answer.colorSecondary),
        colorDetail: Number(answer.colorDetail),
        enabled: answer.enabled === "true",
      },
    });
  });
  if (!ok) return;
  notify("Manequim salvo.");
  await reload();
}

function dummyRow(dummy: ArenaDummy, arenas: ArenaDef[], reload: () => Promise<void>): HTMLTableRowElement {
  const arena = arenas.find((a) => a.id === dummy.arena);
  const dentro = arena ? dummy.level >= arena.minLevel && (arena.maxLevel <= 0 || dummy.level <= arena.maxLevel) : false;
  const linha = h("div", { class: "who-line" }, h("strong", { text: dummy.name }));
  if (!dummy.enabled) linha.append(badge("banned", "fora de uso"));
  // Manequim fora da faixa nunca aparece como adversário: o painel diz em vez de deixar quieto.
  if (!dentro) linha.append(badge("banned", "fora da faixa"));
  const quem = h("div", { class: "who-cell" }, linha);

  const remove = iconButton(
    "trash",
    "Apagar",
    () => {
      void (async () => {
        if (!(await askConfirm(`Apagar o manequim ${dummy.name}?`, "Sem manequim, quem abrir essa arena sozinho vê lista vazia.", "Apagar"))) return;
        const ok = await run(remove, async () => {
          await ask("/api/admin/arena/manequim", { method: "POST", body: { id: dummy.id, remove: true } });
        });
        if (!ok) return;
        notify("Manequim apagado.");
        await reload();
      })();
    },
    "bad",
  );
  return h(
    "tr",
    {},
    h("td", {}, quem),
    cell(arena?.name ?? dummy.arena),
    cell(String(dummy.level)),
    cell(dummy.vocation || "—"),
    cell(`${dummy.power.toFixed(1)}×`),
    h("td", { class: "acts" }, iconButton("edit", "Editar", () => void editDummy(dummy, arenas, reload)), remove),
  );
}

// ---------------------------------------------------------------- prêmio semanal

async function editReward(reward: ArenaReward | null, arenas: ArenaDef[], reload: () => Promise<void>) {
  const opcoes = [{ id: "", label: "todas as arenas" }, ...arenas.map((a) => ({ id: a.id, label: a.name }))];
  const answer = await askForm(reward ? `Degrau ${reward.fromRank}º–${reward.toRank}º` : "Novo degrau de prêmio", [
    { id: "arena", label: "Arena", kind: "select", options: opcoes, value: reward?.arena ?? "", hint: "Degrau de uma arena específica ganha do degrau geral na mesma posição." },
    { id: "fromRank", label: "Da posição", kind: "number", value: reward?.fromRank ?? 1, min: 1, max: 9999 },
    { id: "toRank", label: "Até a posição", kind: "number", value: reward?.toRank ?? 1, min: 1, max: 9999 },
    { id: "gold", label: "Ouro", kind: "number", value: reward?.gold ?? 10_000, min: 0, max: ARENA_MAX_GOLD },
    { id: "diamonds", label: "Diamantes", kind: "number", value: reward?.diamonds ?? 30, min: 0, max: ARENA_MAX_PRICE },
    { id: "enabled", label: "Valendo", kind: "check", value: reward?.enabled ?? true },
  ]);
  if (!answer) return;
  const ok = await run(null, async () => {
    await ask("/api/admin/arena/premio", {
      method: "POST",
      body: {
        id: reward?.id ?? 0,
        arena: answer.arena,
        fromRank: Number(answer.fromRank),
        toRank: Number(answer.toRank),
        gold: Number(answer.gold),
        diamonds: Number(answer.diamonds),
        enabled: answer.enabled === "true",
      },
    });
  });
  if (!ok) return;
  notify("Degrau salvo.");
  await reload();
}

function rewardRow(reward: ArenaReward, arenas: ArenaDef[], reload: () => Promise<void>): HTMLTableRowElement {
  const linha = h("div", { class: "who-line" }, h("strong", { text: reward.fromRank === reward.toRank ? `${reward.fromRank}º` : `${reward.fromRank}º ao ${reward.toRank}º` }));
  if (!reward.enabled) linha.append(badge("banned", "desligado"));

  const remove = iconButton(
    "trash",
    "Apagar",
    () => {
      void (async () => {
        if (!(await askConfirm("Apagar este degrau de prêmio?", "Temporada já fechada não muda: o prêmio dela foi congelado quando a tabela fechou.", "Apagar"))) return;
        const ok = await run(remove, async () => {
          await ask("/api/admin/arena/premio", { method: "POST", body: { id: reward.id, remove: true } });
        });
        if (!ok) return;
        notify("Degrau apagado.");
        await reload();
      })();
    },
    "bad",
  );
  return h(
    "tr",
    {},
    h("td", {}, h("div", { class: "who-cell" }, linha)),
    cell(reward.arena ? (arenas.find((a) => a.id === reward.arena)?.name ?? reward.arena) : "todas"),
    cell(num(reward.gold)),
    cell(`${num(reward.diamonds)} 💎`),
    h("td", { class: "acts" }, iconButton("edit", "Editar", () => void editReward(reward, arenas, reload)), remove),
  );
}

// ---------------------------------------------------------------- ajustes

async function editSettings(settings: ArenaSettings, reload: () => Promise<void>) {
  const answer = await askForm("Ajustes da simulação", [
    { id: "enabled", label: "Arena ligada", kind: "check", value: settings.enabled },
    { id: "startRating", label: "Pontuação inicial", kind: "number", value: settings.startRating, min: 0, max: 100_000 },
    { id: "kFactor", label: "K do Elo", kind: "number", value: settings.kFactor, min: 1, max: 200, hint: "Quanto uma luta mexe na pontuação. 24 = empate entre iguais vale 12 pontos." },
    { id: "maxRounds", label: "Teto de rodadas", kind: "number", value: settings.maxRounds, min: 2, max: ARENA_MAX_ROUNDS, hint: "Válvula de segurança: batendo o teto, decide a vida proporcional." },
    {
      id: "spellFactor",
      label: "Força da magia",
      kind: "number",
      value: settings.spellFactor,
      min: 0,
      max: 5,
      step: "0.05",
      hint: "MEDIDO: 0,5 dá ~12 rodadas em qualquer nível. Mexer sem medir de novo quebra o ritmo da luta.",
    },
    {
      id: "healFactor",
      label: "Força da cura",
      kind: "number",
      value: settings.healFactor,
      min: 0,
      max: 5,
      step: "0.05",
      hint: "MEDIDO: com 1,0 a cura do mundo vence o duelo e 7 de 10 lutas terminam no teto de rodadas.",
    },
    { id: "healAt", label: "Cura abaixo de", kind: "number", value: settings.healAt, min: 0, max: 1, step: "0.05", hint: "0,35 = cura quando a vida cai abaixo de 35%." },
    { id: "healManaPct", label: "Mana da cura", kind: "number", value: settings.healManaPct, min: 0, max: 1, step: "0.01", hint: "Fração da mana máxima. É o que faz o poço de mana da classe decidir quantas curas ela tem." },
    { id: "maxHeals", label: "Teto de curas", kind: "number", value: settings.maxHeals, min: 0, max: 50 },
    { id: "vipEntries", label: "Entradas a mais por degrau de VIP", kind: "number", value: settings.vipEntries, min: 0, max: ARENA_MAX_ENTRIES },
    { id: "offsetHours", label: "Fuso da virada", kind: "number", value: settings.offsetHours, min: -14, max: 14, hint: "-3 = Brasília. Define quando o dia e a semana viram." },
  ]);
  if (!answer) return;
  const n = (v: string) => Number(v.replace(",", "."));
  const ok = await run(null, async () => {
    await ask("/api/admin/arena/ajustes", {
      method: "POST",
      body: {
        enabled: answer.enabled === "true",
        startRating: Number(answer.startRating),
        kFactor: Number(answer.kFactor),
        maxRounds: Number(answer.maxRounds),
        spellFactor: n(answer.spellFactor),
        healFactor: n(answer.healFactor),
        healAt: n(answer.healAt),
        healManaPct: n(answer.healManaPct),
        maxHeals: Number(answer.maxHeals),
        vipEntries: Number(answer.vipEntries),
        offsetHours: Number(answer.offsetHours),
      },
    });
  });
  if (!ok) return;
  notify("Ajustes salvos.");
  await reload();
}
