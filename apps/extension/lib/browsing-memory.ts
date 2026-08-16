import { z } from 'zod';

const MEMORY_KEY = 'ila.browsing.memory';

export const BROWSING_MEMORY_LIMITS = Object.freeze({
  maxEntries: 100,
  retentionMs: 30 * 24 * 60 * 60 * 1000,
  maxTitleChars: 300,
  maxUrlChars: 2048,
  maxContextChars: 2_000,
});

export const browsingMemoryEntrySchema = z
  .object({
    url: z.string().url().max(BROWSING_MEMORY_LIMITS.maxUrlChars),
    title: z.string().min(1).max(BROWSING_MEMORY_LIMITS.maxTitleChars),
    context: z.string().max(BROWSING_MEMORY_LIMITS.maxContextChars).optional(),
    firstVisitedAt: z.number().int().nonnegative(),
    lastVisitedAt: z.number().int().nonnegative(),
    visitCount: z.number().int().positive(),
  })
  .strict();

const storedBrowsingMemorySchema = z
  .object({
    version: z.literal(1),
    entries: z
      .array(browsingMemoryEntrySchema)
      .max(BROWSING_MEMORY_LIMITS.maxEntries),
    savedAt: z.number().int().nonnegative(),
  })
  .strict();

export type BrowsingMemoryEntry = z.infer<typeof browsingMemoryEntrySchema>;

export interface PageVisitInput {
  url: string;
  title?: string;
  /** Plain page text or a short user-visible summary; never raw page state. */
  context?: string;
  visitedAt?: number;
}

export interface MemoryStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

const TRACKING_QUERY_KEYS = /^(?:utm_.+|fbclid|gclid|dclid|msclkid)$/i;
const SENSITIVE_QUERY_KEYS = /(?:auth|code|credential|email|key|pass|secret|session|signature|token)/i;

