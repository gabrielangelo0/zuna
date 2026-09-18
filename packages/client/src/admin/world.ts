import { TEMPLE_X, TEMPLE_Y, type AdminWorldResponse } from "@zuna/shared";
import { openPlayer } from "./detail.ts";
import { ask, notify, run } from "./session.ts";
import { askText, badge, bar, button, cell, duration, face, frame, h, input, num, retitle, sheet } from "./ui.ts";

// Aba do mundo: eventos, anúncio para todos e a lista de quem está jogando agora.

const REFRESH_MS = 6000;
let timer = 0;

export function stopWorldRefresh() {
  window.clearInterval(timer);
  timer = 0;
}

export async function renderWorld(root: HTMLElement) {
  const controls = frame("Mestre do mundo", undefined, "megaphone");
  const state = h("p", { class: "note" });
  const announcement = input("", { max: 160 });
  announcement.placeholder = "Anúncio para todo o servidor";
  announcement.style.flex = "1";
  announcement.style.minWidth = "260px";

  const send = button(
    "Anunciar",
    () => {
      if (!announcement.value.trim()) {
        notify("Escreva o anúncio.", false);
        return;
      }
      void command(send, { kind: "announce", text: announcement.value }).then(() => (announcement.value = ""));
    },
    "good",
  );

  const doubleXp = button("XP em Dobro", () => void command(doubleXp, { kind: "event", event: "xp" }));
  const invasion = button("Invasão Orc", () => void command(invasion, { kind: "event", event: "invasion" }));
  const stop = button("Encerrar evento", () => void command(stop, { kind: "stopEvent" }), "bad");

  controls.body.append(
    h("div", { class: "row" }, doubleXp, invasion, stop),
    h("div", { class: "row" }, announcement, send),
    state,
  );

  const list = frame("Quem está online", undefined, "users");
  root.replaceChildren(controls.root, list.root);

  async function command(control: HTMLElement, body: Record<string, unknown>) {
    const ok = await run(control, async () => {
      const answer = await ask<{ message: string }>("/api/admin/command", { method: "POST", body });
      notify(answer.message);
    });
    if (ok) await refresh();
  }

  async function refresh() {
    const { world } = await ask<AdminWorldResponse>("/api/admin/world");
    state.textContent = world.event
      ? `Evento em andamento: ${world.event} · faltam ${duration(world.eventEndsAt - Date.now())} · XP ${world.xpMultiplier}×`
      : `Nenhum evento agora · ${num(world.monsters)} monstros vivos · no ar há ${duration(world.uptimeMs)}`;

    retitle(
      list.root,
      "Quem está online",
      `${num(world.players.length)} jogador(es) · ${num(world.monsters)} monstros`,
      "users",
    );

    const rows = world.players.map((player) => {
      const act = (body: Record<string, unknown>) => (control: HTMLElement) =>
        void command(control, { characterId: player.characterId, ...body });

      const whisper = button(
        "Recado",
        () =>
          void askText(`Recado para ${player.name}`, "o que o mestre diz?").then((text) => {
            if (text) void command(whisper, { kind: "whisper", characterId: player.characterId, text });
          }),
      );
      const heal = button("Curar", () => act({ kind: "heal" })(heal));
      const temple = button("Templo", () => act({ kind: "teleport", x: TEMPLE_X, y: TEMPLE_Y })(temple));
      const mute = button("Silenciar", () => act({ kind: "mute", minutes: 10 })(mute));
      const kick = button("Expulsar", () => act({ kind: "kick" })(kick), "bad");

      const marks = h("div", { class: "badges" }, badge("online", "online"));
      if (player.mounted) marks.append(badge("admin", "montado"));
      if (player.mutedMs > 0) marks.append(badge("muted", `mudo ${Math.ceil(player.mutedMs / 60_000)}m`));

      return h(
        "tr",
        {},
        cell(h("span", { class: "cell-face" }, face(player.outfit), h("strong", { text: player.name }))),
        cell(
          h("button", {
            type: "button",
            class: "link",
            text: player.username,
            onClick: () => openPlayer(player.accountId, refresh),
          }),
        ),
        cell(num(player.level), "num"),
        cell(bar(player.hp, player.maxHp, "hp")),
        cell(bar(player.mana, player.maxMana, "mana")),
        cell(`${player.x}, ${player.y}`, "num"),
        cell(num(player.gold), "num"),
        cell(marks),
        cell(h("div", { class: "actions" }, whisper, heal, temple, mute, kick)),
      );
    });

    list.body.replaceChildren(
      sheet(
        ["Personagem", "Conta", "Nível", "Vida", "Mana", "Onde", "Ouro", "Estado", "Ações"],
        rows,
        "Ninguém está jogando agora.",
      ),
    );
  }

  await refresh();
  stopWorldRefresh();
  timer = window.setInterval(() => void refresh().catch(() => stopWorldRefresh()), REFRESH_MS);
}
