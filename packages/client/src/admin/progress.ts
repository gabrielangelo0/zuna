import { XP_RATE_MAX, gearList, xpForLevel, type AdminProgressResponse, type LevelReward } from "@zuna/shared";
import { ask, notify, run } from "./session.ts";
import { askConfirm, askForm, badge, button, cell, frame, h, iconButton, num, retitle, sheet, short } from "./ui.ts";

// Aba de progressão: a taxa de XP do servidor e os baús de marco.
// Tudo vale na hora para quem está jogando.

/** Quantos monstros de `xp` cada um o jogador derruba para subir deste nível. */
function killsToLevel(level: number, monsterXp: number): number {
  return Math.ceil((xpForLevel(level + 1) - xpForLevel(level)) / monsterXp);
}

export async function renderProgress(root: HTMLElement) {
  const box = frame("Progressão", undefined, "level");
  const list = h("div");
  const curve = h("div", { class: "note" });
  const rateButton = button("Taxa de XP", () => void editRate());
  box.body.append(
    h(
      "div",
      { class: "row" },
      h("p", {
        class: "note",
        text: "O baú chega sozinho ao alcançar o nível. Quem já passou do nível recebe assim que entrar no jogo.",
      }),
      h("span", { class: "spacer" }),
      rateButton,
      button("Novo marco", () => void editReward(null, reload), "good"),
    ),
    curve,
    list,
  );
  root.replaceChildren(box.root);

  let data: AdminProgressResponse;

  async function reload() {
    data = await ask<AdminProgressResponse>("/api/admin/progress");
    retitle(
      box.root,
      "Progressão",
      `XP ×${data.settings.xpRate.toLocaleString("pt-BR")} · ${num(data.rewards.length)} marcos · ${num(data.given)} baús entregues`,
      "level",
    );
    // Régua da curva: o que o jogador precisa matar para subir, nos níveis que importam.
    const rate = data.settings.xpRate || 1;
    const bands: [number, number, string][] = [
      [10, 95, "Floresta"],
      [30, 230, "Deserto"],
      [50, 420, "Cripta"],
      [70, 950, "Covil"],
      [100, 1500, "Abismo"],
    ];
    curve.replaceChildren(
      h("strong", { text: "Mortes para subir de nível: " }),
      h("span", {
        text: bands
          .map(([level, xp, where]) => `nível ${level} ≈ ${num(killsToLevel(level, xp * rate))} (${where})`)
          .join(" · "),
      }),
    );
    list.replaceChildren(
      sheet(
        ["Nível", "Marco", "Ouro", "Diamantes", "Item", "Ações"],
        data.rewards.map((reward) => rewardRow(reward, reload)),
        "Nenhum marco.",
      ),
    );
  }

  async function editRate() {
    const answer = await askForm("Taxa de XP do servidor", [
      {
        id: "xpRate",
        label: "Multiplicador",
        kind: "number",
        value: data.settings.xpRate,
        min: 0,
        max: XP_RATE_MAX,
        step: "0.1",
        hint: "1 = normal. 2 = todo mundo sobe em metade do tempo. Vale para monstros, missões e presentes.",
      },
    ]);
    if (!answer) return;
    const ok = await run(rateButton, async () => {
      await ask("/api/admin/progress/settings", { method: "POST", body: { xpRate: Number(answer.xpRate.replace(",", ".")) } });
    });
    if (!ok) return;
    notify("Taxa de XP salva.");
    await reload();
  }

  await reload();
}

function rewardRow(reward: LevelReward, reload: () => Promise<void>): HTMLTableRowElement {
  const line = h("div", { class: "who-line" }, h("strong", { text: reward.name || `Nível ${reward.level}` }));
  if (!reward.enabled) line.append(badge("banned", "desligado"));
  const who = h("div", { class: "who-cell" }, line, h("small", { text: `${short(xpForLevel(reward.level))} de XP total` }));

  const send = async (control: HTMLElement, body: Record<string, unknown>, message: string) => {
    const ok = await run(control, async () => {
      await ask("/api/admin/progress/reward", { method: "POST", body: { id: reward.id, ...body } });
    });
    if (!ok) return;
    notify(message);
    await reload();
  };

  const onOff = iconButton(
    reward.enabled ? "lock" : "check",
    reward.enabled ? "Desligar (some do jogo)" : "Ligar",
    () => void send(onOff, { enabled: !reward.enabled }, reward.enabled ? "Marco desligado." : "Marco ligado."),
    reward.enabled ? "" : "good",
  );
  const remove = iconButton(
    "trash",
    "Apagar",
    () => {
      void (async () => {
        if (await askConfirm(`Apagar o marco do nível ${reward.level}?`, "Quem já recebeu continua com o prêmio.", "Apagar")) {
          await send(remove, { remove: true }, "Marco apagado.");
        }
      })();
    },
    "bad",
  );

  const itemName = reward.rewardItem ? (gearList().find((item) => item.id === reward.rewardItem)?.name ?? reward.rewardItem) : "";
  return h(
    "tr",
    {},
    cell(num(reward.level), "num"),
    cell(who),
    cell(reward.rewardGold > 0 ? `🪙 ${num(reward.rewardGold)}` : "—", "num"),
    cell(reward.rewardDiamonds > 0 ? `💎 ${num(reward.rewardDiamonds)}` : "—", "num"),
    cell(itemName ? (reward.rewardItemCount > 1 ? `${reward.rewardItemCount}× ${itemName}` : itemName) : "—"),
    cell(h("div", { class: "actions" }, iconButton("brush", "Editar", () => void editReward(reward, reload)), onOff, remove)),
  );
}

async function editReward(reward: LevelReward | null, reload: () => Promise<void>) {
  const itemOptions = [{ id: "", label: "Nenhum" }, ...gearList().map((item) => ({ id: item.id, label: item.name }))];
  const answer = await askForm(reward ? `Editar ${reward.name || `nível ${reward.level}`}` : "Novo marco", [
    { id: "level", label: "Nível", kind: "number", value: reward?.level ?? 10, min: 2, hint: "Só um baú por nível." },
    { id: "name", label: "Nome do marco", value: reward?.name ?? "" },
    { id: "rewardGold", label: "Ouro", kind: "number", value: reward?.rewardGold ?? 0, min: 0 },
    { id: "rewardDiamonds", label: "Diamantes", kind: "number", value: reward?.rewardDiamonds ?? 0, min: 0, hint: "O baú é por personagem: segure a mão." },
    { id: "rewardItem", label: "Item", kind: "select", options: itemOptions, value: reward?.rewardItem ?? "" },
    { id: "rewardItemCount", label: "Quantos itens", kind: "number", value: reward?.rewardItemCount ?? 1, min: 1 },
    { id: "enabled", label: "No jogo", kind: "check", value: reward?.enabled ?? true },
  ]);
  if (!answer) return;
  const body = {
    id: reward?.id ?? 0,
    level: Number(answer.level) || 2,
    name: answer.name.trim(),
    rewardGold: Number(answer.rewardGold) || 0,
    rewardDiamonds: Number(answer.rewardDiamonds) || 0,
    rewardItem: answer.rewardItem,
    rewardItemCount: Number(answer.rewardItemCount) || 1,
    enabled: answer.enabled === "true",
  };
  const ok = await run(null, async () => {
    await ask("/api/admin/progress/reward", { method: "POST", body });
  });
  if (!ok) return;
  notify(reward ? "Marco salvo." : "Marco criado.");
  await reload();
}
