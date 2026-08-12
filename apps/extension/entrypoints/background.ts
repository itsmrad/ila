import { executeAutomationRequest } from '../lib/automation-background';
import {
  AUTOMATION_EXECUTE_MESSAGE,
  AUTOMATION_RESULT_MESSAGE,
  AutomationValidationError,
  validateAutomationRequest,
} from '../lib/automation-protocol';
import {
  AUTOMATION_PROGRESS,
  automationStartMessageSchema,
  type AutomationProgressMessage,
  type AutomationStartMessage,
  type AutomationStartResponse,
} from '../lib/automations';

/**
 * Background service worker.
 *
 * Owns automation execution so the side panel stays a thin client. It serves
 * both the production browser-agent protocol and the saved
 * automation progress protocol used by the tab workspace.
 */
export default defineBackground(() => {
  browser.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    // Firefox and older Chromium versions do not expose this API.
  });

  browser.runtime.onMessage.addListener(async (message, sender) => {
    if (
      typeof message !== 'object' ||
      message === null ||
      message.type !== AUTOMATION_EXECUTE_MESSAGE
    ) {
      return undefined;
    }

    // onMessage is extension-internal, but checking the sender keeps the
    // boundary explicit if externally-connectable messaging is added later.
    if (sender.id !== browser.runtime.id) return undefined;

    try {
      return await executeAutomationRequest(validateAutomationRequest(message));
    } catch (error) {
      return {
        type: AUTOMATION_RESULT_MESSAGE,
        requestId:
          typeof message.requestId === 'string'
            ? message.requestId.slice(0, 128)
            : 'invalid',
        ok: false,
        confirmation: { required: false, approved: false },
        error: {
          code: 'INVALID_REQUEST',
          message:
            error instanceof AutomationValidationError
              ? error.message
              : 'Invalid automation request',
        },
      };
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Only this extension's own pages may start automations. Content scripts run
    // in web pages, so an unchecked handler would let any visited site trigger
    // one.
    if (sender.id !== chrome.runtime.id) return false;

    const parsed = automationStartMessageSchema.safeParse(message);
    if (!parsed.success) return false;

    // Replying asynchronously requires keeping the channel open, hence the
    // explicit `true` below.
    void acknowledge(parsed.data).then(sendResponse);
    return true;
  });
});

async function acknowledge(
  request: AutomationStartMessage,
): Promise<AutomationStartResponse> {
  console.info('[ila] automation requested', {
    runId: request.runId,
    automationId: request.automationId,
    mode: request.context.mode,
    tabCount: request.context.tabs.length,
  });

  // Mocked run. Progress is broadcast rather than streamed through the response
  // so the UI keeps working if the worker is killed and restarted mid-run.
  emit({
    type: AUTOMATION_PROGRESS,
    runId: request.runId,
    automationId: request.automationId,
    status: 'running',
    message: 'Starting…',
  });

  setTimeout(() => {
    emit({
      type: AUTOMATION_PROGRESS,
      runId: request.runId,
      automationId: request.automationId,
      status: 'complete',
      message: `Complete (mocked) — ${request.context.tabs.length} tab(s) in scope.`,
    });
  }, 900);

  return { accepted: true, runId: request.runId };
}

/** Broadcast to any open extension page; ignored when nothing is listening. */
function emit(progress: AutomationProgressMessage): void {
  void chrome.runtime.sendMessage(progress).catch(() => {
    // No receiver (side panel closed) — nothing to do.
  });
}
