import {
  ADMIN_MAX_SUMMON,
  CATALOG,
  MONSTERS,
  TEMPLE_X,
  TEMPLE_Y,
  type AdminCharacterInfo,
  type AdminDetailResponse,
  type MonsterKind,
} from "@zuna/shared";
import { ask, fail, notify, run } from "./session.ts";
import {
  askConfirm,
  badge,
  bar,
  block,
  button,
  cell,
  el,
  face,
  field,
  h,
  input,
  num,
  select,
  sheet,
  stamp,
  when,
} from "./ui.ts";

// Ficha do jogador: a conta, cada personagem e tudo que dá para fazer com eles.

const byKind = (kind: string) =>
  CATALOG.filter((item) => item.kind === kind).map((item) => ({ id: item.id, label: item.name }));
const OUTFITS = byKind("outfit");
const PETS = [{ id: "", label: "— nenhum —" }, ...byKind("pet")];
const MOUNTS = [{ id: "", label: "— nenhuma —" }, ...byKind("mount")];
const ITEMS = CATALOG.map((item) => ({ id: item.id, label: `${item.name} (${item.kind})` }));
const MONSTER_LIST = Object.entries(MONSTERS).map(([id, def]) => ({ id, label: def.name }));

let refreshList: () => Promise<void> = async () => {};

export function openPlayer(accountId: number, onChanged: () => Promise<void>) {
  refreshList = onChanged;
  void load(accountId);
}

function closeModal() {
  const modal = el("#modal");
  modal.hidden = true;
  modal.replaceChildren();
}

async function load(accountId: number) {
  try {
    const data = await ask<AdminDetailResponse>(`/api/admin/player?accountId=${accountId}`);
    render(data);
  } catch (error) {
    fail(error);
  }
}

function render(data: AdminDetailResponse) {
  const { account } = data;
  const reload = () => load(account.accountId);

  const badges = h("div", { class: "badges" });
  if (account.isAdmin) badges.append(badge("admin", "mestre"));
  if (account.banned) badges.append(badge("banned", "bloqueado"));
  if (data.characters.some((character) => character.online)) badges.append(badge("online", "online"));

  const head = h(
    "div",
    { class: "modal-head" },
    face(data.characters[0]?.outfit ?? ""),
    h("h2", { text: account.username }),
    badges,
    h("span", { class: "spacer" }),
    h("span", { class: "note", text: `conta criada em ${stamp(account.createdAt)}` }),
    button("Fechar", closeModal),
  );

  const body = h(
    "div",
    { class: "modal-body" },
    accountBlock(data, reload),
    itemsBlock(data, reload),
    ...data.characters.map((character) => characterBlock(character, reload)),
    data.purchases.length > 0 ? purchasesBlock(data) : null,
    historyBlock(data),
  );

  const modal = el("#modal");
  modal.replaceChildren(h("div", { class: "modal-card" }, head, body));
  modal.hidden = false;
  modal.onclick = (event) => {
    if (event.target === modal) closeModal();
  };
}

// ---------------------------------------------------------------- conta

function accountBlock(data: AdminDetailResponse, reload: () => Promise<void>) {
  const { account } = data;
  const box = block("Conta", undefined, "person");

  const diamonds = input(account.diamonds, { type: "number" });
  const password = input("", { type: "text" });
  password.placeholder = "nova senha";
  const reason = input(account.banReason, { type: "text", max: 120 });
  reason.placeholder = "motivo do bloqueio";

  const patch = async (control: HTMLElement, body: Record<string, unknown>, message: string) => {
    const ok = await run(control, () =>
      ask("/api/admin/account", { method: "POST", body: { accountId: account.accountId, ...body } }).then(() => undefined),
    );
    if (!ok) return;
    notify(message);
    await reload();
    await refreshList();
  };

  const saveDiamonds = button(
    "Salvar",
    () => void patch(saveDiamonds, { diamonds: Number(diamonds.value) }, "Diamantes salvos."),
    "good",
  );
  const savePassword = button("Trocar senha", () => {
    if (!password.value) {
      notify("Escreva a senha nova.", false);
      return;
    }
    void patch(savePassword, { password: password.value }, "Senha trocada.").then(() => (password.value = ""));
  });
  const toggleAdmin = button(
    account.isAdmin ? "Tirar mestre" : "Dar mestre",
    () => void patch(toggleAdmin, { isAdmin: !account.isAdmin }, "Acesso atualizado."),
  );
  const toggleBan = button(
    account.banned ? "Liberar conta" : "Bloquear conta",
    () =>
      void patch(
        toggleBan,
        { banned: !account.banned, banReason: reason.value },
        account.banned ? "Conta liberada." : "Conta bloqueada.",
      ),
    account.banned ? "" : "bad",
  );

  box.body.append(
    h(
      "div",
      { class: "fields" },
      field("diamantes", diamonds),
      field("senha nova", password),
      field("motivo do bloqueio", reason),
    ),
    h("div", { class: "actions" }, saveDiamonds, savePassword, toggleAdmin, toggleBan),
  );
  if (account.banned && account.banReason) {
    box.body.append(h("p", { class: "note", text: `Bloqueada: ${account.banReason}` }));
  }
  return box.root;
}

