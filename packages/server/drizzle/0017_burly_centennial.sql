CREATE TABLE "pvp_kills" (
	"id" serial PRIMARY KEY NOT NULL,
	"killer_id" integer NOT NULL,
	"victim_id" integer NOT NULL,
	"killer_name" text DEFAULT '' NOT NULL,
	"victim_name" text DEFAULT '' NOT NULL,
	"world_id" integer DEFAULT 0 NOT NULL,
	"marked_killer" boolean DEFAULT false NOT NULL,
	"dropped_items" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character_items" ADD COLUMN "bound" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "marked_until" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "pvp_kills_victim_idx" ON "pvp_kills" USING btree ("victim_id");--> statement-breakpoint
CREATE INDEX "pvp_kills_at_idx" ON "pvp_kills" USING btree ("created_at");