import { eq } from "drizzle-orm";
import {
  INTEGRATION_APPS,
  INTEGRATION_APP_LABELS,
  type IntegrationStatus,
} from "@ila/shared";
import { db } from "@/db";
import { userIntegration } from "@/db/settings.schema";

/**
 * Integration status for the settings UI.
 *
 * The backend is the only place that knows whether an app is connected; the
 * extension renders what it is told and never keeps its own copy of a
 * connection state (let alone a token).
 */
export async function listIntegrationStatuses(
  userId: string,
): Promise<IntegrationStatus[]> {
  const rows = await db
    .select({
      app: userIntegration.app,
      connectedAt: userIntegration.connectedAt,
    })
    .from(userIntegration)
    .where(eq(userIntegration.userId, userId));

  const connected = new Map(rows.map((row) => [row.app, row.connectedAt]));

  // Driven by the shared app list, so a newly supported app appears in the UI
  // as "not connected" without a schema change.
  return INTEGRATION_APPS.map((app) => {
    const connectedAt = connected.get(app);
    return {
      app,
      label: INTEGRATION_APP_LABELS[app],
      connected: Boolean(connectedAt),
      connectedAt: connectedAt ? connectedAt.toISOString() : null,
    };
  });
}
