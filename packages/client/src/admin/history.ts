import type { AdminLogResponse } from "@zuna/shared";
import { ask } from "./session.ts";
import { button, cell, frame, h, input, num, retitle, sheet, stamp } from "./ui.ts";

// Aba do histórico: tudo o que os administradores fizeram, do mais novo para o mais velho.

let query = "";
let searchTimer = 0;

export async function renderHistory(root: HTMLElement) {
  const box = frame("Histórico do painel", undefined, "scroll");
  const search = input(query, { width: "260px" });
  search.placeholder = "Filtrar por administrador, alvo ou ação";
  search.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      query = search.value.trim();
      void reload();
    }, 250);
  });

  const list = h("div");
  box.body.append(
    h(
      "div",
      { class: "row" },
      search,
      button("Atualizar", () => void reload()),
    ),
    list,
  );
  root.replaceChildren(box.root);

  async function reload() {
    const data = await ask<AdminLogResponse>(`/api/admin/log?q=${encodeURIComponent(query)}`);
    retitle(box.root, "Histórico do painel", `${num(data.entries.length)} registro(s)`, "scroll");
    list.replaceChildren(
      sheet(
        ["Quando", "Administrador", "Ação", "Alvo", "Detalhe"],
        data.entries.map((entry) =>
          h(
            "tr",
            {},
            cell(stamp(entry.at)),
            cell(h("strong", { text: entry.admin })),
            cell(entry.action),
            cell(entry.target),
            cell(entry.detail),
          ),
        ),
        "Nenhuma mudança registrada.",
      ),
    );
  }

  await reload();
}
