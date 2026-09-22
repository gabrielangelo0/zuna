CREATE TABLE "vocations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"hp_base" integer DEFAULT 150 NOT NULL,
	"hp_per_level" double precision DEFAULT 15 NOT NULL,
	"mana_base" integer DEFAULT 50 NOT NULL,
	"mana_per_level" double precision DEFAULT 10 NOT NULL,
	"attack_factor" double precision DEFAULT 1 NOT NULL,
	"magic_factor" double precision DEFAULT 1 NOT NULL,
	"armor_factor" double precision DEFAULT 1 NOT NULL,
	"families" text DEFAULT '' NOT NULL,
	"outfit" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "vocation" text DEFAULT '' NOT NULL;