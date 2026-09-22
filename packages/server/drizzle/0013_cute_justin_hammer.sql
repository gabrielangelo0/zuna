CREATE TABLE "account_checkin" (
	"account_id" integer PRIMARY KEY NOT NULL,
	"day" smallint DEFAULT 0 NOT NULL,
	"last_day" text DEFAULT '' NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkin_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"day" smallint DEFAULT 1 NOT NULL,
	"reward_gold" integer DEFAULT 0 NOT NULL,
	"reward_diamonds" integer DEFAULT 0 NOT NULL,
	"reward_xp" double precision DEFAULT 0 NOT NULL,
	"reward_item" text DEFAULT '' NOT NULL,
	"reward_item_count" integer DEFAULT 1 NOT NULL,
	"highlight" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_checkin" ADD CONSTRAINT "account_checkin_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;