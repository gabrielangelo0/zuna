import { ADMIN_PAGE_SIZE, CATALOG, type AdminPlayerRow, type AdminPlayersResponse, type AdminSort } from "@zuna/shared";
import { openPlayer } from "./detail.ts";
import { ask, notify, run, setAdminName } from "./session.ts";
import { badge, button, cell, day, face, frame, h, iconButton, input, num, retitle, select, sheet, when } from "./ui.ts";

// Aba dos jogadores: busca, ordena e edita direto na tabela; a ficha completa abre num clique.

const OUTFITS = CATALOG.filter((item) => item.kind === "outfit").map((item) => ({ id: item.id, label: item.name }));

const SORTS: { id: AdminSort; label: string }[] = [
  { id: "level", label: "Maior nível" },
  { id: "gold", label: "Mais ouro" },
  { id: "kills", label: "Mais caçadas" },
  { id: "recent", label: "Contas novas" },
  { id: "name", label: "Nome da conta" },
];

let query = "";
let sort: AdminSort = "level";
let offset = 0;
let searchTimer = 0;

export async function renderPlayers(root: HTMLElement) {
  const box = frame("Jogadores", undefined, "users");
  const search = input(query, { width: "240px" });
  search.placeholder = "Buscar por conta ou personagem";
  search.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      query = search.value.trim();
      offset = 0;
      void reload();
    }, 250);
  });

  const order = select(
    SORTS.map((item) => ({ id: item.id, label: item.label })),
    sort,
  );
  order.addEventListener("change", () => {
    sort = order.value as AdminSort;
    offset = 0;
    void reload();
  });

  const list = h("div");
  const pager = h("div", { class: "row" });
  box.body.append(
    h(
      "div",
      { class: "row" },
      search,
      order,
      button("Atualizar", () => void reload()),
      h("span", { class: "spacer" }),
      pager,
    ),
    list,
  );
  root.replaceChildren(box.root);

  async function reload() {
    const params = `q=${encodeURIComponent(query)}&sort=${sort}&limit=${ADMIN_PAGE_SIZE}&offset=${offset}`;
    const data = await ask<AdminPlayersResponse>(`/api/admin/players?${params}`);
    setAdminName(data.username);
    const shown = data.players.length;
    const first = shown === 0 ? 0 : data.offset + 1;

    retitle(box.root, "Jogadores", `${num(first)}–${num(data.offset + shown)} de ${num(data.total)}`, "users");

    pager.replaceChildren(
      button("‹ Anterior", () => {
        offset = Math.max(0, offset - ADMIN_PAGE_SIZE);
        void reload();
      }),
      button("Próxima ›", () => {
        offset += ADMIN_PAGE_SIZE;
        void reload();
      }),
    );
    (pager.firstElementChild as HTMLButtonElement).disabled = offset === 0;
    (pager.lastElementChild as HTMLButtonElement).disabled = data.offset + shown >= data.total;

    list.replaceChildren(
      sheet(
        ["Conta", "Personagem", "Nível", "Ouro", "Diamantes", "Caçadas", "Classe", "Ações"],
        data.players.map((player) => playerRow(player, reload)),
        "Nenhum jogador encontrado.",
      ),
    );
  }

  await reload();
}

function playerRow(player: AdminPlayerRow, reload: () => Promise<void>): HTMLTableRowElement {
  const pending: Record<string, number | string> = {};
  const has = player.characterId !== null;

  const line = h("div", { class: "who-line" }, h("strong", { text: player.username }));
  if (player.isAdmin) line.append(badge("admin", "mestre"));
  if (player.banned) line.append(badge("banned", "bloqueado"));
  if (player.online) line.append(badge("online", "online"));
  const who = h(
    "div",
    { class: "who-cell" },
    line,
    h("small", { title: `conta criada em ${day(player.createdAt)}`, text: `entrou ${when(player.lastLoginAt)}` }),
  );

  const numberCell = (value: number, key: string, wide = false) => {
    const node = input(value, { type: "number" });
    if (wide) node.className = "wide";
    node.min = "0";
    node.disabled = !has && key !== "diamonds";
    node.addEventListener("change", () => (pending[key] = Number(node.value)));
    return cell(node);
  };

  const outfit = select(OUTFITS, player.outfit);
  outfit.disabled = !has;
  outfit.addEventListener("change", () => (pending.outfit = outfit.value));

  const save = iconButton("check", "Salvar as mudanças da linha", () => void store(), "good");
  const actions = h(
    "div",
    { class: "actions" },
    iconButton("scroll", "Abrir a ficha completa", () => openPlayer(player.accountId, reload)),
    save,
    iconButton(
      "crown",
      player.isAdmin ? "Tirar o acesso de mestre" : "Tornar a conta mestre",
      () => void patchAccount({ isAdmin: !player.isAdmin }),
      player.isAdmin ? "good" : "",
    ),
    iconButton(
      "lock",
      player.banned ? "Liberar a conta" : "Bloquear a conta",
      () => void patchAccount({ banned: !player.banned }),
      player.banned ? "" : "bad",
    ),
  );

  async function store() {
    const { diamonds, ...character } = pending;
    const ok = await run(save, async () => {
      if (Object.keys(character).length > 0) {
        await ask("/api/admin/character", { method: "POST", body: { characterId: player.characterId, ...character } });
      }
      if (diamonds !== undefined) {
        await ask("/api/admin/account", { method: "POST", body: { accountId: player.accountId, diamonds } });
      }
    });
    if (!ok) return;
    notify(`${player.name || player.username}: salvo.`);
    await reload();
  }

  async function patchAccount(patch: Record<string, unknown>) {
    const ok = await run(save, () =>
      ask("/api/admin/account", { method: "POST", body: { accountId: player.accountId, ...patch } }).then(() => undefined),
    );
    if (!ok) return;
    notify(`${player.username}: atualizado.`);
    await reload();
  }

  return h(
    "tr",
    {},
    cell(who),
    cell(
      has
        ? h("span", { class: "cell-face" }, face(player.outfit), h("strong", { text: player.name }))
        : h("em", { text: "sem personagem" }),
    ),
    numberCell(player.level, "level"),
    numberCell(player.gold, "gold", true),
    numberCell(player.diamonds, "diamonds"),
    numberCell(player.kills, "kills"),
    cell(outfit),
    cell(actions),
  );
}
