import { z } from "zod";
import { pageContextSchema } from "./chat";

export const AGENT_LIMITS = {
  maxTaskChars: 4_000,
  maxSteps: 20,
  maxSelectorChars: 500,
  maxTargetChars: 240,
  maxInputChars: 8_000,
  maxMemoryItems: 20,
  maxMemoryChars: 1_000,
  maxExecutionRecords: 20,
  maxAttachments: 5,
  maxAttachmentBytes: 10 * 1024 * 1024,
  maxAttachmentPayloadChars: 14_000_000,
  maxAttachmentContextChars: 6_000,
  maxHumanInputQuestions: 5,
  maxHumanInputResponses: 20,
} as const;

const selectorSchema = z.string().trim().min(1).max(AGENT_LIMITS.maxSelectorChars);
const targetSchema = z.string().trim().min(1).max(AGENT_LIMITS.maxTargetChars);
const webUrlSchema = z
  .string()
  .url()
  .max(2_048)
  .refine((value) => /^https?:\/\//i.test(value), "url must be an http(s) URL");

export const browserActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), url: webUrlSchema }),
  z.object({
    type: z.literal("open_tab"),
    url: webUrlSchema,
    active: z.boolean().default(true),
  }),
  z.object({ type: z.literal("close_tab") }),
  z.object({ type: z.literal("reload") }),
  z.object({ type: z.literal("back") }),
  z.object({ type: z.literal("forward") }),
  z.object({
    type: z.literal("click"),
    selector: selectorSchema,
    /** Human-readable accessible intent used if a generated selector is stale. */
    target: targetSchema.optional(),
  }),
  z.object({
    type: z.literal("type"),
    selector: selectorSchema,
    /** Human-readable accessible intent used if a generated selector is stale. */
    target: targetSchema.optional(),
    text: z.string().max(AGENT_LIMITS.maxInputChars),
    clear: z.boolean().default(true),
  }),
  z.object({
    type: z.literal("select"),
    selector: selectorSchema,
    target: targetSchema.optional(),
    value: z.string().trim().min(1).max(500),
  }),
  z.object({
    type: z.literal("check"),
    selector: selectorSchema,
    target: targetSchema.optional(),
    checked: z.boolean().default(true),
  }),
  z.object({
    type: z.literal("upload"),
    selector: selectorSchema,
    target: targetSchema.optional(),
    attachmentId: z.string().trim().min(1).max(64),
  }),
  z.object({
    type: z.literal("scroll"),
    direction: z.enum(["up", "down"]),
    amount: z.number().int().min(100).max(5_000).default(700),
  }),
  z.object({
    type: z.literal("extract"),
    selector: selectorSchema.optional(),
    kind: z.enum(["text", "links"]).default("text"),
  }),
  z.object({
    type: z.literal("wait"),
    milliseconds: z.number().int().min(100).max(10_000),
  }),
]);

export type BrowserAction = z.infer<typeof browserActionSchema>;

export const agentPlanStepSchema = z.object({
  id: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(160),
  action: browserActionSchema,
});

export type AgentPlanStep = z.infer<typeof agentPlanStepSchema>;

export const agentPlanSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  steps: z.array(agentPlanStepSchema).min(1).max(AGENT_LIMITS.maxSteps),
});

export type AgentPlan = z.infer<typeof agentPlanSchema>;

export const agentAttachmentMetadataSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  mediaType: z.string().trim().min(1).max(120),
  size: z.number().int().min(1).max(AGENT_LIMITS.maxAttachmentBytes),
});
export type AgentAttachmentMetadata = z.infer<typeof agentAttachmentMetadataSchema>;

export const agentAttachmentSchema = agentAttachmentMetadataSchema.extend({
  dataUrl: z.string()
    .max(AGENT_LIMITS.maxAttachmentPayloadChars)
    .refine(
      (value) => /^data:[^;,]+;base64,[A-Za-z0-9+/]*={0,2}$/i.test(value),
      "attachment must be a base64 data URL",
    ),
});
export type AgentAttachment = z.infer<typeof agentAttachmentSchema>;

const humanInputQuestionBaseSchema = z.object({
  id: z.string().trim().min(1).max(64),
  prompt: z.string().trim().min(1).max(500),
  required: z.boolean().default(true),
  placeholder: z.string().trim().min(1).max(160).optional(),
});

export const humanInputQuestionSchema = z.discriminatedUnion("type", [
  humanInputQuestionBaseSchema.extend({ type: z.literal("text") }),
  humanInputQuestionBaseSchema.extend({
    type: z.literal("single_choice"),
    options: z.array(z.string().trim().min(1).max(160)).min(2).max(8),
  }),
  humanInputQuestionBaseSchema.extend({
    type: z.literal("multiple_choice"),
    options: z.array(z.string().trim().min(1).max(160)).min(2).max(8),
  }),
  humanInputQuestionBaseSchema.extend({
    type: z.literal("file"),
    accept: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
  }),
  humanInputQuestionBaseSchema.extend({ type: z.literal("manual") }),
]);
export type HumanInputQuestion = z.infer<typeof humanInputQuestionSchema>;

export const humanInputRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(500).optional(),
  questions: z
    .array(humanInputQuestionSchema)
    .min(1)
    .max(AGENT_LIMITS.maxHumanInputQuestions),
}).superRefine((value, ctx) => {
  const ids = new Set<string>();
  value.questions.forEach((question, questionIndex) => {
    if (ids.has(question.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questions", questionIndex, "id"],
        message: "question ids must be unique",
      });
    }
    ids.add(question.id);
    if (question.type === "single_choice" || question.type === "multiple_choice") {
      if (new Set(question.options).size !== question.options.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", questionIndex, "options"],
          message: "question options must be unique",
        });
      }
    }
  });
});
export type HumanInputRequest = z.infer<typeof humanInputRequestSchema>;

