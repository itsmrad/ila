import { z } from 'zod';

/**
 * Local-only UI preferences.
 *
 * Everything here is a non-sensitive display/behaviour choice, so
 * `chrome.storage.local` is the right home for it. Secrets and connection state
 * live on the backend (see `lib/settings-api.ts`).
 */

const STORAGE_KEY = 'ila.preferences';

const preferencesSchema = z.object({
  /** Whether a new session starts with the current tab shared as context. */
  attachContextByDefault: z.boolean(),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = {
  attachContextByDefault: true,
};

export async function loadPreferences(): Promise<Preferences> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const parsed = preferencesSchema.safeParse(stored[STORAGE_KEY]);
    return parsed.success ? parsed.data : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function savePreferences(
  preferences: Preferences,
): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: preferences });
  } catch {
    // Preferences are a convenience; a storage failure must not break the UI.
  }
}
