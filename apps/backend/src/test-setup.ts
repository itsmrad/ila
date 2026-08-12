import { randomBytes } from "node:crypto";

/**
 * Test bootstrap (loaded via `bunfig.toml` before any test file).
 *
 * `config/env` validates the environment at import time and is cached for the
 * whole process, so every variable the suite needs must be present before the
 * first module import.
 */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/ila_test";
process.env.BETTER_AUTH_URL ??= "http://localhost:4000";
process.env.BETTER_AUTH_SECRET ??= "0".repeat(32);
process.env.SECRETS_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