// ---------------------------------------------------------------- itens

function itemsBlock(data: AdminDetailResponse, reload: () => Promise<void>) {
  const box = block("Itens liberados", `${data.unlocks.length} item(ns)`, "box");
  const chips = h("div", { class: "chips" });

  const change = async (control: HTMLElement, body: Record<string, unknown>, message: string) => {
    const ok = await run(control, () =>
      ask("/api/admin/account", { method: "POST", body: { accountId: data.account.accountId, ...body } }).then(() => undefined),
    );
    if (!ok) return;
    notify(message);
    await reload();
  };

  for (const item of data.unlocks) {
    const remove = h("button", {
      type: "button",
      title: `Tirar ${item.name}`,
      text: "✕",
      onClick: () => void change(remove, { revoke: item.itemId }, `${item.name} foi retirado.`),
    });
    chips.append(h("span", { class: "chip-item" }, `${item.name}`, remove));
  }
  if (data.unlocks.length === 0) chips.append(h("span", { class: "note", text: "Nenhum item além dos gratuitos." }));

  const give = select([{ id: "", label: "Liberar item…" }, ...ITEMS], "");
  give.addEventListener("change", () => {
    if (!give.value) return;
    const chosen = give.value;
    give.value = "";
    void change(give, { unlock: chosen }, "Item liberado.");
  });

  box.body.append(chips, h("div", { class: "row" }, give));
  return box.root;
}

// ---------------------------------------------------------------- personagem

