import {
  EVENT_MAX_COUNT,
  EVENT_MAX_MINUTES,
  EVENT_MAX_WAVES,
  MONSTERS,
  blankEvent,
  type AdminEventsResponse,
  type AdminWorldsResponse,
  type EventDef,
  type EventWave,
} from "@zuna/shared";
import { ask, notify, run } from "./session.ts";
import { askConfirm, askForm, badge, block, button, cell, duration, frame, h, iconButton, num, retitle, sheet } from "./ui.ts";

// Aba dos eventos: tudo o que acontece no mundo é montado aqui — texto, duração,
// bônus de XP e de ouro e as levas de monstros.

const MONSTER_OPTIONS = Object.values(MONSTERS).map((def) => ({ id: def.kind, label: def.name }));

/** Evento com as levas abertas embaixo da tabela. */
let openWaves: number | null = null;

export async function renderEvents(root: HTMLElement) {
  const box = frame("Eventos", undefined, "bolt");
  const state = h("p", { class: "note" });
  const list = h("div");
  const waves = h("div");

  box.body.append(
    h(
      "div",
      { class: "row" },
      button("Novo evento", () => void createEvent(reload), "good"),
      button("Encerrar o que estiver rodando", () => void stopEvent(reload), "bad"),
      button("Atualizar", () => void reload()),
    ),
    state,
    list,
    waves,
  );
  root.replaceChildren(box.root);

  async function reload() {
    const data = await ask<AdminEventsResponse>("/api/admin/events");
    const worlds = await ask<AdminWorldsResponse>("/api/admin/worlds");
    const worldName = (id: number) => worlds.worlds.find((row) => row.world.id === id)?.world.name ?? "todos";

    retitle(box.root, "Eventos", `${num(data.events.length)} evento(s)`, "bolt");
    state.textContent = data.running
      ? `Rodando agora: ${data.running} · faltam ${duration(data.runningEndsAt - Date.now())}`
      : "Nenhum evento em andamento.";

    list.replaceChildren(
      sheet(
        ["Evento", "Duração", "XP", "Ouro", "Mundo", "Sozinho", "Levas", "Ações"],
        data.events.map((event) => eventRow(event, worldName(event.worldId), reload)),
        "Nenhum evento cadastrado.",
      ),
    );

    const chosen = data.events.find((event) => event.id === openWaves);
    waves.replaceChildren(chosen ? waveBlock(chosen, reload) : h("span"));
  }

  await reload();
}

function eventRow(event: EventDef, worldName: string, reload: () => Promise<void>): HTMLTableRowElement {
  const line = h("div", { class: "who-line" }, h("strong", { text: event.name }));
  if (!event.enabled) line.append(badge("banned", "desligado"));
  if (event.endsWithWaves) line.append(badge("admin", "acaba na vitória"));

  const who = h("div", { class: "who-cell" }, line, h("small", { text: event.startText || `chave ${event.slug}` }));

  const actions = h(
    "div",
    { class: "actions" },
    iconButton("play", "Começar agora", () => void startEvent(event, reload), "good"),
    iconButton("scroll", "Mudar o evento", () => void editEvent(event, reload)),
    iconButton("nest", "Levas de monstro", () => {
      openWaves = openWaves === event.id ? null : event.id;
      void reload();
    }),
    iconButton(
      event.enabled ? "lock" : "check",
      event.enabled ? "Desligar" : "Ligar",
      () => void saveEvent({ ...event, enabled: !event.enabled }, reload, event.enabled ? "Evento desligado." : "Evento ligado."),
      event.enabled ? "" : "bad",
    ),
    iconButton("trash", "Apagar o evento", () => void removeEvent(event, reload), "bad"),
  );

  return h(
    "tr",
    {},
    cell(who),
    cell(`${event.minutes} min`, "num"),
    cell(`${event.xpMultiplier}×`, "num"),
    cell(`${event.goldMultiplier}×`, "num"),
    cell(worldName),
    cell(event.autoMinutes > 0 ? `a cada ${event.autoMinutes} min` : "só no comando"),
    cell(num(event.waves.length), "num"),
    cell(actions),
  );
}

