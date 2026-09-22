CREATE TABLE "character_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"item_id" text NOT NULL,
	"equipped" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gear_items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slot" text NOT NULL,
	"icon" text NOT NULL,
	"rarity" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"attack" integer DEFAULT 0 NOT NULL,
	"defense" integer DEFAULT 0 NOT NULL,
	"hp" integer DEFAULT 0 NOT NULL,
	"mana" integer DEFAULT 0 NOT NULL,
	"price_gold" integer DEFAULT 0 NOT NULL,
	"price_diamonds" integer DEFAULT 0 NOT NULL,
	"sell_gold" integer DEFAULT 0 NOT NULL,
	"drops" boolean DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character_items" ADD CONSTRAINT "character_items_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "character_items_character_idx" ON "character_items" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "character_items_item_idx" ON "character_items" USING btree ("item_id");