function characterBlock(character: AdminCharacterInfo, reload: () => Promise<void>) {
  const box = block(
    `Personagem · ${character.name}`,
    character.online ? "online agora" : `último acesso ${when(character.lastLoginAt)}`,
    "shield",
  );

  const fields = {
    name: input(character.name, { max: 16 }),
    level: input(character.level, { type: "number" }),
    xp: input(character.xp, { type: "number" }),
    gold: input(character.gold, { type: "number" }),
    kills: input(character.kills, { type: "number" }),
    x: input(character.x, { type: "number" }),
    y: input(character.y, { type: "number" }),
  };
  const outfit = select(OUTFITS, character.outfit);
  const pet = select(PETS, character.pet);
  const mount = select(MOUNTS, character.mount);

  const save = button(
    "Salvar personagem",
    () =>
      void (async () => {
        const body = {
          characterId: character.characterId,
          name: fields.name.value,
          level: Number(fields.level.value),
          xp: Number(fields.xp.value),
          gold: Number(fields.gold.value),
          kills: Number(fields.kills.value),
          x: Number(fields.x.value),
          y: Number(fields.y.value),
          outfit: outfit.value,
          pet: pet.value,
          mount: mount.value,
        };
        const ok = await run(save, () => ask("/api/admin/character", { method: "POST", body }).then(() => undefined));
        if (!ok) return;
        notify(`${character.name}: salvo.`);
        await reload();
        await refreshList();
      })(),
    "good",
  );

  // --- comandos de mestre (só valem com o personagem online)
  const command = async (control: HTMLElement, body: Record<string, unknown>) => {
    const ok = await run(control, async () => {
      const answer = await ask<{ message: string }>("/api/admin/command", {
        method: "POST",
        body: { characterId: character.characterId, ...body },
      });
      notify(answer.message);
    });
    if (ok) await reload();
  };

  const message = input("", { width: "220px", max: 160 });
  message.placeholder = "recado para o jogador";
  const send = button("Enviar recado", () => {
    if (!message.value.trim()) {
      notify("Escreva o recado.", false);
      return;
    }
    void command(send, { kind: "whisper", text: message.value }).then(() => (message.value = ""));
  });

  const monster = select(MONSTER_LIST, MONSTER_LIST[0]?.id ?? "");
  const howMany = input(1, { type: "number", width: "70px" });
  howMany.min = "1";
  howMany.max = String(ADMIN_MAX_SUMMON);
  const summon = button(
    "Invocar",
    () => void command(summon, { kind: "summon", monster: monster.value as MonsterKind, count: Number(howMany.value) }),
  );

  const minutes = input(10, { type: "number", width: "70px" });
  const mute = button("Silenciar", () => void command(mute, { kind: "mute", minutes: Number(minutes.value) }));
  const heal = button("Curar", () => void command(heal, { kind: "heal" }));
  const temple = button("Levar ao templo", () => void command(temple, { kind: "teleport", x: TEMPLE_X, y: TEMPLE_Y }));
  const kick = button(
    "Expulsar",
    () => void command(kick, { kind: "kick", text: "Um administrador tirou você do jogo." }),
    "bad",
  );

  const erase = button(
    "Apagar personagem",
    () => {
      void (async () => {
        const sure = await askConfirm(
          `Apagar ${character.name}?`,
          "O personagem some para sempre, com nível, ouro e itens. Isso não tem volta.",
          "Apagar",
        );
        if (!sure) return;
        const ok = await run(erase, () =>
          ask("/api/admin/character/delete", { method: "POST", body: { characterId: character.characterId } }).then(
            () => undefined,
          ),
        );
        if (!ok) return;
        notify(`${character.name} foi apagado.`);
        await reload();
        await refreshList();
      })();
    },
    "bad",
  );

  box.body.append(
    h(
      "div",
      { class: "fields" },
      field("nome", fields.name),
      field("nível", fields.level),
      field("experiência", fields.xp),
      field("ouro", fields.gold),
      field("caçadas", fields.kills),
      field("posição x", fields.x),
      field("posição y", fields.y),
      field("roupa", outfit),
      field("mascote", pet),
      field("montaria", mount),
    ),
    h(
      "div",
      { class: "row" },
      bar(character.hp, character.maxHp, "hp"),
      bar(character.mana, character.maxMana, "mana"),
      h("span", {
        class: "note",
        text: `faltam ${num(character.xpToNext)} de XP · poderes na barra: ${character.shortcuts.filter(Boolean).length}`,
      }),
    ),
    h("div", { class: "actions" }, save, heal, temple, kick, erase),
    h("div", { class: "row" }, message, send),
    h("div", { class: "row" }, monster, howMany, summon, minutes, mute),
    h("p", {
      class: "note",
      text: `criado em ${stamp(character.createdAt)} · curar, levar, expulsar, invocar e silenciar só funcionam com o jogador online`,
    }),
  );
  return box.root;
}

// ---------------------------------------------------------------- compras e histórico

function purchasesBlock(data: AdminDetailResponse) {
  const box = block("Compras", `${data.purchases.length} registro(s)`, "coin");
  box.body.append(
    sheet(
      ["Quando", "Item", "Preço"],
      data.purchases.map((buy) =>
        h(
          "tr",
          {},
          cell(stamp(buy.at)),
          cell(h("strong", { text: buy.name })),
          cell(`${num(buy.price)} ${buy.currency === "gold" ? "ouro" : "diamantes"}`, "num"),
        ),
      ),
    ),
  );
  return box.root;
}

function historyBlock(data: AdminDetailResponse) {
  const box = block("O que já mexeram nesta conta", undefined, "scroll");
  box.body.append(
    sheet(
      ["Quando", "Administrador", "Ação", "Detalhe"],
      data.log.map((entry) =>
        h("tr", {}, cell(stamp(entry.at)), cell(h("strong", { text: entry.admin })), cell(entry.action), cell(entry.detail)),
      ),
      "Nada foi mudado por aqui.",
    ),
  );
  return box.root;
}
