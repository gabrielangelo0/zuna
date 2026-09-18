import type { AdminOverviewResponse } from "@zuna/shared";
import { icon } from "./icons.ts";
import { ask, setAdminName } from "./session.ts";
import { cell, chart, duration, face, frame, h, line, num, select, sheet, short, stamp, stat } from "./ui.ts";

// Primeira aba: o reino em números, o movimento dos últimos dias e o estado do mundo.

const RANGES = [
  { id: "7", label: "Últimos 7 dias" },
  { id: "14", label: "Últimos 14 dias" },
  { id: "30", label: "Últimos 30 dias" },
];

let range = 14;

export async function renderOverview(root: HTMLElement) {
  const data = await ask<AdminOverviewResponse>(`/api/admin/overview?days=${range}`);
  const { stats, world } = data;
  setAdminName(data.username);

  const numbers = frame("O reino em números", undefined, "crown");
  numbers.body.className = "stats";
  numbers.body.append(
    stat("contas", num(stats.accounts), "person", "#4aa8ff"),
    stat("personagens", num(stats.characters), "group", "#46d98a"),
    stat("online agora", num(stats.online), "wifi", "#35d6c8"),
    stat("maior nível", num(stats.topLevel), "level", "#e2b34c"),
    stat("ouro no mundo", short(stats.gold), "coin", "#e2b34c"),
    stat("diamantes", short(stats.diamonds), "diamond", "#67c7ff"),
    stat("monstros caçados", short(stats.kills), "monster", "#e05a5a"),
    stat("itens comprados", num(stats.purchases), "box", "#a874e8"),
  );

  const movement = frame("Movimento", undefined, "chart");
  const picker = select(RANGES, String(range));
  picker.addEventListener("change", () => {
    range = Number(picker.value);
    void renderOverview(root);
  });
  movement.root.querySelector("h2")!.append(picker);
  movement.body.append(
    chart(data.days),
    h(
      "div",
      { class: "legend" },
      h("span", { html: '<i style="background:#46d98a"></i>Contas novas' }),
      h("span", { html: '<i style="background:#e2b34c"></i>Personagens novos' }),
    ),
    h("p", {
      class: "note",
      text: `${num(stats.accountsToday)} conta(s) hoje · ${num(stats.accountsWeek)} na semana · ${num(stats.charactersToday)} personagem(ns) hoje`,
    }),
  );

  const server = frame("O mundo agora", undefined, "globe");
  server.body.append(
    h(
      "div",
      { class: "lines" },
      line("group", "Jogadores online", num(world.players.length)),
      line("monster", "Monstros vivos", num(world.monsters)),
      line("calendar", "Evento", world.event ? `${world.event} · ${duration(world.eventEndsAt - Date.now())}` : "Nenhum"),
      line("xp", "XP do servidor", `${world.xpMultiplier}×`),
      line("door", "Salas abertas", num(world.rooms)),
      line("clock", "No ar há", duration(world.uptimeMs)),
      line("lock", "Contas bloqueadas", num(stats.banned)),
      line("crown", "Administradores", num(stats.admins)),
    ),
  );

  const top = frame("Maiores heróis", undefined, "crown");
  top.body.append(
    sheet(
      ["#", "Personagem", "Nível", "Experiência"],
      data.top.map((entry) =>
        h(
          "tr",
          {},
          cell(
            entry.rank === 1
              ? h("span", { class: "rank" }, icon("crown"), "1")
              : h("span", { class: "rank" }, String(entry.rank)),
          ),
          cell(h("span", { class: "cell-face" }, face(entry.outfit), h("strong", { text: entry.name }))),
          cell(num(entry.level), "num"),
          cell(num(entry.value), "num"),
        ),
      ),
      "Ninguém entrou no ranking ainda.",
    ),
  );

  const log = frame("Últimas ações do painel", undefined, "scroll");
  log.body.append(
    sheet(
      ["Quando", "Administrador", "Ação", "Alvo"],
      data.log.map((entry) =>
        h("tr", {}, cell(stamp(entry.at)), cell(h("strong", { text: entry.admin })), cell(entry.action), cell(entry.target)),
      ),
      "Nenhuma mudança registrada.",
    ),
  );

  root.replaceChildren(
    numbers.root,
    h(
      "div",
      { class: "grid two" },
      h("div", {}, movement.root, log.root),
      h("div", {}, h("div", { class: "grid world" }, server.root, h("div", { class: "scene" })), top.root),
    ),
  );
}
