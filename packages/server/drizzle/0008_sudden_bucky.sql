CREATE TABLE "payment_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"pack" text NOT NULL,
	"method" text NOT NULL,
	"price_cents" integer NOT NULL,
	"diamonds" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"credited" integer DEFAULT 0 NOT NULL,
	"provider" text NOT NULL,
	"provider_id" text DEFAULT '' NOT NULL,
	"checkout_url" text DEFAULT '' NOT NULL,
	"pix_payload" text DEFAULT '' NOT NULL,
	"pix_expires_at" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "spent_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "payer_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_orders_account_idx" ON "payment_orders" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "payment_orders_provider_idx" ON "payment_orders" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "payment_orders_status_idx" ON "payment_orders" USING btree ("status","created_at");