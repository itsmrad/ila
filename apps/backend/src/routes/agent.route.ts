import { Router } from "express";
import {
  agentPlanRequestSchema,
  agentPlanResponseSchema,
} from "@ila/shared";
import { env } from "@/config/env";
import { AiUnavailableError } from "@/lib/ai";
import { route } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { authContext, requireAuth } from "@/middleware/require-auth";
import { createAgentPlan } from "@/services/agent-planner.service";

export const agentRouter: Router = Router();

agentRouter.use(requireAuth);

/**
 * Produce a validated, non-executing browser plan. Execution remains inside
 * the extension, where Chrome permissions and the user's confirmation policy
 * can be enforced independently of model output.
 */
agentRouter.post(
  "/plan",
  route({
    body: agentPlanRequestSchema,
    response: agentPlanResponseSchema,
    handler: async ({ body, req }) => {
      const { user } = authContext(req);
      if (!env.aiEnabled) throw new AiUnavailableError();

      await enforceRateLimit({
        bucket: "agent-plan",
        subject: user.id,
        max: env.CHAT_RATE_LIMIT_MAX,
        windowSeconds: env.CHAT_RATE_LIMIT_WINDOW_SECONDS,
      });

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(new Error("Agent planning timed out")),
        env.AI_REQUEST_TIMEOUT_MS,
      );
      timeout.unref?.();

      try {
        const plan = await createAgentPlan({
          task: body.task,
          ...(body.model ? { model: body.model } : {}),
          ...(body.pageContext ? { pageContext: body.pageContext } : {}),
          ...(body.pageSnapshot ? { pageSnapshot: body.pageSnapshot } : {}),
          ...(body.memory ? { memory: body.memory } : {}),
          reasoning: body.reasoning,
          signal: controller.signal,
        });
        return { plan };
      } finally {
        clearTimeout(timeout);
      }
    },
  }),
);
