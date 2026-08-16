import { Router } from "express";
import {
  agentPlanRequestSchema,
  agentPlanResponseSchema,
  agentNextRequestSchema,
  agentNextResponseSchema,
  agentAttachmentContextRequestSchema,
  agentAttachmentContextResponseSchema,
} from "@ila/shared";
import { env } from "@/config/env";
import { AiUnavailableError } from "@/lib/ai";
import { route } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { authContext, requireAuth } from "@/middleware/require-auth";
import {
  createAgentDecision,
  createAgentPlan,
} from "@/services/agent-planner.service";
import { extractAgentAttachmentContext } from "@/services/attachment-context.service";

export const agentRouter: Router = Router();

agentRouter.use(requireAuth);

/** Extract bounded document text for an attachment added to a paused run. */
agentRouter.post(
  "/attachment-context",
  route({
    body: agentAttachmentContextRequestSchema,
    response: agentAttachmentContextResponseSchema,
    handler: async ({ body, req }) => {
      const { user } = authContext(req);
      await enforceRateLimit({
        bucket: "agent-attachment-context",
        subject: user.id,
        max: env.CHAT_RATE_LIMIT_MAX,
        windowSeconds: env.CHAT_RATE_LIMIT_WINDOW_SECONDS,
      });
      return {
        attachmentContext: await extractAgentAttachmentContext(body.attachments) ?? "",
      };
    },
  }),
);

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
        env.AI_AGENT_REQUEST_TIMEOUT_MS,
      );
      timeout.unref?.();

      try {
        const extractedAttachmentContext = body.attachments?.length
          ? await extractAgentAttachmentContext(body.attachments)
          : undefined;
        const attachmentContext = body.attachmentContext ?? extractedAttachmentContext;
        const result = await createAgentPlan({
          task: body.task,
          ...(body.model ? { model: body.model } : {}),
          ...(body.pageContext ? { pageContext: body.pageContext } : {}),
          ...(body.pageSnapshot ? { pageSnapshot: body.pageSnapshot } : {}),
          ...(body.memory ? { memory: body.memory } : {}),
          ...(body.attachments?.length
            ? {
                attachmentMetadata: body.attachments.map(
                  ({ id, name, mediaType, size }) => ({ id, name, mediaType, size }),
                ),
              }
            : body.attachmentMetadata
              ? { attachmentMetadata: body.attachmentMetadata }
              : {}),
          ...(attachmentContext ? { attachmentContext } : {}),
          ...(body.humanInputResponses
            ? { humanInputResponses: body.humanInputResponses }
            : {}),
          reasoning: body.reasoning,
          signal: controller.signal,
        });
        return {
          ...result,
          ...(result.attachmentContext
            ? {}
            : attachmentContext
              ? { attachmentContext }
              : {}),
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  }),
);

/**
 * Decide one next action from a fresh browser observation. The extension calls
 * this after every action, making completion observable instead of assumed.
 */
agentRouter.post(
  "/next",
  route({
    body: agentNextRequestSchema,
    response: agentNextResponseSchema,
    handler: async ({ body, req }) => {
      const { user } = authContext(req);
      if (!env.aiEnabled) throw new AiUnavailableError();

      await enforceRateLimit({
        bucket: "agent-next",
        subject: user.id,
        max: env.CHAT_RATE_LIMIT_MAX * 10,
        windowSeconds: env.CHAT_RATE_LIMIT_WINDOW_SECONDS,
      });

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(new Error("Agent decision timed out")),
        env.AI_AGENT_REQUEST_TIMEOUT_MS,
      );
      timeout.unref?.();

      try {
        const decision = await createAgentDecision({
          task: body.task,
          ...(body.model ? { model: body.model } : {}),
          ...(body.pageContext ? { pageContext: body.pageContext } : {}),
          ...(body.pageSnapshot ? { pageSnapshot: body.pageSnapshot } : {}),
          ...(body.memory ? { memory: body.memory } : {}),
          ...(body.attachmentContext ? { attachmentContext: body.attachmentContext } : {}),
          ...(body.attachmentMetadata ? { attachmentMetadata: body.attachmentMetadata } : {}),
          ...(body.humanInputResponses
            ? { humanInputResponses: body.humanInputResponses }
            : {}),
          reasoning: body.reasoning,
          execution: body.execution,
          signal: controller.signal,
        });
        return { decision };
      } finally {
        clearTimeout(timeout);
      }
    },
  }),
);