export const humanInputResponseSchema = z.object({
  questionId: z.string().trim().min(1).max(64),
  prompt: z.string().trim().min(1).max(500),
  values: z.array(z.string().trim().min(1).max(1_000)).max(9).default([]),
  attachmentIds: z.array(z.string().trim().min(1).max(64)).max(AGENT_LIMITS.maxAttachments).optional(),
  acknowledged: z.boolean().optional(),
});
export type HumanInputResponse = z.infer<typeof humanInputResponseSchema>;

export const agentAttachmentContextRequestSchema = z.object({
  attachments: z.array(agentAttachmentSchema).min(1).max(AGENT_LIMITS.maxAttachments),
}).superRefine((value, ctx) => validateAttachmentPayload(value, ctx));

export const agentAttachmentContextResponseSchema = z.object({
  attachmentContext: z.string().max(AGENT_LIMITS.maxAttachmentContextChars),
});
export type AgentAttachmentContextRequest = z.infer<typeof agentAttachmentContextRequestSchema>;
export type AgentAttachmentContextResponse = z.infer<typeof agentAttachmentContextResponseSchema>;

export const memoryContextItemSchema = z.object({
  title: z.string().max(300),
  url: webUrlSchema,
  summary: z.string().max(AGENT_LIMITS.maxMemoryChars).optional(),
});
export type MemoryContextItem = z.infer<typeof memoryContextItemSchema>;

const agentPlanRequestBaseSchema = z.object({
  task: z.string().trim().min(1).max(AGENT_LIMITS.maxTaskChars),
  model: z.string().min(1).max(120).optional(),
  pageContext: pageContextSchema.optional(),
  /** Bounded current-page markup, treated as untrusted data by the planner. */
  pageSnapshot: z.string().max(12_000).optional(),
  memory: z.array(memoryContextItemSchema).max(AGENT_LIMITS.maxMemoryItems).optional(),
  attachments: z.array(agentAttachmentSchema).max(AGENT_LIMITS.maxAttachments).optional(),
  attachmentMetadata: z.array(agentAttachmentMetadataSchema).max(AGENT_LIMITS.maxAttachments).optional(),
  attachmentContext: z.string().max(AGENT_LIMITS.maxAttachmentContextChars).optional(),
  humanInputResponses: z
    .array(humanInputResponseSchema)
    .max(AGENT_LIMITS.maxHumanInputResponses)
    .optional(),
  reasoning: z.boolean().default(false),
});

function validateAttachmentPayload(
  value: { attachments?: AgentAttachment[] },
  ctx: z.RefinementCtx,
): void {
  const payloadChars = value.attachments?.reduce(
    (total, attachment) => total + attachment.dataUrl.length,
    0,
  ) ?? 0;
  if (payloadChars > AGENT_LIMITS.maxAttachmentPayloadChars) {
    ctx.addIssue({
      code: z.ZodIssueCode.too_big,
      type: "array",
      maximum: AGENT_LIMITS.maxAttachmentPayloadChars,
      inclusive: true,
      path: ["attachments"],
      message: "Combined attachment payload is too large",
    });
  }
}

export const agentPlanRequestSchema = agentPlanRequestBaseSchema.superRefine(
  validateAttachmentPayload,
);

export type AgentPlanRequest = z.infer<typeof agentPlanRequestSchema>;

export const agentPlanResponseSchema = z.object({
  plan: agentPlanSchema,
  attachmentContext: z.string().max(AGENT_LIMITS.maxAttachmentContextChars).optional(),
});

export type AgentPlanResponse = z.infer<typeof agentPlanResponseSchema>;

export const agentExecutionRecordSchema = z.object({
  step: agentPlanStepSchema,
  outcome: z.enum(["succeeded", "failed"]),
  pageUrl: webUrlSchema.optional(),
  error: z.string().trim().min(1).max(500).optional(),
});

export type AgentExecutionRecord = z.infer<typeof agentExecutionRecordSchema>;

export const agentNextRequestSchema = agentPlanRequestBaseSchema.extend({
  execution: z
    .array(agentExecutionRecordSchema)
    .max(AGENT_LIMITS.maxExecutionRecords)
    .default([]),
}).superRefine(validateAttachmentPayload);

export type AgentNextRequest = z.infer<typeof agentNextRequestSchema>;

export const agentDecisionSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("action"),
    step: agentPlanStepSchema,
  }),
  z.object({
    status: z.literal("complete"),
    summary: z.string().trim().min(1).max(500),
  }),
  z.object({
    status: z.literal("blocked"),
    summary: z.string().trim().min(1).max(500),
  }),
  z.object({
    status: z.literal("needs_input"),
    request: humanInputRequestSchema,
  }),
]);

export type AgentDecision = z.infer<typeof agentDecisionSchema>;

export const agentNextResponseSchema = z.object({ decision: agentDecisionSchema });
export type AgentNextResponse = z.infer<typeof agentNextResponseSchema>;

/**
 * Actions that can remove browser state or submit data always need an explicit
 * confirmation unless the user has enabled the local skip-confirmation mode.
 * This policy is computed by the extension and is never delegated to the model.
 */
export function actionRequiresConfirmation(action: BrowserAction): boolean {
  return (
    action.type === "close_tab" ||
    action.type === "click" ||
    action.type === "type" ||
    action.type === "select" ||
    action.type === "check" ||
    action.type === "upload"
  );
}
