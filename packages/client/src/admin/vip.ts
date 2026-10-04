import {
  VIP_MAX_BAG_SLOTS,
  VIP_MAX_BONUS,
  VIP_MAX_DAYS,
  VIP_MAX_PRICE,
  gearList,
  type AdminVipResponse,
  type VipPass,
  type VipTier,
} from "@zuna/shared";
import { ask, notify, run } from "./session.ts";
import { askConfirm, askForm, badge, button, cell, frame, h, iconButton, num, retitle, sheet } from "./ui.ts";

// Aba do VIP: os degraus (o que cada um dá) e os passes (o que está à venda).
//
// São duas listas porque são duas coisas: criar "Ouro 90 dias com desconto" sem separá-las
// obrigaria a duplicar as dez colunas de benefício, e duplicata de regra é onde nasce a
// divergência silenciosa.

const pct = (value: number) => `${Math.round(value * 100)}%`;

export async function renderVip(root: HTMLElement) {
  const box = frame("VIP", undefined, "crown");
  const degraus = h("div");
  const passes = h("div");
  const novoDegrau = button("Novo degrau", () => void editTier(null, reload), "good");
  const novoPasse = button("Novo passe", () => void editPass(null, null, reload), "good");
  box.body.append(
    h(
      "div",
      { class: "row" },
      h("p", {
        class: "note",
        text: "O passe é comprado com diamantes, não com dinheiro: o jogador recarrega pela loja e gasta aqui.",
      }),
      h("span", { class: "spacer" }),
      novoDegrau,
      novoPasse,
    ),
    h("h3", { text: "Degraus — o que cada um dá" }),
    degraus,
    h("h3", { text: "Passes — o que está à venda" }),
    passes,
  );
  root.replaceChildren(box.root);

  let data: AdminVipResponse;

  async function reload() {
    data = await ask<AdminVipResponse>("/api/admin/vip");
    const ativos = Object.values(data.active).reduce((soma, n) => soma + n, 0);
    retitle(
      box.root,
      "VIP",
      `${num(ativos)} ativos · ${num(data.sold)} passes em 30 dias · ${num(data.diamonds30d)} 💎`,
      "crown",
    );
    degraus.replaceChildren(
      sheet(
        ["Degrau", "XP / Ouro", "Morte", "Mochila", "Baú", "Ativos", "Ações"],
        data.tiers.map((tier) => tierRow(tier, data.active[tier.id] ?? 0, reload)),
        "Nenhum degrau.",
      ),
    );
    passes.replaceChildren(
      sheet(
        ["Passe", "Degrau", "Dias", "Preço", "Por dia", "Ações"],
        data.passes.map((pass) => passRow(pass, data.tiers, reload)),
        "Nenhum passe à venda.",
      ),
    );
  }

  async function editTier(tier: VipTier | null, after: () => Promise<void>) {
    await editTierForm(tier, after);
  }
  async function editPass(pass: VipPass | null, _t: null, after: () => Promise<void>) {
    await editPassForm(pass, data.tiers, after);
  }

  await reload();
}

