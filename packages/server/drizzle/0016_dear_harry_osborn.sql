ALTER TABLE "portals" ADD COLUMN "kind" text DEFAULT 'portal' NOT NULL;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "depth" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "pvp" text DEFAULT 'off' NOT NULL;