import {
  MONSTERS,
  QUEST_MAX_AMOUNT,
  QUEST_MAX_PLAYERS,
  gearList,
  type AdminQuestRow,
  type AdminQuestsResponse,
  type AdminWorldsResponse,
  type MonsterKind,
  type QuestDef,
} from "@zuna/shared";
import { ask, notify, run } from "./session.ts";
import { askConfirm, askForm, badge, button, cell, frame, h, iconButton, num, retitle, select, sheet, short } from "./ui.ts";

// Aba de missões: caçadas (mate X monstros) e desafios de chefe, que pedem um número
// de jogadores no altar. Tudo vale na hora para quem está jogando.

const KIND_OPTIONS = [
  { id: "kill", label: "Caçada" },
  { id: "boss", label: "Desafio de chefe" },
];

const MONSTER_OPTIONS = Object.values(MONSTERS).map((monster) => ({ id: monster.kind, label: monster.name }));

let worldOptions: { id: string; label: string }[] = [{ id: "0", label: "Qualquer mundo" }];

export async function renderQuests(root: HTMLElement) {
  const box = frame("Missões", undefined, "scroll");
  const list = h("div");
  box.body.append(
    h(
      "div",
      { class: "row" },
      h("p", {
        class: "note",
        text: "A caçada conta os monstros que o jogador derrubar. O desafio só começa com o número de jogadores pedido perto do altar.",
      }),
      h("span", { class: "spacer" }),
      button("Nova missão", () => void editQuest(null, reload), "good"),
    ),
    list,
  );
  root.replaceChildren(box.root);

  async function reload() {
    const [data, worlds] = await Promise.all([
      ask<AdminQuestsResponse>("/api/admin/quests"),
      ask<AdminWorldsResponse>("/api/admin/worlds"),
    ]);
    worldOptions = [
      { id: "0", label: "Qualquer mundo" },
      ...worlds.worlds.map((row) => ({ id: String(row.world.id), label: row.world.name })),
    ];
    const names = new Map(worldOptions.map((option) => [option.id, option.label]));
    retitle(box.root, "Missões", `${num(data.quests.length)} missões`, "scroll");
    list.replaceChildren(
      sheet(
        ["Missão", "Tipo", "Monstro", "Onde", "Nível", "Recompensa", "Repete", "Fazendo", "Feitas", "Ações"],
        data.quests.map((row) => questRow(row, names, reload)),
        "Nenhuma missão.",
      ),
    );
  }

  await reload();
}

function rewardText(quest: QuestDef): string {
  const parts: string[] = [];
  if (quest.rewardXp > 0) parts.push(`${short(quest.rewardXp)} XP`);
  if (quest.rewardGold > 0) parts.push(`🪙 ${short(quest.rewardGold)}`);
  if (quest.rewardItem) parts.push(quest.rewardItemCount > 1 ? `${quest.rewardItemCount}× ${quest.rewardItem}` : quest.rewardItem);
  return parts.join(" · ") || "—";
}

function questRow(row: AdminQuestRow, worldNames: Map<string, string>, reload: () => Promise<void>): HTMLTableRowElement {
  const { quest } = row;
  const line = h("div", { class: "who-line" }, h("strong", { text: quest.name }));
  if (!quest.enabled) line.append(badge("banned", "desligada"));
  const who = h("div", { class: "who-cell" }, line, h("small", { text: quest.description || "—" }));

  const send = async (control: HTMLElement, body: Record<string, unknown>, message: string) => {
    const ok = await run(control, async () => {
      await ask("/api/admin/quest", { method: "POST", body: { id: quest.id, ...body } });
    });
    if (!ok) return;
    notify(message);
    await reload();
  };

  const onOff = iconButton(
    quest.enabled ? "lock" : "check",
    quest.enabled ? "Desligar (some do jogo)" : "Ligar",
    () => void send(onOff, { enabled: !quest.enabled }, quest.enabled ? "Missão desligada." : "Missão ligada."),
    quest.enabled ? "" : "good",
  );
  const remove = iconButton(
    "trash",
    "Apagar",
    () => {
      void (async () => {
        const message = row.doing + row.finished > 0 ? `${num(row.doing + row.finished)} personagem(ns) têm o progresso dela.` : "";
        if (await askConfirm(`Apagar ${quest.name}?`, `${message} Isso não pode ser desfeito.`, "Apagar")) {
          await send(remove, { remove: true }, "Missão apagada.");
        }
      })();
    },
    "bad",
  );

  return h(
    "tr",
    {},
    cell(who),
    cell(quest.kind === "boss" ? `Chefe · ${num(quest.players)} jogadores` : "Caçada"),
    cell(quest.kind === "boss" ? MONSTERS[quest.monster].name : `${num(quest.amount)}× ${MONSTERS[quest.monster].name}`),
    cell(quest.kind === "boss" ? `${worldNames.get(String(quest.worldId)) ?? "—"} (${quest.x}, ${quest.y})` : (worldNames.get(String(quest.worldId)) ?? "—")),
    cell(num(quest.minLevel), "num"),
    cell(rewardText(quest)),
    cell(quest.repeatMinutes > 0 ? `${num(quest.repeatMinutes)} min` : "uma vez"),
    cell(num(row.doing), "num"),
    cell(num(row.finished), "num"),
    cell(h("div", { class: "actions" }, iconButton("brush", "Editar", () => void editQuest(row, reload)), onOff, remove)),
  );
}

