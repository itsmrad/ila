import { browser } from 'wxt/browser';
import {
  AUTOMATION_CONTENT_MESSAGE,
  AUTOMATION_RESULT_MESSAGE,
  type AutomationErrorCode,
  type AutomationAction,
  type AutomationExecuteRequest,
  type AutomationResponse,
  confirmationMetadata,
  confirmationPolicyForAction,
  isHttpUrl,
  isPageAutomationAction,
} from './automation-protocol';

/** Browser-level actions can bootstrap safely without access to page content. */
export function actionRequiresHttpPage(action: AutomationAction): boolean {
  return isPageAutomationAction(action);
}

function errorResponse(
  request: AutomationExecuteRequest,
  code: AutomationErrorCode,
  message: string,
): AutomationResponse {
  return {
    type: AUTOMATION_RESULT_MESSAGE,
    requestId: request.requestId,
    ok: false,
    confirmation: confirmationMetadata(
      request.action,
      request.confirmation?.approved === true,
    ),
    error: { code, message },
  };
}

async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (typeof tab?.id !== 'number' || !tab.active) return undefined;
  return tab;
}

/** Wait until navigation has committed and the destination content script can run. */
async function waitForTabComplete(
  tabId: number,
  timeoutMs = 20_000,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      browser.tabs.onUpdated.removeListener(onUpdated);
      if (error) reject(error);
      else resolve();
    };
    const onUpdated = (updatedId: number, change: { status?: string }) => {
      if (updatedId === tabId && change.status === 'complete') finish();
    };
    const timeout = setTimeout(() => {
      finish(new Error('Timed out waiting for the page to load'));
    }, timeoutMs);

    browser.tabs.onUpdated.addListener(onUpdated);
    // Check after subscribing so a fast navigation cannot complete between the
    // initial status read and listener registration.
    void browser.tabs
      .get(tabId)
      .then((tab) => {
        if (tab.status === 'complete') finish();
      })
      .catch(() => finish(new Error('The destination tab was closed')));
  });
}

/**
 * A content-script click resolves before a navigation or SPA transition may
 * start. Observe a short activity window, then wait for a detected navigation
 * to finish so the next agent turn always sees the resulting page.
 */
async function waitForPageActivity(
  tabId: number,
  previousUrl: string,
  detectionMs = 750,
  timeoutMs = 20_000,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let activityDetected = false;
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(detectionTimer);
      clearTimeout(timeoutTimer);
      if (quietTimer) clearTimeout(quietTimer);
      browser.tabs.onUpdated.removeListener(onUpdated);
      if (error) reject(error);
      else resolve();
    };
    const scheduleComplete = () => {
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(() => finish(), 200);
    };
    const onUpdated = (
      updatedId: number,
      change: { status?: string; url?: string },
    ) => {
      if (updatedId !== tabId) return;
      if (change.url || change.status === 'loading') activityDetected = true;
      if (activityDetected && change.status === 'complete') scheduleComplete();
    };
    const detectionTimer = setTimeout(() => {
      if (!activityDetected) finish();
    }, detectionMs);
    const timeoutTimer = setTimeout(
      () => finish(new Error('Timed out waiting for the page action to settle')),
      timeoutMs,
    );
    browser.tabs.onUpdated.addListener(onUpdated);
    void browser.tabs.get(tabId).then((current) => {
      if (current.url !== previousUrl || current.status === 'loading') {
        activityDetected = true;
      }
      if (activityDetected && current.status === 'complete') scheduleComplete();
    }).catch(() => finish(new Error('The active tab was closed')));
  });
}

/**
 * Execute browser-level navigation from any active tab. DOM automation remains
 * restricted to HTTP(S), but opening a website must work from chrome://newtab.
 */
export async function executeAutomationRequest(
  request: AutomationExecuteRequest,
): Promise<AutomationResponse> {
  const approved = request.confirmation?.approved === true;
  const policy = confirmationPolicyForAction(request.action);
  if (policy.required && !approved) {
    return errorResponse(
      request,
      'CONFIRMATION_REQUIRED',
      policy.reason ?? 'This action requires confirmation',
    );
  }

  const tab = await getActiveTab();
  if (typeof tab?.id !== 'number') {
    return errorResponse(
      request,
      'NO_ACTIVE_TAB',
      'An active tab is required',
    );
  }
  if (actionRequiresHttpPage(request.action) && !isHttpUrl(tab.url)) {
    return errorResponse(
      request,
      'UNSUPPORTED_URL',
      'Open or navigate to a regular website before using page controls',
    );
  }
  try {
    // Re-query immediately before execution so the request never carries an
    // arbitrary tab identifier and a tab switch invalidates the request.
    const current = await getActiveTab();
    if (current?.id !== tab.id || current.url !== tab.url) {
      return errorResponse(
        request,
        'ACTIVE_TAB_CHANGED',
        'The active tab changed before the action could run',
      );
    }
    if (request.expectedUrl && current.url !== request.expectedUrl) {
      return errorResponse(
        request,
        'ACTIVE_TAB_CHANGED',
        'The active page changed after ILA observed it',
      );
    }

    switch (request.action.kind) {
      case 'navigate':
        await browser.tabs.update(tab.id, { url: request.action.url });
        await waitForTabComplete(tab.id);
        break;
      case 'newTab': {
        const created = await browser.tabs.create({
          url: request.action.url,
          active: true,
          windowId: tab.windowId,
          index: tab.index + 1,
        });
        if (typeof created.id === 'number') await waitForTabComplete(created.id);
        break;
      }
      case 'closeTab':
        await browser.tabs.remove(tab.id);
        break;
      case 'reload':
        await browser.tabs.reload(tab.id, {
          bypassCache: request.action.bypassCache ?? false,
        });
        break;
      case 'back':
        await browser.tabs.goBack(tab.id);
        break;
      case 'forward':
        await browser.tabs.goForward(tab.id);
        break;
      default: {
        if (!isPageAutomationAction(request.action)) {
          return errorResponse(request, 'INVALID_REQUEST', 'Unsupported action');
        }
        const pageUrl = tab.url;
        if (!isHttpUrl(pageUrl)) {
          return errorResponse(
            request,
            'UNSUPPORTED_URL',
            'Open or navigate to a regular website before using page controls',
          );
        }
        const result: unknown = await browser.tabs.sendMessage(tab.id, {
          type: AUTOMATION_CONTENT_MESSAGE,
          requestId: request.requestId,
          expectedUrl: pageUrl,
          action: request.action,
          confirmation: confirmationMetadata(request.action, approved),
        });
        if (
          typeof result === 'object' &&
          result !== null &&
          'type' in result &&
          result.type === AUTOMATION_RESULT_MESSAGE &&
          'requestId' in result &&
          result.requestId === request.requestId &&
          'ok' in result &&
          typeof result.ok === 'boolean'
        ) {
          const response = result as AutomationResponse;
          if (response.ok && request.action.kind === 'click') {
            await waitForPageActivity(tab.id, pageUrl);
          }
          return response;
        }
        return errorResponse(
          request,
          'ACTION_FAILED',
          'Content script returned an invalid response',
        );
      }
    }

    return {
      type: AUTOMATION_RESULT_MESSAGE,
      requestId: request.requestId,
      ok: true,
      confirmation: confirmationMetadata(request.action, approved),
    };
  } catch {
    return errorResponse(request, 'ACTION_FAILED', 'Browser action failed');
  }
}
