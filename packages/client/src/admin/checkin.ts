import {
  CHECKIN_MAX_DAYS,
  CHECKIN_MAX_OFFSET,
  checkinCycle,
  gearList,
  type AdminCheckinResponse,
  type CheckinDay,
} from "@zuna/shared";
import { ask, notify, run } from "./session.ts";
import { askConfirm, askForm, badge, button, cell, frame, h, iconButton, num, retitle, sheet, short } from "./ui.ts";

// Aba do presente diário: o ciclo de dias e as regras. Tudo vale na hora para quem está jogando.

export async function renderCheckin(root: HTMLElement) {
  const box = frame("Presente diário", undefined, "calendar");
  const list = h("div");
  const rulesButton = button("Regras", () => void editRules());
  box.body.append(
    h(
      "div",
      { class: "row" },
      h("p", {
        class: "note",
        text: "Cada conta abre um presente por dia. Ao passar do último dia, o ciclo volta ao primeiro.",
      }),
      h("span", { class: "spacer" }),
      rulesButton,
      button("Novo dia", () => void editDay(null, reload), "good"),
    ),
    list,
  );
  root.replaceChildren(box.root);

  let data: AdminCheckinResponse;

  async function reload() {
    data = await ask<AdminCheckinResponse>("/api/admin/checkin");
    const cycle = checkinCycle(data.days).length;
    const today = data.today === 1 ? "1 aberto hoje" : `${num(data.today)} abertos hoje`;
    const active = data.active === 1 ? "1 conta na sequência" : `${num(data.active)} contas na sequência`;
    retitle(
      box.root,
      "Presente diário",
      `${num(cycle)} dias no ciclo · ${today} · ${active}${data.settings.enabled ? "" : " · DESLIGADO"}`,
      "calendar",
    );
    list.replaceChildren(
      sheet(
        ["Dia", "Ouro", "Diamantes", "XP", "Item", "Destaque", "Ações"],
        data.days.map((day) => dayRow(day, reload)),
        "Nenhum dia no ciclo.",
      ),
    );
  }

  async function editRules() {
    const answer = await askForm("Regras do presente diário", [
      { id: "enabled", label: "Ligado", kind: "check", value: data.settings.enabled, hint: "Desligado, o botão some do jogo." },
      {
        id: "resetOnMiss",
        label: "Faltou um dia, volta ao começo",
        kind: "check",
        value: data.settings.resetOnMiss,
        hint: "Desmarque para o ciclo continuar de onde parou.",
      },
      {
        id: "offsetHours",
        label: "Fuso do dia (horas)",
        kind: "number",
        value: data.settings.offsetHours,
        min: -CHECKIN_MAX_OFFSET,
        max: CHECKIN_MAX_OFFSET,
        hint: "-3 = o dia vira à meia-noite de Brasília.",
      },
    ]);
    if (!answer) return;
    const ok = await run(rulesButton, async () => {
      await ask("/api/admin/checkin/settings", {
        method: "POST",
        body: {
          enabled: answer.enabled === "true",
          resetOnMiss: answer.resetOnMiss === "true",
          offsetHours: Number(answer.offsetHours) || 0,
        },
      });
    });
    if (!ok) return;
    notify("Regras salvas.");
    await reload();
  }

  await reload();
}

function dayRow(day: CheckinDay, reload: () => Promise<void>): HTMLTableRowElement {
  const line = h("div", { class: "who-line" }, h("strong", { text: `Dia ${day.day}` }));
  if (!day.enabled) line.append(badge("banned", "desligado"));
  const who = h("div", { class: "who-cell" }, line);

  const send = async (control: HTMLElement, body: Record<string, unknown>, message: string) => {
    const ok = await run(control, async () => {
      await ask("/api/admin/checkin/day", { method: "POST", body: { id: day.id, ...body } });
    });
    if (!ok) return;
    notify(message);
    await reload();
  };

  const onOff = iconButton(
    day.enabled ? "lock" : "check",
    day.enabled ? "Tirar do ciclo" : "Voltar ao ciclo",
    () => void send(onOff, { enabled: !day.enabled }, day.enabled ? "Dia fora do ciclo." : "Dia de volta ao ciclo."),
    day.enabled ? "" : "good",
  );
  const remove = iconButton(
    "trash",
    "Apagar",
    () => {
      void (async () => {
        if (await askConfirm(`Apagar o dia ${day.day}?`, "O ciclo fica mais curto. Isso não pode ser desfeito.", "Apagar")) {
          await send(remove, { remove: true }, "Dia apagado.");
        }
      })();
    },
    "bad",
  );

  const itemName = day.rewardItem ? (gearList().find((item) => item.id === day.rewardItem)?.name ?? day.rewardItem) : "—";
  return h(
    "tr",
    {},
    cell(who),
    cell(day.rewardGold > 0 ? `🪙 ${num(day.rewardGold)}` : "—", "num"),
    cell(day.rewardDiamonds > 0 ? `💎 ${num(day.rewardDiamonds)}` : "—", "num"),
    cell(day.rewardXp > 0 ? short(day.rewardXp) : "—", "num"),
    cell(day.rewardItem ? (day.rewardItemCount > 1 ? `${day.rewardItemCount}× ${itemName}` : itemName) : "—"),
    cell(day.highlight ? "sim" : "—"),
    cell(h("div", { class: "actions" }, iconButton("brush", "Editar", () => void editDay(day, reload)), onOff, remove)),
  );
}

async function editDay(day: CheckinDay | null, reload: () => Promise<void>) {
  const itemOptions = [{ id: "", label: "Nenhum" }, ...gearList().map((item) => ({ id: item.id, label: item.name }))];
  const answer = await askForm(day ? `Editar o dia ${day.day}` : "Novo dia", [
    { id: "day", label: "Dia do ciclo", kind: "number", value: day?.day ?? 1, min: 1, max: CHECKIN_MAX_DAYS },
    { id: "rewardGold", label: "Ouro", kind: "number", value: day?.rewardGold ?? 0, min: 0 },
    { id: "rewardDiamonds", label: "Diamantes", kind: "number", value: day?.rewardDiamonds ?? 0, min: 0 },
    { id: "rewardXp", label: "XP", kind: "number", value: day?.rewardXp ?? 0, min: 0 },
    { id: "rewardItem", label: "Item", kind: "select", options: itemOptions, value: day?.rewardItem ?? "" },
    { id: "rewardItemCount", label: "Quantos itens", kind: "number", value: day?.rewardItemCount ?? 1, min: 1 },
    {
      id: "highlight",
      label: "Dia de destaque",
      kind: "check",
      value: day?.highlight ?? false,
      hint: "Aparece grande no painel do jogador (use no prêmio do fim do ciclo).",
    },
    { id: "enabled", label: "No ciclo", kind: "check", value: day?.enabled ?? true },
  ]);
  if (!answer) return;
  const body = {
    id: day?.id ?? 0,
    day: Number(answer.day) || 1,
    rewardGold: Number(answer.rewardGold) || 0,
    rewardDiamonds: Number(answer.rewardDiamonds) || 0,
    rewardXp: Number(answer.rewardXp) || 0,
    rewardItem: answer.rewardItem,
    rewardItemCount: Number(answer.rewardItemCount) || 1,
    highlight: answer.highlight === "true",
    enabled: answer.enabled === "true",
  };
  const ok = await run(null, async () => {
    await ask("/api/admin/checkin/day", { method: "POST", body });
  });
  if (!ok) return;
  notify(day ? "Dia salvo." : "Dia criado.");
  await reload();
}
