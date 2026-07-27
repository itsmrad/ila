import { z } from 'zod';
import { CHAT_LIMITS, type PageContext } from '@ila/shared';

/**
 * Tab metadata and the user's context selection.
 *
 * Stage 4 is metadata only: titles, URLs and favicons that the browser already
 * exposes through `chrome.tabs`. No page content is read, and no host
 * permissions are required for any of it.
 *
 * Only `http(s)` tabs are ever considered. `chrome://`, `file://` and extension
 * pages are dropped here — the single place tabs enter the app — so browser
 * internals and local paths cannot reach the backend or the model.
 */

/** A tab the user may share. */
export interface BrowserTab {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  active: boolean;
}

/** What the assistant is allowed to see. */
export const CONTEXT_MODES = ['none', 'current', 'window', 'custom'] as const;

export type ContextMode = (typeof CONTEXT_MODES)[number];

/** Longest URL the API contract accepts (`pageContextSchema`). */
const MAX_URL_CHARS = 2_048;
const MAX_TITLE_CHARS = 300;

/** Normalise one `chrome.tabs.Tab`, or `null` when it is not shareable. */
function toBrowserTab(tab: chrome.tabs.Tab): BrowserTab | null {
  if (typeof tab.id !== 'number' || !tab.url) return null;

  let url: URL;
  try {
    url = new URL(tab.url);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const href = url.toString();
  // Truncating a URL would produce a different (possibly invalid) address, so an
  // over-long one is dropped instead.
  if (href.length > MAX_URL_CHARS) return null;

  return {
    id: tab.id,
    title: tab.title?.slice(0, MAX_TITLE_CHARS) || url.hostname,
    url: href,
    ...(tab.favIconUrl?.startsWith('https://') ||
    tab.favIconUrl?.startsWith('http://')
      ? { favIconUrl: tab.favIconUrl }
      : {}),
    active: tab.active === true,
  };
}

/**
 * Shareable tabs in the focused window, in tab-strip order.
 *
 * Resolves to an empty array when the API is unavailable or the query fails, so
 * every caller has one code path instead of a try/catch.
 */
export async function queryWindowTabs(): Promise<BrowserTab[]> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return [];
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return tabs
      .map(toBrowserTab)
      .filter((tab): tab is BrowserTab => tab !== null);
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                 */
/* -------------------------------------------------------------------------- */

const STORAGE_PREFIX = 'ila.context.selection.';

/**
 * Only ids and URLs are stored — never titles, favicons, or anything read from
 * a page. Tab ids are not stable across browser restarts, so the URL is what
 * lets a selection survive one.
 */
const storedSelectionSchema = z.object({
  version: z.literal(1),
  mode: z.enum(CONTEXT_MODES),
  tabs: z
    .array(
      z.object({
        id: z.number().int().nonnegative(),
        url: z.string().max(MAX_URL_CHARS),
      }),
    )
    .max(CHAT_LIMITS.maxContextTabs),
});

export type StoredSelection = z.infer<typeof storedSelectionSchema>;

function keyFor(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

/** Restore the persisted selection, or `null` when absent/unreadable. */
export async function loadSelection(
  userId: string,
): Promise<StoredSelection | null> {
  try {
    const key = keyFor(userId);
    const stored = await chrome.storage.local.get(key);
    const parsed = storedSelectionSchema.safeParse(stored[key]);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Persist the selection. Failures are ignored: this is a convenience cache. */
export async function saveSelection(
  userId: string,
  selection: { mode: ContextMode; tabs: ReadonlyArray<BrowserTab> },
): Promise<void> {
  const payload: StoredSelection = {
    version: 1,
    mode: selection.mode,
    tabs: selection.tabs
      .slice(0, CHAT_LIMITS.maxContextTabs)
      .map((tab) => ({ id: tab.id, url: tab.url })),
  };

  try {
    await chrome.storage.local.set({ [keyFor(userId)]: payload });
  } catch {
    // Quota or extension-context errors must never break the UI.
  }
}

/**
 * Re-resolve a persisted custom selection against the tabs that exist now.
 *
 * Matching is by id first and URL second: after a browser restart every id is
 * different, but the restored tabs usually carry the same URLs.
 */
export function resolveStoredTabs(
  stored: ReadonlyArray<{ id: number; url: string }>,
  tabs: ReadonlyArray<BrowserTab>,
): number[] {
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const byUrl = new Map(tabs.map((tab) => [tab.url, tab]));

  const resolved = new Set<number>();
  for (const entry of stored) {
    const match = byId.get(entry.id) ?? byUrl.get(entry.url);
    if (match) resolved.add(match.id);
  }
  return [...resolved];
}

/* -------------------------------------------------------------------------- */
/* Request payload                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Build the `pageContext` for a chat request from a resolved selection.
 *
 * Returns `undefined` when nothing is shared, which keeps the field off the
 * request entirely rather than sending an empty object.
 */
export function toPageContext(
  mode: ContextMode,
  selectedTabs: ReadonlyArray<BrowserTab>,
): PageContext | undefined {
  if (mode === 'none' || selectedTabs.length === 0) return undefined;

  const active = selectedTabs.find((tab) => tab.active);
  const activePage = active
    ? { title: active.title, url: active.url }
    : undefined;

  // A single tab needs no list; the active-page fields already describe it.
  if (selectedTabs.length === 1) {
    const [only] = selectedTabs;
    return activePage ?? (only ? { title: only.title, url: only.url } : undefined);
  }

  return {
    ...activePage,
    tabs: selectedTabs
      .slice(0, CHAT_LIMITS.maxContextTabs)
      .map((tab) => ({ title: tab.title, url: tab.url })),
  };
}