function waveBlock(event: EventDef, reload: () => Promise<void>): HTMLElement {
  const box = block(`Levas de ${event.name}`, `${event.waves.length} de ${EVENT_MAX_WAVES}`, "nest");

  event.waves.forEach((wave, index) => {
    box.body.append(
      h(
        "div",
        { class: "place-line" },
        h(
          "div",
          {},
          h("strong", { text: `${wave.count}× ${MONSTERS[wave.monster]?.name ?? wave.monster}` }),
          h("small", { text: `${wave.delay}s depois do começo · raio ${wave.radius}${wave.text ? ` · "${wave.text}"` : ""}` }),
        ),
        h(
          "div",
          { class: "actions" },
          iconButton("scroll", "Mudar a leva", () => void editWave(event, index, reload)),
          iconButton("trash", "Apagar a leva", () => {
            const waves = event.waves.filter((_, other) => other !== index);
            void saveEvent({ ...event, waves }, reload, "Leva apagada.");
          }, "bad"),
        ),
      ),
    );
  });

  if (event.waves.length === 0) {
    box.body.append(h("p", { class: "note", text: "Sem levas: o evento é só bônus e anúncio." }));
  }
  if (event.waves.length < EVENT_MAX_WAVES) {
    box.body.append(h("div", { class: "row" }, button("Nova leva", () => void editWave(event, -1, reload), "good")));
  }
  return box.root;
}

async function editWave(event: EventDef, index: number, reload: () => Promise<void>) {
  const current: EventWave = event.waves[index] ?? { delay: 10, monster: "orc", count: 6, radius: 9, text: "" };
  const answer = await askForm(
    index < 0 ? "Nova leva" : "Mudar a leva",
    [
      { id: "monster", label: "Monstro", kind: "select", options: MONSTER_OPTIONS, value: current.monster },
      { id: "count", label: "Quantos", kind: "number", value: current.count, min: 1, max: EVENT_MAX_COUNT },
      { id: "delay", label: "Chega depois de (segundos)", kind: "number", value: current.delay, min: 0 },
      { id: "radius", label: "Distância da praça", kind: "number", value: current.radius, min: 1, max: 60 },
      { id: "text", label: "Anúncio ao chegar", value: current.text },
    ],
    index < 0 ? "Criar" : "Salvar",
  );
  if (!answer) return;

  const wave: EventWave = {
    monster: answer.monster as EventWave["monster"],
    count: Number(answer.count),
    delay: Number(answer.delay),
    radius: Number(answer.radius),
    text: answer.text,
  };
  const waves = index < 0 ? [...event.waves, wave] : event.waves.map((other, at) => (at === index ? wave : other));
  await saveEvent({ ...event, waves }, reload, "Leva salva.");
}

