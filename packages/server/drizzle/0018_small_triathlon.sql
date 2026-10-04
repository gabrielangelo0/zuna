CREATE TABLE "account_vip" (
	"account_id" integer PRIMARY KEY NOT NULL,
	"last_chest_day" text DEFAULT '' NOT NULL,
	"total_chests" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vip_passes" (
	"id" text PRIMARY KEY NOT NULL,
	"tier" text NOT NULL,
	"days" smallint DEFAULT 30 NOT NULL,
	"price_diamonds" integer DEFAULT 275 NOT NULL,
	"tag" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vip_tiers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"rank" smallint DEFAULT 1 NOT NULL,
	"diamonds_per_day" integer DEFAULT 9 NOT NULL,
	"bonus_xp" double precision DEFAULT 0 NOT NULL,
	"bonus_gold" double precision DEFAULT 0 NOT NULL,
	"death_xp_factor" double precision DEFAULT 1 NOT NULL,
	"bag_slots" smallint DEFAULT 0 NOT NULL,
	"color" text DEFAULT '#e8b13a' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"chest_gold" integer DEFAULT 0 NOT NULL,
	"chest_diamonds" integer DEFAULT 0 NOT NULL,
	"chest_xp" double precision DEFAULT 0 NOT NULL,
	"chest_item" text DEFAULT '' NOT NULL,
	"chest_item_count" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "vip_tier" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "vip_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_vip" ADD CONSTRAINT "account_vip_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;