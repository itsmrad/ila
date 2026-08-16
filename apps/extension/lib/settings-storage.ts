import { z } from 'zod';

/** One versioned record keeps migrations explicit as settings evolve. */
const SETTINGS_KEY = 'ila.agent.settings';

export const agentSettingsSchema = z
  .object({
    reasoning: z.boolean(),
    browserAgent: z.boolean(),
    memory: z.boolean(),
    skipConfirmation: z.boolean(),
  })
  .strict();

const storedAgentSettingsSchema = z
  .object({
    version: z.literal(1),
    settings: agentSettingsSchema,
    savedAt: z.number().int().nonnegative(),
  })
  .strict();

const agentSettingsPatchSchema = agentSettingsSchema.partial().strict();

export type AgentSettings = z.infer<typeof agentSettingsSchema>;
export type AgentSettingsPatch = z.infer<typeof agentSettingsPatchSchema>;

/**
 * Automation, memory, and confirmation bypass are opt-in. Reasoning is a
 * model capability and does not grant browser or data access, so it is on by
 * default.
 */
export const DEFAULT_AGENT_SETTINGS: Readonly<AgentSettings> = Object.freeze({
  reasoning: true,
  browserAgent: false,
  memory: false,
  skipConfirmation: false,
});

/** Small surface that is easy to replace with a fake in unit tests. */
export interface SettingsStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface AgentSettingsStore {
  load(): Promise<AgentSettings>;
  save(settings: AgentSettings): Promise<AgentSettings>;
  update(patch: AgentSettingsPatch): Promise<AgentSettings>;
  reset(): Promise<AgentSettings>;
}

function cloneDefaults(): AgentSettings {
  return { ...DEFAULT_AGENT_SETTINGS };
}

/** Validate untrusted input without ever weakening the safe defaults. */
export function parseAgentSettings(value: unknown): AgentSettings {
  const parsed = agentSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : cloneDefaults();
}

function browserStorageArea(): SettingsStorageArea | undefined {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return undefined;
  return chrome.storage.local as unknown as SettingsStorageArea;
}

/**
 * Build a settings repository around Chrome storage (or an injected fake).
 * A session-local copy is retained when the extension API is unavailable,
 * rejected, or over quota, so controls remain usable without claiming the
 * setting was durably written.
 */
export function createAgentSettingsStore(
  storage: SettingsStorageArea | undefined = browserStorageArea(),
): AgentSettingsStore {
  let fallback = cloneDefaults();
  let preferFallback = false;

  const load = async (): Promise<AgentSettings> => {
    if (!storage || preferFallback) return { ...fallback };
    try {
      const result = await storage.get(SETTINGS_KEY);
      const stored = storedAgentSettingsSchema.safeParse(result[SETTINGS_KEY]);
      if (!stored.success) return { ...fallback };
      fallback = stored.data.settings;
      return { ...fallback };
    } catch {
      preferFallback = true;
      return { ...fallback };
    }
  };

  const save = async (settings: AgentSettings): Promise<AgentSettings> => {
    const validated = parseAgentSettings(settings);
    fallback = validated;

    if (storage) {
      const record = {
        version: 1 as const,
        settings: validated,
        savedAt: Date.now(),
      };
      try {
        await storage.set({ [SETTINGS_KEY]: record });
        preferFallback = false;
      } catch {
        // Session fallback already contains the user's latest choice.
        preferFallback = true;
      }
    }
    return { ...validated };
  };

  return {
    load,
    save,
    async update(patch) {
      const validatedPatch = agentSettingsPatchSchema.safeParse(patch);
      if (!validatedPatch.success) return load();
      const current = await load();
      return save({ ...current, ...validatedPatch.data });
    },
    async reset() {
      fallback = cloneDefaults();
      if (storage) {
        try {
          await storage.remove(SETTINGS_KEY);
          preferFallback = false;
        } catch {
          // The defaults still apply for this session.
          preferFallback = true;
        }
      }
      return cloneDefaults();
    },
  };
}

const agentSettingsStore = createAgentSettingsStore();

export const loadAgentSettings = (): Promise<AgentSettings> =>
  agentSettingsStore.load();

export const saveAgentSettings = (
  settings: AgentSettings,
): Promise<AgentSettings> => agentSettingsStore.save(settings);

export const updateAgentSettings = (
  patch: AgentSettingsPatch,
): Promise<AgentSettings> => agentSettingsStore.update(patch);

export const resetAgentSettings = (): Promise<AgentSettings> =>
  agentSettingsStore.reset();
