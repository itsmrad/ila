import { browser } from 'wxt/browser';
import {
  AUTOMATION_CONTENT_MESSAGE,
  AUTOMATION_RESULT_MESSAGE,
  type AutomationErrorCode,
  type AutomationExecuteRequest,
  type AutomationResponse,
  confirmationMetadata,
  confirmationPolicyForAction,
  isHttpUrl,
  isPageAutomationAction,
} from './automation-protocol';

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

/** Executes only against the active HTTP(S) tab in the current window. */
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
  if (!isHttpUrl(tab.url)) {
    return errorResponse(
      request,
      'UNSUPPORTED_URL',
      'Automation is limited to HTTP(S) pages',
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

    switch (request.action.kind) {
      case 'navigate':
        await browser.tabs.update(tab.id, { url: request.action.url });
        break;
      case 'newTab':
        await browser.tabs.create({
          url: request.action.url,
          active: true,
          windowId: tab.windowId,
          index: tab.index + 1,
        });
        break;
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
        const result: unknown = await browser.tabs.sendMessage(tab.id, {
          type: AUTOMATION_CONTENT_MESSAGE,
          requestId: request.requestId,
          expectedUrl: tab.url,
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
          return result as AutomationResponse;
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
