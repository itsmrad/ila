DROP INDEX "chat_userId_updatedAt_idx";--> statement-breakpoint
CREATE INDEX "chat_userId_updatedAt_id_idx" ON "chat" USING btree ("userId","updatedAt","id");