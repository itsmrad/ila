import type { BrowserAction, PageContext } from '@ila/shared';
import { browser } from 'wxt/browser';
import {
  AUTOMATION_EXECUTE_MESSAGE,
  type AutomationAction,
  type AutomationResponse,
} from './automation-protocol';

export function toAutomationAction(action: BrowserAction): AutomationAction | null {
  switch (action.type) {
    case 'navigate':
      return { kind: 'navigate', url: action.url };
    case 'open_tab':
      return { kind: 'newTab', url: action.url };
    case 'close_tab':
      return { kind: 'closeTab' };
    case 'reload':
      return { kind: 'reload' };
    case 'back':
      return { kind: 'back' };
    case 'forward':
      return { kind: 'forward' };
    case 'click':
      return {
        kind: 'click',
        selector: action.selector,
        ...(action.target ? { target: action.target } : {}),
      };
    case 'type':
      return {
        kind: 'type',
        selector: action.selector,
        ...(action.target ? { target: action.target } : {}),
        text: action.text,
        clear: action.clear,
      };
    case 'select':
      return {
        kind: 'select',
        selector: action.selector,
        ...(action.target ? { target: action.target } : {}),
        value: action.value,
      };
    case 'check':
      return {
        kind: 'check',
        selector: action.selector,
        ...(action.target ? { target: action.target } : {}),
        checked: action.checked,
      };
    case 'scroll':
      return {
        kind: 'scroll',
        deltaY: action.direction === 'down' ? action.amount : -action.amount,
        behavior: 'smooth',
      };
    case 'extract':
      return action.kind === 'links'
        ? { kind: 'extract', selector: action.selector ?? 'a[href]', attribute: 'href' }
        : { kind: 'extract', selector: action.selector ?? 'body', property: 'text' };
    case 'wait':
      return null;
  }
}

export async function executeAgentAction(
  action: BrowserAction,
  approved: boolean,
): Promise<AutomationResponse | undefined> {
  if (action.type === 'wait') {
    await new Promise((resolve) => window.setTimeout(resolve, action.milliseconds));
    return undefined;
  }

  const mapped = toAutomationAction(action);
  if (!mapped) return undefined;
  const requestId = globalThis.crypto?.randomUUID?.() ?? `agent-${Date.now()}`;
  return browser.runtime.sendMessage({
    type: AUTOMATION_EXECUTE_MESSAGE,
    requestId,
    scope: 'activeTab',
    action: mapped,
    confirmation: { approved },
  }) as Promise<AutomationResponse>;
}

/** Read a bounded DOM snapshot before planning so selectors are evidence-based. */
export async function observeActivePage(): Promise<string | undefined> {
  const requestId = globalThis.crypto?.randomUUID?.() ?? `observe-${Date.now()}`;
  const response = (await browser.runtime.sendMessage({
    type: AUTOMATION_EXECUTE_MESSAGE,
    requestId,
    scope: 'activeTab',
    action: {
      kind: 'extract',
      selector: 'body',
      property: 'outline',
      maxLength: 12_000,
    },
    confirmation: { approved: false },
  })) as AutomationResponse;

  return response.ok ? response.data?.values.join('\n').slice(0, 12_000) : undefined;
}

export interface ActivePageObservation {
  pageContext: PageContext;
  pageSnapshot?: string;
}

/** Capture URL/title and accessible outline from the same active-tab turn. */
export async function observeActivePageState(): Promise<ActivePageObservation> {
  const [before] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!before?.url || !/^https?:\/\//i.test(before.url)) {
    throw new Error('Open a regular website before running the browser agent.');
  }
  const pageSnapshot = await observeActivePage();
  const [after] = await browser.tabs.query({ active: true, currentWindow: true });
  if (after?.id !== before.id || after.url !== before.url) {
    throw new Error('The active tab changed while ILA was observing it.');
  }
  return {
    pageContext: {
      url: before.url,
      ...(before.title ? { title: before.title } : {}),
    },
    ...(pageSnapshot ? { pageSnapshot } : {}),
  };
}
