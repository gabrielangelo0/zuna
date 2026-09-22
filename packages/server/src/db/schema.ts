import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Depois de mudar este arquivo: npm run db:generate -w @zuna/server (gera a migração em drizzle/).

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  /** Sempre minúsculo. */
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** Moeda premium: fica na conta e vale para todos os personagens. */
  diamonds: integer("diamonds").notNull().default(0),
  /** Acesso ao painel de administração. */
  isAdmin: boolean("is_admin").notNull().default(false),
  /** Conta bloqueada: não entra no jogo nem no painel. */
  banned: boolean("banned").notNull().default(false),
  /** Motivo do bloqueio, mostrado a quem tenta entrar. */
  banReason: text("ban_reason").notNull().default(""),
  /** Total já pago em dinheiro, em centavos (0 = nunca comprou: a primeira recarga vale em dobro). */
  spentCents: integer("spent_cents").notNull().default(0),
  /** Cliente desta conta na Asaas. O CPF fica só lá, nunca aqui. */
  payerId: text("payer_id").notNull().default(""),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 do token: o token em si nunca é guardado. */
    tokenHash: text("token_hash").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("sessions_account_idx").on(table.accountId)],
);

export const characters = pgTable(
  "characters",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Nome em minúsculas, para garantir que não existam "Joao" e "joao". */
    nameKey: text("name_key").notNull().unique(),
    level: integer("level").notNull().default(1),
    xp: doublePrecision("xp").notNull().default(0),
    hp: integer("hp").notNull(),
    mana: integer("mana").notNull(),
    gold: bigint("gold", { mode: "number" }).notNull().default(0),
    /** Monstros derrubados: entra no ranking de caçadas. */
    kills: integer("kills").notNull().default(0),
    /** Poderes na barra de atalhos, separados por vírgula (slot vazio = nada). */
    shortcuts: text("shortcuts").notNull().default(""),
    x: smallint("x").notNull(),
    y: smallint("y").notNull(),
    skin: smallint("skin").notNull(),
    hairColor: smallint("hair_color").notNull(),
    outfit: text("outfit").notNull(),
    colorPrimary: smallint("color_primary").notNull(),
    colorSecondary: smallint("color_secondary").notNull(),
    colorDetail: smallint("color_detail").notNull(),
    pet: text("pet").notNull().default(""),
    mount: text("mount").notNull().default(""),
    mounted: boolean("mounted").notNull().default(false),
    /** Mundo onde o personagem estava ao sair (0 = o mundo padrão). */
    worldId: integer("world_id").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (table) => [
    index("characters_account_idx").on(table.accountId),
    // Rankings: nível/experiência, ouro e caçadas.
    index("characters_level_idx").on(table.level, table.xp),
    index("characters_gold_idx").on(table.gold),
    index("characters_kills_idx").on(table.kills),
  ],
);

/** Itens desbloqueados (roupas, mascotes, montarias). Valem para a conta inteira. */
export const unlocks = pgTable(
  "unlocks",
  {
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.itemId] })],
);

/** Tudo que um administrador muda fica registrado aqui. */
export const adminActions = pgTable(
  "admin_actions",
  {
    id: serial("id").primaryKey(),
    /** Conta do administrador que fez a mudança. */
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Conta afetada. */
    targetAccountId: integer("target_account_id").references(() => accounts.id, { onDelete: "set null" }),
    /** Personagem afetado, quando a mudança foi num personagem. */
    targetCharacterId: integer("target_character_id").references(() => characters.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    /** O que mudou, em JSON. */
    detail: text("detail").notNull().default(""),
    createdAt: createdAt(),
  },
  (table) => [index("admin_actions_created_idx").on(table.createdAt)],
);

/** Registro de toda compra: base para suporte, reembolso e detecção de fraude. */
export const purchases = pgTable(
  "purchases",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    characterId: integer("character_id").references(() => characters.id, { onDelete: "set null" }),
    itemId: text("item_id").notNull(),
    currency: text("currency").notNull(),
    price: integer("price").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("purchases_account_idx").on(table.accountId)],
);

