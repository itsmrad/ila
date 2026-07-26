import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHAT_LIMITS, type PageContext } from '@ila/shared';
import {
  loadSelection,
  queryWindowTabs,
  resolveStoredTabs,
  saveSelection,
  toPageContext,
  type BrowserTab,
  type ContextMode,
} from './tab-context';
import { loadPreferences } from './prefs';

/**
 * The tabs the user can share and the selection they made.
 *
 * The tab list is refreshed from `chrome.tabs` on every relevant browser event;
 * the selection is restored from `chrome.storage.local` on mount and persisted
 * whenever it changes. When the tabs API is unavailable the hook resolves to an
 * empty list and `unavailable: true` so the UI can degrade instead of breaking.
 */
export interface TabContextState {
  tabs: BrowserTab[];
  activeTab: BrowserTab | null;
  mode: ContextMode;
  setMode: (mode: ContextMode) => void;
  /** Tab ids picked in `custom` mode. */
  customTabIds: number[];
  toggleTab: (tabId: number) => void;
  /** Tabs the current mode resolves to, capped to the contract's limit. */
  selectedTabs: BrowserTab[];
  /** Payload for a chat request, or `undefined` when nothing is shared. */
  pageContext: PageContext | undefined;
  /** True when the browser exposed no shareable tabs. */
  unavailable: boolean;
  refresh: () => void;
}

export function useTabContext(userId: string): TabContextState {
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<ContextMode>('current');
  const [customTabIds, setCustomTabIds] = useState<number[]>([]);
  const restored = useRef(false);

  const refresh = useCallback(() => {
    void queryWindowTabs().then((next) => {
      setTabs(next);
      setLoaded(true);
    });
  }, []);

  /* ------------------------------ tab tracking ---------------------------- */

  useEffect(() => {
    refresh();

    if (typeof chrome === 'undefined' || !chrome.tabs?.onActivated) return;

    const onUpdated = (
      _tabId: number,
      changeInfo: { url?: string; title?: string; favIconUrl?: string },
    ) => {
      // Ignore the noisy intermediate events (status, audible, …).
      if (changeInfo.url || changeInfo.title || changeInfo.favIconUrl) refresh();
    };

    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onCreated.addListener(refresh);
    chrome.tabs.onRemoved.addListener(refresh);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(refresh);
      chrome.tabs.onCreated.removeListener(refresh);
      chrome.tabs.onRemoved.removeListener(refresh);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [refresh]);

  /* --------------------------- restore + persist -------------------------- */

  // Runs once the first tab list is in: a stored custom selection can only be
  // re-resolved against tabs that actually exist now.
  useEffect(() => {
    if (!loaded || restored.current) return;
    restored.current = true;

    let cancelled = false;
    void (async () => {
      const [stored, preferences] = await Promise.all([
        loadSelection(userId),
        loadPreferences(),
      ]);
      if (cancelled) return;

      if (!stored) {
        setMode(preferences.attachContextByDefault ? 'current' : 'none');
        return;
      }
      setMode(stored.mode);
      if (stored.mode === 'custom') {
        setCustomTabIds(resolveStoredTabs(stored.tabs, tabs));
      }
    })();

    return () => {
      cancelled = true;
    };
    // `tabs` is read for the initial resolution only; later changes are handled
    // by the pruning effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, userId]);

  // Drop ids for tabs that have since been closed, so the selection cannot grow
  // a tail of stale entries.
  useEffect(() => {
    if (!loaded) return;
    setCustomTabIds((current) => {
      const live = current.filter((id) => tabs.some((tab) => tab.id === id));
      return live.length === current.length ? current : live;
    });
  }, [loaded, tabs]);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.active) ?? null,
    [tabs],
  );

  const selectedTabs = useMemo(() => {
    if (mode === 'none') return [];
    if (mode === 'current') return activeTab ? [activeTab] : [];
    if (mode === 'window') return tabs.slice(0, CHAT_LIMITS.maxContextTabs);
    return tabs
      .filter((tab) => customTabIds.includes(tab.id))
      .slice(0, CHAT_LIMITS.maxContextTabs);
  }, [mode, tabs, activeTab, customTabIds]);

  useEffect(() => {
    if (!restored.current) return;
    void saveSelection(userId, { mode, tabs: selectedTabs });
  }, [userId, mode, selectedTabs]);

  const toggleTab = useCallback((tabId: number) => {
    setCustomTabIds((current) =>
      current.includes(tabId)
        ? current.filter((id) => id !== tabId)
        : // Silently ignoring the extra tab would be confusing; the UI disables
          // unchecked rows once the cap is reached.
          current.length >= CHAT_LIMITS.maxContextTabs
          ? current
          : [...current, tabId],
    );
  }, []);

  const pageContext = useMemo(
    () => toPageContext(mode, selectedTabs),
    [mode, selectedTabs],
  );

  return {
    tabs,
    activeTab,
    mode,
    setMode,
    customTabIds,
    toggleTab,
    selectedTabs,
    pageContext,
    unavailable: loaded && tabs.length === 0,
    refresh,
  };
}
