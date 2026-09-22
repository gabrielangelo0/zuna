ALTER TABLE "character_items" ADD COLUMN "count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "character_items" ADD COLUMN "position" integer DEFAULT -1 NOT NULL;--> statement-breakpoint
ALTER TABLE "gear_items" ADD COLUMN "stack" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "gear_items" ADD COLUMN "heal" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "gear_items" ADD COLUMN "restore" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "gear_items" ADD COLUMN "bag_slots" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "gear_items" ADD COLUMN "range" integer DEFAULT 1 NOT NULL;