// ---------------------------------------------------------------- mundos
// As tabelas de mundo guardam só o que foi feito à mão no painel: o terreno em si
// continua sendo gerado pela semente, igual no servidor e no cliente.
// Os campos `world_id` são números simples (sem chave estrangeira): apagar um mundo
// limpa as linhas pelo repositório, e quem sobrar aponta para o mundo padrão.

export const worlds = pgTable("worlds", {
  id: serial("id").primaryKey(),
  /** Chave curta, sem acento. */
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  /** Gerador do terreno: campina, caverna, ilha ou vazio. */
  style: text("style").notNull().default("campina"),
  seed: integer("seed").notNull(),
  width: smallint("width").notNull(),
  height: smallint("height").notNull(),
  spawnX: smallint("spawn_x").notNull(),
  spawnY: smallint("spawn_y").notNull(),
  townRadius: smallint("town_radius").notNull().default(6),
  /** Fechado: ninguém entra e os portais para ele ficam trancados. */
  published: boolean("published").notNull().default(true),
  /** Espalha ninhos de monstro sozinho pelo terreno. */
  autoSpawns: boolean("auto_spawns").notNull().default(false),
  /** Onde os personagens novos nascem. Só um mundo é o padrão. */
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Tiles pintados à mão, por cima do terreno gerado. */
export const worldTiles = pgTable(
  "world_tiles",
  {
    worldId: integer("world_id").notNull(),
    x: smallint("x").notNull(),
    y: smallint("y").notNull(),
    ground: smallint("ground").notNull(),
    object: smallint("object").notNull(),
  },
  (table) => [primaryKey({ columns: [table.worldId, table.x, table.y] })],
);

/** Portais: ligam um ponto a outro, no mesmo mundo ou em outro. */
export const portals = pgTable(
  "portals",
  {
    id: serial("id").primaryKey(),
    worldId: integer("world_id").notNull(),
    x: smallint("x").notNull(),
    y: smallint("y").notNull(),
    toWorldId: integer("to_world_id").notNull(),
    toX: smallint("to_x").notNull(),
    toY: smallint("to_y").notNull(),
    name: text("name").notNull().default(""),
    /** Nível mínimo para atravessar (0 = livre). */
    minLevel: smallint("min_level").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [index("portals_world_idx").on(table.worldId)],
);

/** Ninhos de monstro colocados no editor. */
export const worldSpawns = pgTable(
  "world_spawns",
  {
    id: serial("id").primaryKey(),
    worldId: integer("world_id").notNull(),
    x: smallint("x").notNull(),
    y: smallint("y").notNull(),
    monster: text("monster").notNull(),
    /** Quantos ficam vivos ao mesmo tempo. */
    amount: smallint("amount").notNull().default(1),
    radius: smallint("radius").notNull().default(3),
    /** 0 usa o tempo padrão do monstro. */
    respawnMs: integer("respawn_ms").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [index("world_spawns_world_idx").on(table.worldId)],
);

/** Tesouros fixos no chão, que voltam sozinhos depois de alguém pegar. */
export const worldItems = pgTable(
  "world_items",
  {
    id: serial("id").primaryKey(),
    worldId: integer("world_id").notNull(),
    x: smallint("x").notNull(),
    y: smallint("y").notNull(),
    loot: text("loot").notNull(),
    gold: integer("gold").notNull().default(0),
    diamonds: smallint("diamonds").notNull().default(0),
    respawnMs: integer("respawn_ms").notNull().default(300000),
    createdAt: createdAt(),
  },
  (table) => [index("world_items_world_idx").on(table.worldId)],
);

/** Eventos montados no painel. */
export const gameEvents = pgTable("game_events", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  startText: text("start_text").notNull().default(""),
  endText: text("end_text").notNull().default(""),
  winText: text("win_text").notNull().default(""),
  minutes: smallint("minutes").notNull().default(10),
  xpMultiplier: doublePrecision("xp_multiplier").notNull().default(1),
  goldMultiplier: doublePrecision("gold_multiplier").notNull().default(1),
  /** 0 = em todos os mundos. */
  worldId: integer("world_id").notNull().default(0),
  /** Dispara sozinho a cada tantos minutos (0 = só no comando). */
  autoMinutes: smallint("auto_minutes").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
  endsWithWaves: boolean("ends_with_waves").notNull().default(false),
  /** Levas de monstros, em JSON. */
  waves: text("waves").notNull().default("[]"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** O que o painel mudou nos itens da loja. Sem linha, vale o preço de fábrica. */
export const itemOverrides = pgTable("item_overrides", {
  itemId: text("item_id").primaryKey(),
  name: text("name").notNull().default(""),
  description: text("description").notNull().default(""),
  price: integer("price"),
  currency: text("currency"),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Marcas do servidor: o que já rodou uma vez (ex.: o conteúdo inicial dos mundos). */
export const serverMeta = pgTable("server_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------- pagamentos

/** Pedidos de diamantes. Só vira diamante na conta quando a Asaas confirma o pagamento. */
export const paymentOrders = pgTable(
  "payment_orders",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    pack: text("pack").notNull(),
    /** pix ou card. */
    method: text("method").notNull(),
    priceCents: integer("price_cents").notNull(),
    /** Diamantes do pacote, sem o dobro da primeira recarga. */
    diamonds: integer("diamonds").notNull(),
    /** pending, paid, refunded ou canceled. */
    status: text("status").notNull().default("pending"),
    /** Diamantes que de fato entraram na conta. */
    credited: integer("credited").notNull().default(0),
    /** asaas, ou dev (pagamento de mentira, só em desenvolvimento). */
    provider: text("provider").notNull(),
    /** Id da cobrança na Asaas ("pay_..."). */
    providerId: text("provider_id").notNull().default(""),
    checkoutUrl: text("checkout_url").notNull().default(""),
    pixPayload: text("pix_payload").notNull().default(""),
    pixExpiresAt: text("pix_expires_at").notNull().default(""),
    createdAt: createdAt(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
  },
  (table) => [
    index("payment_orders_account_idx").on(table.accountId),
    index("payment_orders_provider_idx").on(table.providerId),
    index("payment_orders_status_idx").on(table.status, table.createdAt),
  ],
);

/** Pacotes de diamantes à venda. Nascem da lista de fábrica e depois são editados no painel. */
export const diamondPacks = pgTable("diamond_packs", {
  id: text("id").primaryKey(),
  priceCents: integer("price_cents").notNull(),
  diamonds: integer("diamonds").notNull(),
  bonusPercent: smallint("bonus_percent").notNull().default(0),
  tag: text("tag").notNull().default(""),
  enabled: boolean("enabled").notNull().default(true),
  /** Ordem na vitrine. */
  sort: smallint("sort").notNull().default(0),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------- equipamentos

/** Armas, escudos, elmos, armaduras e botas. Nascem da lista de fábrica e depois são editados no painel. */
export const gearItems = pgTable("gear_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** weapon, shield, helmet, armor ou boots. */
  slot: text("slot").notNull(),
  /** Quadro do atlas de ícones. */
  icon: text("icon").notNull(),
  rarity: text("rarity").notNull(),
  level: integer("level").notNull().default(1),
  attack: integer("attack").notNull().default(0),
  defense: integer("defense").notNull().default(0),
  hp: integer("hp").notNull().default(0),
  mana: integer("mana").notNull().default(0),
  priceGold: integer("price_gold").notNull().default(0),
  priceDiamonds: integer("price_diamonds").notNull().default(0),
  sellGold: integer("sell_gold").notNull().default(0),
  drops: boolean("drops").notNull().default(true),
  enabled: boolean("enabled").notNull().default(true),
  /** Quantos cabem num espaço (1 = não empilha). */
  stack: integer("stack").notNull().default(1),
  /** Poções: vida e mana recuperadas. */
  heal: integer("heal").notNull().default(0),
  restore: integer("restore").notNull().default(0),
  /** Mochilas: espaços a mais. */
  bagSlots: integer("bag_slots").notNull().default(0),
  /** Armas: alcance em tiles. */
  range: integer("range").notNull().default(1),
  createdAt: createdAt(),
});

/** Itens de cada personagem. `equipped` vazio = na mochila; senão, o espaço do corpo onde está. */
export const characterItems = pgTable(
  "character_items",
  {
    id: serial("id").primaryKey(),
    characterId: integer("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    equipped: text("equipped").notNull().default(""),
    /** Tamanho da pilha. */
    count: integer("count").notNull().default(1),
    /** Posição na grade da mochila (-1 = equipado ou ainda sem lugar). */
    position: integer("position").notNull().default(-1),
    createdAt: createdAt(),
  },
  (table) => [index("character_items_character_idx").on(table.characterId), index("character_items_item_idx").on(table.itemId)],
);

// ---------------------------------------------------------------- missões

/** Caçadas e desafios de chefe, montados no painel. */
export const quests = pgTable("quests", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  /** kill (caçada) ou boss (desafio em grupo). */
  kind: text("kind").notNull().default("kill"),
  monster: text("monster").notNull(),
  amount: integer("amount").notNull().default(1),
  /** 0 = qualquer mundo. */
  worldId: integer("world_id").notNull().default(0),
  minLevel: integer("min_level").notNull().default(1),
  /** Chefe: jogadores necessários no altar e onde ele aparece. */
  players: smallint("players").notNull().default(1),
  x: smallint("x").notNull().default(0),
  y: smallint("y").notNull().default(0),
  bossScale: doublePrecision("boss_scale").notNull().default(1),
  repeatMinutes: integer("repeat_minutes").notNull().default(0),
  rewardXp: doublePrecision("reward_xp").notNull().default(0),
  rewardGold: integer("reward_gold").notNull().default(0),
  rewardItem: text("reward_item").notNull().default(""),
  rewardItemCount: integer("reward_item_count").notNull().default(1),
  enabled: boolean("enabled").notNull().default(true),
  sort: smallint("sort").notNull().default(0),
  createdAt: createdAt(),
});

/** O que cada personagem já fez de cada missão. */
export const characterQuests = pgTable(
  "character_quests",
  {
    characterId: integer("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    questId: integer("quest_id").notNull(),
    progress: integer("progress").notNull().default(0),
    /** Já pode entregar. */
    done: boolean("done").notNull().default(false),
    /** Quantas vezes entregou. */
    times: integer("times").notNull().default(0),
    /** Repetível: quando volta a valer. */
    readyAt: timestamp("ready_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.characterId, table.questId] })],
);

// ---------------------------------------------------------------- check-in diário

/** Os dias do ciclo do presente diário, montados no painel. */
export const checkinDays = pgTable("checkin_days", {
  id: serial("id").primaryKey(),
  /** Posição no ciclo (1 = primeiro dia). */
  day: smallint("day").notNull().default(1),
  rewardGold: integer("reward_gold").notNull().default(0),
  rewardDiamonds: integer("reward_diamonds").notNull().default(0),
  rewardXp: doublePrecision("reward_xp").notNull().default(0),
  rewardItem: text("reward_item").notNull().default(""),
  rewardItemCount: integer("reward_item_count").notNull().default(1),
  /** Dia de destaque (o prêmio bom do fim do ciclo). */
  highlight: boolean("highlight").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: createdAt(),
});

/** Em que ponto do ciclo cada conta está. Uma conta só pega um presente por dia. */
export const accountCheckin = pgTable("account_checkin", {
  accountId: integer("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  /** Dia do ciclo que ele pegou por último. */
  day: smallint("day").notNull().default(0),
  /** Chave do último dia pego ("2026-09-22"), no fuso configurado. */
  lastDay: text("last_day").notNull().default(""),
  /** Dias seguidos. */
  streak: integer("streak").notNull().default(0),
  /** Total de presentes abertos. */
  total: integer("total").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
