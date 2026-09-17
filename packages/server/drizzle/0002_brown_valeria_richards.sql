ALTER TABLE "characters" ADD COLUMN "kills" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "characters_level_idx" ON "characters" USING btree ("level","xp");--> statement-breakpoint
CREATE INDEX "characters_gold_idx" ON "characters" USING btree ("gold");--> statement-breakpoint
CREATE INDEX "characters_kills_idx" ON "characters" USING btree ("kills");