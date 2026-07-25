import { useCallback, useEffect, useState } from 'react';
import type { PageContext } from '@ila/shared';

/**
 * Title and URL of the active tab, refreshed as the user switches tabs.
 *
 * Only `http(s)` pages are reported: internal `chrome://`, `file://`, and
 * extension pages are withheld so local paths and browser internals are never
 * uploaded. The backend treats whatever arrives here as untrusted data.
 */
export function usePageContext(): {
  pageContext: PageContext | null;
  refresh: () => void;
} {
  const [pageContext, setPageContext] = useState<PageContext | null>(null);

  const refresh = useCallback(() => {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
      setPageContext(null);
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.url) {
        setPageContext(null);
        return;
      }

      let url: URL;
      try {
        url = new URL(tab.url);
      } catch {
        setPageContext(null);
        return;
      }

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        setPageContext(null);
        return;
      }

      setPageContext({
        title: tab.title?.slice(0, 300) || url.hostname,
        url: url.toString().slice(0, 2048),
      });
    });
  }, []);

  useEffect(() => {
    refresh();

    if (typeof chrome === 'undefined' || !chrome.tabs?.onActivated) return;

    const onActivated = () => refresh();
    const onUpdated = (
      _tabId: number,
      changeInfo: { url?: string; title?: string },
      tab: chrome.tabs.Tab,
    ) => {
      if (tab.active && (changeInfo.url || changeInfo.title)) refresh();
    };

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [refresh]);

  return { pageContext, refresh };
}
