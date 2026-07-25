import { checkDatabase } from "@/db";
import { env } from "@/config/env";

export type ComponentStatus = "up" | "down" | "degraded";
export type OverallStatus = "healthy" | "degraded" | "unhealthy";

export interface ComponentHealth {
  status: ComponentStatus;
  latencyMs?: number;
  error?: string;
  /** Reserved for future dependency-specific metadata. */
  detail?: string;
}

export interface HealthReport {
  status: OverallStatus;
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  components: {
    server: ComponentHealth;
    database: ComponentHealth;
    // Future services (LLM providers, memory store, queue, cache) plug in here.
    [service: string]: ComponentHealth;
  };
}

const VERSION = process.env.npm_package_version ?? "0.0.0";

/**
 * Collect the health of every dependency. Designed to grow: register new
 * checks in the `components` map and the overall status rolls up automatically.
 */
export async function getHealthReport(): Promise<HealthReport> {
  const database = await checkDatabaseComponent();

  const components: HealthReport["components"] = {
    server: { status: "up" },
    database,
  };

  const statuses = Object.values(components).map((c) => c.status);
  const status: OverallStatus = statuses.every((s) => s === "up")
    ? "healthy"
    : statuses.some((s) => s === "down")
      ? "unhealthy"
      : "degraded";

  return {
    status,
    version: VERSION,
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    components,
  };
}

async function checkDatabaseComponent(): Promise<ComponentHealth> {
  const result = await checkDatabase();
  return result.ok
    ? { status: "up", latencyMs: result.latencyMs }
    : { status: "down", latencyMs: result.latencyMs, error: result.error };
}
