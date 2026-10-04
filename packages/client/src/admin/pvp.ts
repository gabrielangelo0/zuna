import {
  PVP_MAX_DROP_SLOTS,
  PVP_MAX_LEVEL,
  PVP_MAX_MINUTES,
  PVP_MAX_RATIO,
  type AdminPvpKill,
  type AdminPvpResponse,
} from "@zuna/shared";
import { ask, notify, run } from "./session.ts";
import { askForm, badge, button, cell, frame, h, num, retitle, sheet } from "./ui.ts";

// Aba do PvP: as regras do combate entre jogadores e as últimas mortes.
//
// A lista de mortes existe porque a queda de item gera disputa. Sem ela, "me mataram em zona
// segura" e "perdi um item que comprei" não têm resposta.

function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export async function renderPvp(root: HTMLElement) {
  const box = frame("Combate entre jogadores", undefined, "sword");
  const regras = h("div", { class: "note" });
  const lista = h("div");
  const botao = button("Mudar as regras", () => void editar());
  const chave = button("", () => void alternar());
  box.body.append(
    h(
      "div",
      { class: "row" },
      h("p", {
        class: "note",
        text: "O PvP só vale em mundo marcado como zona de PvP e fora da praça. Marque o mundo na aba Mapas.",
      }),
      h("span", { class: "spacer" }),
      chave,
      botao,
    ),
    regras,
    lista,
  );
  root.replaceChildren(box.root);

  let data: AdminPvpResponse;

  async function reload() {
    data = await ask<AdminPvpResponse>("/api/admin/pvp");
    const s = data.settings;
    retitle(
      box.root,
      "Combate entre jogadores",
      s.enabled ? `ligado · ${num(data.kills.length)} mortes recentes` : "desligado no servidor inteiro",
      "sword",
    );
    chave.textContent = s.enabled ? "Desligar o PvP" : "Ligar o PvP";
    chave.className = s.enabled ? "btn bad" : "btn good";
    regras.replaceChildren(
      h("strong", { text: "Em vigor: " }),
      h("span", {
        text:
          `a partir do nível ${s.minLevel} · faixa de até ${s.levelRatio.toLocaleString("pt-BR")}× de diferença · ` +
          `marca de ${s.markMinutes} min · revide livre por ${s.retaliationMinutes} min · ` +
          `${s.dropSlots} casa(s) da mochila caem (o marcado perde uma a mais)`,
      }),
      h("br"),
      h("small", {
        class: "note",
        text: "Equipamento vestido nunca cai, e item comprado com diamante nunca cai. O Amuleto de Proteção salva tudo.",
      }),
    );
    lista.replaceChildren(
      sheet(["Quando", "Matou", "Morreu", "Mundo", "Caiu"], data.kills.map(killRow), "Nenhuma morte em PvP registrada."),
    );
  }

  async function alternar() {
    const ok = await run(chave, async () => {
      await ask("/api/admin/pvp/settings", { method: "POST", body: { enabled: !data.settings.enabled } });
    });
    if (!ok) return;
    notify(data.settings.enabled ? "PvP desligado." : "PvP ligado.");
    await reload();
  }

  async function editar() {
    const s = data.settings;
    const answer = await askForm("Regras do combate entre jogadores", [
      {
        id: "minLevel",
        label: "Nível mínimo",
        kind: "number",
        value: s.minLevel,
        min: 1,
        max: PVP_MAX_LEVEL,
        hint: "Abaixo disso o jogador não ataca e não é atacado.",
      },
      {
        id: "levelRatio",
        label: "Faixa de nível",
        kind: "number",
        value: s.levelRatio,
        min: 1,
        max: PVP_MAX_RATIO,
        step: "0.1",
        hint: "1,5 = ninguém pode estar 50% acima do outro. É porcentagem porque o nível não tem teto.",
      },
      {
        id: "markMinutes",
        label: "Marca de agressor (minutos)",
        kind: "number",
        value: s.markMinutes,
        min: 0,
        max: PVP_MAX_MINUTES,
        hint: "Quem ataca sem ser atacado fica marcado e pode ser batido por qualquer um, fora da faixa.",
      },
      {
        id: "retaliationMinutes",
        label: "Janela de revide (minutos)",
        kind: "number",
        value: s.retaliationMinutes,
        min: 0,
        max: PVP_MAX_MINUTES,
        hint: "Depois de apanhar, o jogador bate de volta sem virar agressor.",
      },
      {
        id: "dropSlots",
        label: "Casas da mochila que caem",
        kind: "number",
        value: s.dropSlots,
        min: 0,
        max: PVP_MAX_DROP_SLOTS,
        hint: "Sorteadas entre as casas ocupadas. O marcado perde uma a mais.",
      },
    ]);
    if (!answer) return;
    const ok = await run(botao, async () => {
      await ask("/api/admin/pvp/settings", {
        method: "POST",
        body: {
          minLevel: Number(answer.minLevel),
          levelRatio: Number(answer.levelRatio.replace(",", ".")),
          markMinutes: Number(answer.markMinutes),
          retaliationMinutes: Number(answer.retaliationMinutes),
          dropSlots: Number(answer.dropSlots),
        },
      });
    });
    if (!ok) return;
    notify("Regras salvas.");
    await reload();
  }

  await reload();
}

function killRow(kill: AdminPvpKill): HTMLTableRowElement {
  const quem = h("div", { class: "who-line" }, h("strong", { text: kill.killerName || "?" }));
  if (kill.markedKiller) quem.append(badge("banned", "marcado"));
  const caiu = kill.droppedItems ? kill.droppedItems.split(",").filter(Boolean) : [];
  return h(
    "tr",
    {},
    cell(quando(kill.createdAt)),
    h("td", {}, quem),
    cell(kill.victimName || "?"),
    cell(String(kill.worldId)),
    cell(caiu.length === 0 ? "nada" : caiu.join(", ")),
  );
}
