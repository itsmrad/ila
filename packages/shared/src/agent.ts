import { z } from "zod";
import { pageContextSchema } from "./chat";

export const AGENT_LIMITS = {
  maxTaskChars: 4_000,
  maxSteps: 20,
  maxSelectorChars: 500,
  maxInputChars: 8_000,
  maxMemoryItems: 20,
  maxMemoryChars: 1_000,
} as const;

const selectorSchema = z.string().trim().min(1).max(AGENT_LIMITS.maxSelectorChars);
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
  z.object({ type: z.literal("click"), selector: selectorSchema }),
  z.object({
    type: z.literal("type"),
    selector: selectorSchema,
    text: z.string().max(AGENT_LIMITS.maxInputChars),
    clear: z.boolean().default(true),
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

export const memoryContextItemSchema = z.object({
  title: z.string().max(300),
  url: webUrlSchema,
  summary: z.string().max(AGENT_LIMITS.maxMemoryChars).optional(),
});

export const agentPlanRequestSchema = z.object({
  task: z.string().trim().min(1).max(AGENT_LIMITS.maxTaskChars),
  model: z.string().min(1).max(120).optional(),
  pageContext: pageContextSchema.optional(),
  /** Bounded current-page markup, treated as untrusted data by the planner. */
  pageSnapshot: z.string().max(12_000).optional(),
  memory: z.array(memoryContextItemSchema).max(AGENT_LIMITS.maxMemoryItems).optional(),
  reasoning: z.boolean().default(false),
});

export type AgentPlanRequest = z.infer<typeof agentPlanRequestSchema>;

export const agentPlanResponseSchema = z.object({
  plan: agentPlanSchema,
});

export type AgentPlanResponse = z.infer<typeof agentPlanResponseSchema>;

/**
 * Actions that can remove browser state or submit data always need an explicit
 * confirmation unless the user has enabled the local skip-confirmation mode.
 * This policy is computed by the extension and is never delegated to the model.
 */
export function actionRequiresConfirmation(action: BrowserAction): boolean {
  return action.type === "close_tab" || action.type === "click" || action.type === "type";
}