async function editTierForm(tier: VipTier | null, reload: () => Promise<void>) {
  const itens = [{ id: "", label: "nenhum" }, ...gearList().map((item) => ({ id: item.id, label: item.name }))];
  const answer = await askForm(tier ? `Degrau ${tier.name}` : "Novo degrau de VIP", [
    { id: "id", label: "Chave", value: tier?.id ?? "", hint: tier ? "Não mude: é o que liga as contas a este degrau." : "Sem acento, ex.: ouro" },
    { id: "name", label: "Nome", value: tier?.name ?? "VIP Ouro" },
    { id: "description", label: "Descrição", value: tier?.description ?? "" },
    { id: "rank", label: "Posição", kind: "number", value: tier?.rank ?? 1, min: 1, max: 99, hint: "Maior = melhor. Define o que é subir e o que é descer." },
    {
      id: "diamondsPerDay",
      label: "Valor por dia (💎)",
      kind: "number",
      value: tier?.diamondsPerDay ?? 9,
      min: 1,
      max: VIP_MAX_PRICE,
      hint: "Só serve para converter o saldo de quem sobe de degrau. Baixar desvaloriza o prazo que os jogadores já têm.",
    },
    { id: "bonusXp", label: "Bônus de XP", kind: "number", value: tier?.bonusXp ?? 0.5, min: 0, max: VIP_MAX_BONUS, step: "0.05", hint: "0,5 = +50%. Vale só para XP de monstro." },
    { id: "bonusGold", label: "Bônus de ouro", kind: "number", value: tier?.bonusGold ?? 0.2, min: 0, max: VIP_MAX_BONUS, step: "0.05" },
    { id: "deathXpFactor", label: "Perda de XP na morte", kind: "number", value: tier?.deathXpFactor ?? 0.5, min: 0, max: 1, step: "0.05", hint: "1 = normal, 0,5 = metade, 0 = nenhuma." },
    { id: "bagSlots", label: "Espaços de mochila", kind: "number", value: tier?.bagSlots ?? 20, min: 0, max: VIP_MAX_BAG_SLOTS },
    { id: "color", label: "Cor do nome", value: tier?.color ?? "#e8b13a", hint: "Hexadecimal, ex.: #e8b13a. É o que faz o VIP ser visto pelos outros." },
    { id: "title", label: "Título na tela", value: tier?.title ?? "", hint: "Vazio = sem título acima do nome." },
    { id: "chestGold", label: "Baú: ouro", kind: "number", value: tier?.chestGold ?? 0, min: 0 },
    { id: "chestDiamonds", label: "Baú: diamantes", kind: "number", value: tier?.chestDiamonds ?? 0, min: 0 },
    { id: "chestXp", label: "Baú: XP", kind: "number", value: tier?.chestXp ?? 0, min: 0 },
    { id: "chestItem", label: "Baú: item", kind: "select", options: itens, value: tier?.chestItem ?? "" },
    { id: "chestItemCount", label: "Baú: quantos", kind: "number", value: tier?.chestItemCount ?? 1, min: 1, max: 1000 },
    { id: "enabled", label: "À venda", kind: "check", value: tier?.enabled ?? true },
  ]);
  if (!answer) return;
  const n = (v: string) => Number(v.replace(",", "."));
  const ok = await run(null, async () => {
    await ask("/api/admin/vip/tier", {
      method: "POST",
      body: {
        id: answer.id,
        name: answer.name,
        description: answer.description,
        rank: Number(answer.rank),
        diamondsPerDay: Number(answer.diamondsPerDay),
        bonusXp: n(answer.bonusXp),
        bonusGold: n(answer.bonusGold),
        deathXpFactor: n(answer.deathXpFactor),
        bagSlots: Number(answer.bagSlots),
        color: answer.color,
        title: answer.title,
        chestGold: Number(answer.chestGold),
        chestDiamonds: Number(answer.chestDiamonds),
        chestXp: Number(answer.chestXp),
        chestItem: answer.chestItem,
        chestItemCount: Number(answer.chestItemCount),
        enabled: answer.enabled === "true",
      },
    });
  });
  if (!ok) return;
  notify("Degrau salvo.");
  await reload();
}

async function editPassForm(pass: VipPass | null, tiers: VipTier[], reload: () => Promise<void>) {
  const answer = await askForm(pass ? `Passe ${pass.id}` : "Novo passe de VIP", [
    { id: "id", label: "Chave", value: pass?.id ?? "", hint: pass ? "Não mude." : "Sem acento, ex.: ouro-30" },
    { id: "tier", label: "Degrau", kind: "select", options: tiers.map((tier) => ({ id: tier.id, label: tier.name })), value: pass?.tier ?? tiers[0]?.id ?? "" },
    { id: "days", label: "Dias", kind: "number", value: pass?.days ?? 30, min: 1, max: VIP_MAX_DAYS },
    { id: "priceDiamonds", label: "Preço (💎)", kind: "number", value: pass?.priceDiamonds ?? 275, min: 1, max: VIP_MAX_PRICE },
    { id: "tag", label: "Destaque", value: pass?.tag ?? "", hint: 'Ex.: "Mais vendido". Vazio = sem destaque.' },
    { id: "sort", label: "Ordem", kind: "number", value: pass?.sort ?? 0, min: 0, max: 999 },
    { id: "enabled", label: "À venda", kind: "check", value: pass?.enabled ?? true },
  ]);
  if (!answer) return;
  const ok = await run(null, async () => {
    await ask("/api/admin/vip/pass", {
      method: "POST",
      body: {
        id: answer.id,
        tier: answer.tier,
        days: Number(answer.days),
        priceDiamonds: Number(answer.priceDiamonds),
        tag: answer.tag,
        sort: Number(answer.sort),
        enabled: answer.enabled === "true",
      },
    });
  });
  if (!ok) return;
  notify("Passe salvo.");
  await reload();
}

