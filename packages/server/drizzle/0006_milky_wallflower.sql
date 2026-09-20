CREATE TABLE "game_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"start_text" text DEFAULT '' NOT NULL,
	"end_text" text DEFAULT '' NOT NULL,
	"win_text" text DEFAULT '' NOT NULL,
	"minutes" smallint DEFAULT 10 NOT NULL,
	"xp_multiplier" double precision DEFAULT 1 NOT NULL,
	"gold_multiplier" double precision DEFAULT 1 NOT NULL,
	"world_id" integer DEFAULT 0 NOT NULL,
	"auto_minutes" smallint DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"ends_with_waves" boolean DEFAULT false NOT NULL,
	"waves" text DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "item_overrides" (
	"item_id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" integer,
	"currency" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portals" (
	"id" serial PRIMARY KEY NOT NULL,
	"world_id" integer NOT NULL,
	"x" smallint NOT NULL,
	"y" smallint NOT NULL,
	"to_world_id" integer NOT NULL,
	"to_x" smallint NOT NULL,
	"to_y" smallint NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"min_level" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"world_id" integer NOT NULL,
	"x" smallint NOT NULL,
	"y" smallint NOT NULL,
	"loot" text NOT NULL,
	"gold" integer DEFAULT 0 NOT NULL,
	"diamonds" smallint DEFAULT 0 NOT NULL,
	"respawn_ms" integer DEFAULT 300000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_spawns" (
	"id" serial PRIMARY KEY NOT NULL,
	"world_id" integer NOT NULL,
	"x" smallint NOT NULL,
	"y" smallint NOT NULL,
	"monster" text NOT NULL,
	"amount" smallint DEFAULT 1 NOT NULL,
	"radius" smallint DEFAULT 3 NOT NULL,
	"respawn_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_tiles" (
	"world_id" integer NOT NULL,
	"x" smallint NOT NULL,
	"y" smallint NOT NULL,
	"ground" smallint NOT NULL,
	"object" smallint NOT NULL,
	CONSTRAINT "world_tiles_world_id_x_y_pk" PRIMARY KEY("world_id","x","y")
);
--> statement-breakpoint
CREATE TABLE "worlds" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"style" text DEFAULT 'campina' NOT NULL,
	"seed" integer NOT NULL,
	"width" smallint NOT NULL,
	"height" smallint NOT NULL,
	"spawn_x" smallint NOT NULL,
	"spawn_y" smallint NOT NULL,
	"town_radius" smallint DEFAULT 6 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"auto_spawns" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worlds_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "world_id" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "portals_world_idx" ON "portals" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "world_items_world_idx" ON "world_items" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "world_spawns_world_idx" ON "world_spawns" USING btree ("world_id");