function cleanText(value: unknown, maxChars: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

/**
 * Accept only ordinary web pages and remove credentials, fragments, tracking
 * identifiers, and query values likely to contain secrets.
 */
export function sanitizeMemoryUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.username = '';
    url.password = '';
    url.hash = '';

    for (const key of new Set(url.searchParams.keys())) {
      if (TRACKING_QUERY_KEYS.test(key) || SENSITIVE_QUERY_KEYS.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();

    const sanitized = url.toString();
    return sanitized.length <= BROWSING_MEMORY_LIMITS.maxUrlChars
      ? sanitized
      : null;
  } catch {
    return null;
  }
}

/** Turn untrusted page metadata into a bounded memory record. */
export function sanitizePageVisit(
  visit: PageVisitInput,
  now = Date.now(),
): BrowsingMemoryEntry | null {
  const url = sanitizeMemoryUrl(visit.url);
  if (!url) return null;

  const parsedTime =
    typeof visit.visitedAt === 'number' &&
    Number.isInteger(visit.visitedAt) &&
    visit.visitedAt >= 0
      ? visit.visitedAt
      : now;
  const visitedAt = Math.min(parsedTime, now);
  const fallbackTitle = new URL(url).hostname;
  const title =
    cleanText(visit.title, BROWSING_MEMORY_LIMITS.maxTitleChars) ||
    fallbackTitle.slice(0, BROWSING_MEMORY_LIMITS.maxTitleChars);
  const context = cleanText(
    visit.context,
    BROWSING_MEMORY_LIMITS.maxContextChars,
  );

  return {
    url,
    title,
    ...(context ? { context } : {}),
    firstVisitedAt: visitedAt,
    lastVisitedAt: visitedAt,
    visitCount: 1,
  };
}

/**
 * Pure retention/deduplication pipeline. Newer visits win display metadata;
 * counts and the earliest retained timestamp are preserved.
 */
export function processBrowsingMemory(
  current: ReadonlyArray<BrowsingMemoryEntry>,
  visit?: PageVisitInput,
  now = Date.now(),
): BrowsingMemoryEntry[] {
  const cutoff = Math.max(0, now - BROWSING_MEMORY_LIMITS.retentionMs);
  const byUrl = new Map<string, BrowsingMemoryEntry>();

  const candidates: BrowsingMemoryEntry[] = [];
  for (const item of current) {
    const parsed = browsingMemoryEntrySchema.safeParse(item);
    if (!parsed.success) continue;
    const url = sanitizeMemoryUrl(parsed.data.url);
    if (!url || parsed.data.lastVisitedAt < cutoff) continue;
    const lastVisitedAt = Math.min(parsed.data.lastVisitedAt, now);
    const firstVisitedAt = Math.min(parsed.data.firstVisitedAt, lastVisitedAt);
    candidates.push({
      ...parsed.data,
      url,
      firstVisitedAt,
      lastVisitedAt,
    });
  }

  const nextVisit = visit ? sanitizePageVisit(visit, now) : null;
  if (nextVisit && nextVisit.lastVisitedAt >= cutoff) candidates.push(nextVisit);

  candidates.sort((a, b) => a.lastVisitedAt - b.lastVisitedAt);
  for (const candidate of candidates) {
    const previous = byUrl.get(candidate.url);
    if (!previous) {
      byUrl.set(candidate.url, candidate);
      continue;
    }

    const candidateIsNewer = candidate.lastVisitedAt >= previous.lastVisitedAt;
    const context = candidateIsNewer
      ? (candidate.context ?? previous.context)
      : (previous.context ?? candidate.context);
    byUrl.set(candidate.url, {
      url: candidate.url,
      title: candidateIsNewer ? candidate.title : previous.title,
      ...(context ? { context } : {}),
      firstVisitedAt: Math.min(
        previous.firstVisitedAt,
        candidate.firstVisitedAt,
      ),
      lastVisitedAt: Math.max(previous.lastVisitedAt, candidate.lastVisitedAt),
      visitCount: previous.visitCount + candidate.visitCount,
    });
  }

  return [...byUrl.values()]
    .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
    .slice(0, BROWSING_MEMORY_LIMITS.maxEntries);
}

function browserStorageArea(): MemoryStorageArea | undefined {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return undefined;
  return chrome.storage.local as unknown as MemoryStorageArea;
}

/** Storage-backed memory repository; inject a fake to test failure paths. */
export function createBrowsingMemoryStore(
  storage: MemoryStorageArea | undefined = browserStorageArea(),
) {
  let fallback: BrowsingMemoryEntry[] = [];
  let preferFallback = false;

  const persist = async (entries: BrowsingMemoryEntry[], now: number) => {
    fallback = entries;
    if (!storage) return;
    const record = { version: 1 as const, entries, savedAt: now };
    const validated = storedBrowsingMemorySchema.safeParse(record);
    if (!validated.success) return;
    try {
      await storage.set({ [MEMORY_KEY]: validated.data });
      preferFallback = false;
    } catch {
      // Keep the sanitized session fallback when persistence is unavailable.
      preferFallback = true;
    }
  };

  const list = async (now = Date.now()): Promise<BrowsingMemoryEntry[]> => {
    let source = fallback;
    if (storage && !preferFallback) {
      try {
        const result = await storage.get(MEMORY_KEY);
        const stored = storedBrowsingMemorySchema.safeParse(result[MEMORY_KEY]);
        if (stored.success) source = stored.data.entries;
      } catch {
        // Fall through to the session-local copy.
        preferFallback = true;
      }
    }
    const processed = processBrowsingMemory(source, undefined, now);
    fallback = processed;
    return processed.map((entry) => ({ ...entry }));
  };

  return {
    list,
    async process(
      visit: PageVisitInput,
      now = Date.now(),
    ): Promise<BrowsingMemoryEntry[]> {
      const current = await list(now);
      const processed = processBrowsingMemory(current, visit, now);
      await persist(processed, now);
      return processed.map((entry) => ({ ...entry }));
    },
    async clear(): Promise<void> {
      fallback = [];
      if (!storage) return;
      try {
        await storage.remove(MEMORY_KEY);
        preferFallback = false;
      } catch {
        // The current session is still cleared.
        preferFallback = true;
      }
    },
  };
}

const browsingMemoryStore = createBrowsingMemoryStore();

export const listBrowsingMemory = (now?: number) =>
  browsingMemoryStore.list(now);

export const processPageVisit = (visit: PageVisitInput, now?: number) =>
  browsingMemoryStore.process(visit, now);

export const clearBrowsingMemory = () => browsingMemoryStore.clear();
