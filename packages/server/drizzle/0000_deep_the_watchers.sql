CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"diamonds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"xp" double precision DEFAULT 0 NOT NULL,
	"hp" integer NOT NULL,
	"mana" integer NOT NULL,
	"gold" bigint DEFAULT 0 NOT NULL,
	"x" smallint NOT NULL,
	"y" smallint NOT NULL,
	"skin" smallint NOT NULL,
	"hair" smallint NOT NULL,
	"hair_color" smallint NOT NULL,
	"outfit" text NOT NULL,
	"color_primary" smallint NOT NULL,
	"color_secondary" smallint NOT NULL,
	"color_detail" smallint NOT NULL,
	"pet" text DEFAULT '' NOT NULL,
	"mount" text DEFAULT '' NOT NULL,
	"mounted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "characters_name_key_unique" UNIQUE("name_key")
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"character_id" integer,
	"item_id" text NOT NULL,
	"currency" text NOT NULL,
	"price" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unlocks" (
	"account_id" integer NOT NULL,
	"item_id" text NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unlocks_account_id_item_id_pk" PRIMARY KEY("account_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unlocks" ADD CONSTRAINT "unlocks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "characters_account_idx" ON "characters" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "purchases_account_idx" ON "purchases" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sessions_account_idx" ON "sessions" USING btree ("account_id");