function tierRow(tier: VipTier, ativos: number, reload: () => Promise<void>): HTMLTableRowElement {
  const linha = h("div", { class: "who-line" }, h("strong", { text: tier.name, style: `color:${tier.color}` }));
  if (tier.title) linha.append(badge("good", tier.title));
  if (!tier.enabled) linha.append(badge("banned", "fora de venda"));
  const quem = h("div", { class: "who-cell" }, linha, h("small", { text: tier.description || `${tier.diamondsPerDay} 💎/dia` }));

  const remove = iconButton(
    "trash",
    "Apagar",
    () => {
      void (async () => {
        const aviso =
          ativos > 0
            ? `${ativos} conta(s) ainda têm este degrau — o servidor vai recusar. Desligue-o em vez de apagar.`
            : "Só dá para apagar degrau que ninguém tem e que nenhum passe vende.";
        if (!(await askConfirm(`Apagar o degrau ${tier.name}?`, aviso, "Apagar"))) return;
        const ok = await run(remove, async () => {
          await ask("/api/admin/vip/tier", { method: "POST", body: { id: tier.id, remove: true } });
        });
        if (!ok) return;
        notify("Degrau apagado.");
        await reload();
      })();
    },
    "bad",
  );

  return h(
    "tr",
    {},
    h("td", {}, quem),
    cell(`+${pct(tier.bonusXp)} / +${pct(tier.bonusGold)}`),
    cell(tier.deathXpFactor === 0 ? "não perde" : `${pct(tier.deathXpFactor)} da perda`),
    cell(`+${tier.bagSlots}`),
    cell(
      [tier.chestGold ? `${num(tier.chestGold)} ouro` : "", tier.chestDiamonds ? `${tier.chestDiamonds} 💎` : "", tier.chestItem]
        .filter(Boolean)
        .join(", ") || "vazio",
    ),
    cell(num(ativos)),
    h("td", {}, h("div", { class: "row" }, iconButton("edit", "Mudar", () => void editTierForm(tier, reload)), remove)),
  );
}

function passRow(pass: VipPass, tiers: VipTier[], reload: () => Promise<void>): HTMLTableRowElement {
  const tier = tiers.find((entry) => entry.id === pass.tier);
  const linha = h("div", { class: "who-line" }, h("strong", { text: pass.id }));
  if (pass.tag) linha.append(badge("good", pass.tag));
  if (!pass.enabled) linha.append(badge("banned", "fora de venda"));

  const remove = iconButton(
    "trash",
    "Apagar",
    () => {
      void (async () => {
        if (!(await askConfirm(`Apagar o passe ${pass.id}?`, "Quem já comprou continua com o prazo que tem.", "Apagar"))) return;
        const ok = await run(remove, async () => {
          await ask("/api/admin/vip/pass", { method: "POST", body: { id: pass.id, remove: true } });
        });
        if (!ok) return;
        notify("Passe apagado.");
        await reload();
      })();
    },
    "bad",
  );

  return h(
    "tr",
    {},
    h("td", {}, linha),
    cell(tier?.name ?? pass.tier),
    cell(String(pass.days)),
    cell(`${num(pass.priceDiamonds)} 💎`),
    cell(`${(pass.priceDiamonds / pass.days).toFixed(1)} 💎`),
    h("td", {}, h("div", { class: "row" }, iconButton("edit", "Mudar", () => void editPassForm(pass, tiers, reload)), remove)),
  );
}
