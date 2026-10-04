CREATE TABLE "arena_dummies" (
	"id" serial PRIMARY KEY NOT NULL,
	"arena" text NOT NULL,
	"name" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"vocation" text DEFAULT '' NOT NULL,
	"power" double precision DEFAULT 1 NOT NULL,
	"skin" smallint DEFAULT 0 NOT NULL,
	"hair_color" smallint DEFAULT 0 NOT NULL,
	"outfit" text DEFAULT 'aventureiro' NOT NULL,
	"color_primary" smallint DEFAULT 0 NOT NULL,
	"color_secondary" smallint DEFAULT 0 NOT NULL,
	"color_detail" smallint DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arena_fights" (
	"id" serial PRIMARY KEY NOT NULL,
	"arena" text NOT NULL,
	"season" text NOT NULL,
	"challenger_id" integer NOT NULL,
	"challenger_name" text DEFAULT '' NOT NULL,
	"opponent_id" integer DEFAULT 0 NOT NULL,
	"dummy_id" integer DEFAULT 0 NOT NULL,
	"opponent_name" text DEFAULT '' NOT NULL,
	"seed" integer NOT NULL,
	"won" boolean DEFAULT false NOT NULL,
	"rating_delta" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arena_rewards" (
	"id" serial PRIMARY KEY NOT NULL,
	"arena" text DEFAULT '' NOT NULL,
	"from_rank" integer DEFAULT 1 NOT NULL,
	"to_rank" integer DEFAULT 1 NOT NULL,
	"gold" bigint DEFAULT 0 NOT NULL,
	"diamonds" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arena_snapshots" (
	"character_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"vocation" text DEFAULT '' NOT NULL,
	"gear_attack" integer DEFAULT 0 NOT NULL,
	"gear_defense" integer DEFAULT 0 NOT NULL,
	"gear_hp" integer DEFAULT 0 NOT NULL,
	"gear_mana" integer DEFAULT 0 NOT NULL,
	"skin" smallint DEFAULT 0 NOT NULL,
	"hair_color" smallint DEFAULT 0 NOT NULL,
	"outfit" text DEFAULT 'aventureiro' NOT NULL,
	"color_primary" smallint DEFAULT 0 NOT NULL,
	"color_secondary" smallint DEFAULT 0 NOT NULL,
	"color_detail" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arena_standings" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"arena" text NOT NULL,
	"season" text NOT NULL,
	"rating" integer DEFAULT 1000 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"entry_day" text DEFAULT '' NOT NULL,
	"entries_used" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arenas" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"min_level" integer DEFAULT 1 NOT NULL,
	"max_level" integer DEFAULT 0 NOT NULL,
	"free_entries" smallint DEFAULT 5 NOT NULL,
	"entry_price" integer DEFAULT 0 NOT NULL,
	"reward_gold" bigint DEFAULT 0 NOT NULL,
	"reward_xp" double precision DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "arena_snapshots" ADD CONSTRAINT "arena_snapshots_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_standings" ADD CONSTRAINT "arena_standings_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arena_dummies_arena_idx" ON "arena_dummies" USING btree ("arena");--> statement-breakpoint
CREATE INDEX "arena_fights_who_idx" ON "arena_fights" USING btree ("challenger_id","created_at");--> statement-breakpoint
CREATE INDEX "arena_snapshots_level_idx" ON "arena_snapshots" USING btree ("level");--> statement-breakpoint
CREATE INDEX "arena_standings_board_idx" ON "arena_standings" USING btree ("arena","season","rating");--> statement-breakpoint
CREATE INDEX "arena_standings_who_idx" ON "arena_standings" USING btree ("character_id","season");