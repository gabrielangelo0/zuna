CREATE TABLE "character_milestones" (
	"character_id" integer NOT NULL,
	"level" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_milestones_character_id_level_pk" PRIMARY KEY("character_id","level")
);
--> statement-breakpoint
CREATE TABLE "level_rewards" (
	"id" serial PRIMARY KEY NOT NULL,
	"level" integer DEFAULT 10 NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"reward_gold" integer DEFAULT 0 NOT NULL,
	"reward_diamonds" integer DEFAULT 0 NOT NULL,
	"reward_item" text DEFAULT '' NOT NULL,
	"reward_item_count" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character_milestones" ADD CONSTRAINT "character_milestones_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;