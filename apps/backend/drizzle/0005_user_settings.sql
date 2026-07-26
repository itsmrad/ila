CREATE TABLE "userIntegration" (
	"userId" text NOT NULL,
	"app" text NOT NULL,
	"externalAccountId" text,
	"connectedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "userIntegration_userId_app_pk" PRIMARY KEY("userId","app")
);
--> statement-breakpoint
CREATE TABLE "userLlmKey" (
	"userId" text NOT NULL,
	"provider" text NOT NULL,
	"encryptedKey" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "userLlmKey_userId_provider_pk" PRIMARY KEY("userId","provider")
);
--> statement-breakpoint
ALTER TABLE "userIntegration" ADD CONSTRAINT "userIntegration_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userLlmKey" ADD CONSTRAINT "userLlmKey_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "userIntegration_userId_idx" ON "userIntegration" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "userLlmKey_userId_idx" ON "userLlmKey" USING btree ("userId");
