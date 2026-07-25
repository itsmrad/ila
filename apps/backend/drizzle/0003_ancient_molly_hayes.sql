CREATE TABLE "apiRateLimit" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"windowStart" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"title" text NOT NULL,
	"model" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatMessage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chatId" uuid NOT NULL,
	"userId" text NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"sequence" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat" ADD CONSTRAINT "chat_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatMessage" ADD CONSTRAINT "chatMessage_chatId_chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatMessage" ADD CONSTRAINT "chatMessage_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_userId_updatedAt_idx" ON "chat" USING btree ("userId","updatedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "chatMessage_chatId_sequence_key" ON "chatMessage" USING btree ("chatId","sequence");--> statement-breakpoint
CREATE INDEX "chatMessage_userId_idx" ON "chatMessage" USING btree ("userId");