async function editEvent(event: EventDef, reload: () => Promise<void>) {
  const worlds = await ask<AdminWorldsResponse>("/api/admin/worlds");
  const options = [{ id: "0", label: "Todos os mundos" }, ...worlds.worlds.map((row) => ({ id: String(row.world.id), label: row.world.name }))];

  const answer = await askForm(
    `Evento ${event.name}`,
    [
      { id: "name", label: "Nome", value: event.name },
      { id: "minutes", label: "Duração (minutos)", kind: "number", value: event.minutes, min: 1, max: EVENT_MAX_MINUTES },
      { id: "xpMultiplier", label: "XP vezes", kind: "number", value: event.xpMultiplier, min: 0.1, max: 10, step: "0.1" },
      { id: "goldMultiplier", label: "Ouro vezes", kind: "number", value: event.goldMultiplier, min: 0.1, max: 10, step: "0.1" },
      { id: "worldId", label: "Onde acontece", kind: "select", options, value: String(event.worldId) },
      {
        id: "autoMinutes",
        label: "Sozinho a cada (minutos)",
        kind: "number",
        value: event.autoMinutes,
        min: 0,
        hint: "0 deixa o evento só no comando do painel.",
      },
      { id: "startText", label: "Anúncio ao começar", value: event.startText },
      { id: "endText", label: "Anúncio ao terminar", value: event.endText },
      { id: "winText", label: "Anúncio da vitória", value: event.winText },
      { id: "endsWithWaves", label: "Termina quando a última leva cair", kind: "check", value: event.endsWithWaves },
      { id: "enabled", label: "Ligado", kind: "check", value: event.enabled },
    ],
    "Salvar",
  );
  if (!answer) return;

  await saveEvent(
    {
      ...event,
      name: answer.name,
      minutes: Number(answer.minutes),
      xpMultiplier: Number(answer.xpMultiplier),
      goldMultiplier: Number(answer.goldMultiplier),
      worldId: Number(answer.worldId),
      autoMinutes: Number(answer.autoMinutes),
      startText: answer.startText,
      endText: answer.endText,
      winText: answer.winText,
      endsWithWaves: answer.endsWithWaves === "true",
      enabled: answer.enabled === "true",
    },
    reload,
    "Evento salvo.",
  );
}

async function createEvent(reload: () => Promise<void>) {
  const fresh = blankEvent();
  const answer = await askForm(
    "Novo evento",
    [
      { id: "name", label: "Nome", value: "Chuva de Ouro" },
      { id: "minutes", label: "Duração (minutos)", kind: "number", value: 10, min: 1, max: EVENT_MAX_MINUTES },
      { id: "xpMultiplier", label: "XP vezes", kind: "number", value: 1, min: 0.1, max: 10, step: "0.1" },
      { id: "goldMultiplier", label: "Ouro vezes", kind: "number", value: 2, min: 0.1, max: 10, step: "0.1" },
      { id: "startText", label: "Anúncio ao começar", value: "Chuva de Ouro! Todo monstro larga o dobro de moedas." },
      { id: "endText", label: "Anúncio ao terminar", value: "A Chuva de Ouro passou." },
    ],
    "Criar",
  );
  if (!answer) return;

  const ok = await run(null, async () => {
    await ask("/api/admin/event", {
      method: "POST",
      body: {
        ...fresh,
        name: answer.name,
        minutes: Number(answer.minutes),
        xpMultiplier: Number(answer.xpMultiplier),
        goldMultiplier: Number(answer.goldMultiplier),
        startText: answer.startText,
        endText: answer.endText,
      },
    });
  });
  if (!ok) return;
  notify(`${answer.name} criado.`);
  await reload();
}

async function saveEvent(event: EventDef, reload: () => Promise<void>, done: string) {
  const ok = await run(null, async () => {
    await ask("/api/admin/event", { method: "POST", body: event });
  });
  if (!ok) return;
  notify(done);
  await reload();
}

async function removeEvent(event: EventDef, reload: () => Promise<void>) {
  const sure = await askConfirm(`Apagar ${event.name}?`, "O evento some da lista e não acontece mais.", "Apagar");
  if (!sure) return;
  const ok = await run(null, async () => {
    await ask("/api/admin/event", { method: "POST", body: { id: event.id, remove: true } });
  });
  if (!ok) return;
  if (openWaves === event.id) openWaves = null;
  notify(`${event.name} foi apagado.`);
  await reload();
}

async function startEvent(event: EventDef, reload: () => Promise<void>) {
  const ok = await run(null, async () => {
    const answer = await ask<{ message: string }>("/api/admin/command", {
      method: "POST",
      body: { kind: "event", event: event.slug },
    });
    notify(answer.message);
  });
  if (ok) await reload();
}

async function stopEvent(reload: () => Promise<void>) {
  const ok = await run(null, async () => {
    const answer = await ask<{ message: string }>("/api/admin/command", { method: "POST", body: { kind: "stopEvent" } });
    notify(answer.message);
  });
  if (ok) await reload();
}
