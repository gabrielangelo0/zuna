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
