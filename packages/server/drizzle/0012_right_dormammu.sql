CREATE TABLE "character_quests" (
	"character_id" integer NOT NULL,
	"quest_id" integer NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"times" integer DEFAULT 0 NOT NULL,
	"ready_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_quests_character_id_quest_id_pk" PRIMARY KEY("character_id","quest_id")
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'kill' NOT NULL,
	"monster" text NOT NULL,
	"amount" integer DEFAULT 1 NOT NULL,
	"world_id" integer DEFAULT 0 NOT NULL,
	"min_level" integer DEFAULT 1 NOT NULL,
	"players" smallint DEFAULT 1 NOT NULL,
	"x" smallint DEFAULT 0 NOT NULL,
	"y" smallint DEFAULT 0 NOT NULL,
	"boss_scale" double precision DEFAULT 1 NOT NULL,
	"repeat_minutes" integer DEFAULT 0 NOT NULL,
	"reward_xp" double precision DEFAULT 0 NOT NULL,
	"reward_gold" integer DEFAULT 0 NOT NULL,
	"reward_item" text DEFAULT '' NOT NULL,
	"reward_item_count" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character_quests" ADD CONSTRAINT "character_quests_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;