import type { AdminEventsResponse, AdminWorldResponse, AdminWorldsResponse, WorldDef } from "@zuna/shared";
import { openPlayer } from "./detail.ts";
import { ask, notify, run } from "./session.ts";
import {
  askForm,
  askText,
  badge,
  bar,
  button,
  cell,
  duration,
  face,
  frame,
  h,
  iconButton,
  input,
  num,
  retitle,
  select,
  sheet,
} from "./ui.ts";

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
  const places = h("p", { class: "note" });
  // Os mundos abertos: o painel precisa deles para os botões de teleporte.
  const worlds = new Map<string, WorldDef>();
  for (const row of (await ask<AdminWorldsResponse>("/api/admin/worlds")).worlds) worlds.set(row.world.slug, row.world);
  const events = (await ask<AdminEventsResponse>("/api/admin/events")).events.filter((event) => event.enabled);
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

  // Os eventos são os da aba Eventos: aqui só ficam os atalhos para começar.
  const picker = select(
    events.map((event) => ({ id: event.slug, label: event.name })),
    events[0]?.slug ?? "",
  );
  const startEvent = button("Começar evento", () => {
    if (!picker.value) {
      notify("Crie um evento na aba Eventos.", false);
      return;
    }
    void command(startEvent, { kind: "event", event: picker.value });
  }, "good");
  const stop = button("Encerrar evento", () => void command(stop, { kind: "stopEvent" }), "bad");

  controls.body.append(
    h("div", { class: "row" }, picker, startEvent, stop),
    h("div", { class: "row" }, announcement, send),
    state,
    places,
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
    places.textContent = world.worlds
      .map((entry) => `${entry.name}: ${num(entry.players)} jogador(es) · ${num(entry.monsters)} monstros`)
      .join("  ·  ");
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

      // Seis ações numa linha só: por isso os botões são só o desenho, com o balãozinho de ajuda.
      const whisper = iconButton("megaphone", "Mandar um recado", () =>
        void askText(`Recado para ${player.name}`, "o que o mestre diz?").then((text) => {
          if (text) void command(whisper, { kind: "whisper", characterId: player.characterId, text });
        }),
      );
      const heal = iconButton("heart", "Encher vida e mana", () => act({ kind: "heal" })(heal), "good");
      const home = worlds.get(player.world);
      const temple = iconButton("door", "Mandar para a praça deste mundo", () =>
        act({ kind: "teleport", x: home?.spawnX ?? player.x, y: home?.spawnY ?? player.y })(temple),
      );
      const move = iconButton("portal", "Levar para outro mundo", () =>
        void travel(player.characterId, player.name, player.world),
      );
      const mute = iconButton("mute", "Silenciar por 10 minutos", () => act({ kind: "mute", minutes: 10 })(mute));
      const kick = iconButton("logout", "Tirar do jogo", () => act({ kind: "kick" })(kick), "bad");

      const marks = h("div", { class: "badges" }, badge("online", "online"));
      if (player.mounted) marks.append(badge("admin", "montado"));
      if (player.mutedMs > 0) marks.append(badge("muted", `mudo ${Math.ceil(player.mutedMs / 60_000)}m`));

      return h(
        "tr",
        {},
        cell(h("span", { class: "cell-face" }, face(player.outfit), h("strong", { text: player.name }))),
        cell(worlds.get(player.world)?.name ?? player.world),
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
        cell(h("div", { class: "actions" }, whisper, heal, temple, move, mute, kick)),
      );
    });

    list.body.replaceChildren(
      sheet(
        ["Personagem", "Mundo", "Conta", "Nível", "Vida", "Mana", "Onde", "Ouro", "Estado", "Ações"],
        rows,
        "Ninguém está jogando agora.",
      ),
    );
  }

  /** Leva o personagem para outro mundo, no ponto que o mestre escolher. */
  async function travel(characterId: number, name: string, current: string) {
    const options = [...worlds.values()].map((world) => ({ id: String(world.id), label: world.name }));
    const target = worlds.get(current);
    const answer = await askForm(
      `Levar ${name} para`,
      [
        { id: "worldId", label: "Mundo", kind: "select", options, value: String(target?.id ?? "") },
        { id: "x", label: "X", kind: "number", value: target?.spawnX ?? 0, min: 0 },
        { id: "y", label: "Y", kind: "number", value: target?.spawnY ?? 0, min: 0 },
      ],
      "Levar",
    );
    if (!answer) return;
    const ok = await run(null, async () => {
      const done = await ask<{ message: string }>("/api/admin/command", {
        method: "POST",
        body: { kind: "teleport", characterId, worldId: Number(answer.worldId), x: Number(answer.x), y: Number(answer.y) },
      });
      notify(done.message);
    });
    if (ok) await refresh();
  }

  await refresh();
  stopWorldRefresh();
  timer = window.setInterval(() => void refresh().catch(() => stopWorldRefresh()), REFRESH_MS);
}
