CREATE TABLE "diamond_packs" (
	"id" text PRIMARY KEY NOT NULL,
	"price_cents" integer NOT NULL,
	"diamonds" integer NOT NULL,
	"bonus_percent" smallint DEFAULT 0 NOT NULL,
	"tag" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
