import { Router } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import { route } from "@/lib/http";
import { auth } from "@/lib/auth";
import { UnauthorizedError } from "@/lib/errors";

export const sessionRouter: Router = Router();

const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  image: z.string().nullish(),
  username: z.string().nullish(),
  displayUsername: z.string().nullish(),
  createdAt: z.coerce.string(),
  updatedAt: z.coerce.string(),
});

const meResponseSchema = z.object({
  user: sessionUserSchema,
  session: z.object({
    id: z.string(),
    expiresAt: z.coerce.string(),
  }),
});

/**
 * Current authenticated user + session.
 * GET /api/session/me
 */
sessionRouter.get(
  "/me",
  route({
    response: meResponseSchema,
    handler: async ({ req }) => {
      const result = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });

      if (!result) throw new UnauthorizedError("No active session");

      return {
        user: {
          ...result.user,
          createdAt: result.user.createdAt.toISOString(),
          updatedAt: result.user.updatedAt.toISOString(),
        },
        session: {
          id: result.session.id,
          expiresAt: result.session.expiresAt.toISOString(),
        },
      };
    },
  }),
);