async function editQuest(row: AdminQuestRow | null, reload: () => Promise<void>) {
  const quest = row?.quest;
  const itemOptions = [{ id: "", label: "Nenhum" }, ...gearList().map((item) => ({ id: item.id, label: item.name }))];
  const answer = await askForm(quest ? `Editar ${quest.name}` : "Nova missão", [
    { id: "name", label: "Nome", value: quest?.name ?? "" },
    { id: "description", label: "Descrição", value: quest?.description ?? "" },
    { id: "kind", label: "Tipo", kind: "select", options: KIND_OPTIONS, value: quest?.kind ?? "kill" },
    { id: "monster", label: "Monstro", kind: "select", options: MONSTER_OPTIONS, value: quest?.monster ?? "rat" },
    { id: "amount", label: "Caçada: quantos matar", kind: "number", value: quest?.amount ?? 20, min: 1, max: QUEST_MAX_AMOUNT },
    { id: "worldId", label: "Mundo", kind: "select", options: worldOptions, value: String(quest?.worldId ?? 0) },
    { id: "minLevel", label: "Nível mínimo", kind: "number", value: quest?.minLevel ?? 1, min: 1 },
    {
      id: "players",
      label: "Chefe: jogadores no altar",
      kind: "number",
      value: quest?.players ?? 2,
      min: 1,
      max: QUEST_MAX_PLAYERS,
      hint: "A vida do chefe é multiplicada pelo número de jogadores presentes.",
    },
    { id: "x", label: "Chefe: altar X", kind: "number", value: quest?.x ?? 0, min: 0 },
    { id: "y", label: "Chefe: altar Y", kind: "number", value: quest?.y ?? 0, min: 0 },
    { id: "bossScale", label: "Chefe: força extra", kind: "number", value: quest?.bossScale ?? 1, min: 0.1, max: 20, step: "0.1" },
    { id: "repeatMinutes", label: "Repete a cada (min; 0 = uma vez)", kind: "number", value: quest?.repeatMinutes ?? 60, min: 0 },
    { id: "rewardXp", label: "Recompensa: XP", kind: "number", value: quest?.rewardXp ?? 0, min: 0 },
    { id: "rewardGold", label: "Recompensa: ouro", kind: "number", value: quest?.rewardGold ?? 0, min: 0 },
    { id: "rewardItem", label: "Recompensa: item", kind: "select", options: itemOptions, value: quest?.rewardItem ?? "" },
    { id: "rewardItemCount", label: "Quantos itens", kind: "number", value: quest?.rewardItemCount ?? 1, min: 1 },
    { id: "enabled", label: "Ligada", kind: "check", value: quest?.enabled ?? true },
  ]);
  if (!answer) return;
  const body = {
    id: quest?.id ?? 0,
    name: answer.name.trim(),
    description: answer.description.trim(),
    kind: answer.kind,
    monster: answer.monster as MonsterKind,
    amount: Number(answer.amount) || 1,
    worldId: Number(answer.worldId) || 0,
    minLevel: Number(answer.minLevel) || 1,
    players: Number(answer.players) || 1,
    x: Number(answer.x) || 0,
    y: Number(answer.y) || 0,
    bossScale: Number(answer.bossScale.replace(",", ".")) || 1,
    repeatMinutes: Number(answer.repeatMinutes) || 0,
    rewardXp: Number(answer.rewardXp) || 0,
    rewardGold: Number(answer.rewardGold) || 0,
    rewardItem: answer.rewardItem,
    rewardItemCount: Number(answer.rewardItemCount) || 1,
    enabled: answer.enabled === "true",
  };
  const ok = await run(null, async () => {
    await ask("/api/admin/quest", { method: "POST", body });
  });
  if (!ok) return;
  notify(quest ? "Missão salva." : "Missão criada.");
  await reload();
}
