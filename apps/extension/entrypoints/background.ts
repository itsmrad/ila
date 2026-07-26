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
 * Owns automation execution so the side panel stays a thin client. Execution is
 * mocked in this stage: the worker validates the payload, acknowledges it, and
 * emits a short progress sequence so the messaging path can be verified
 * end-to-end.
 */
export default defineBackground(() => {
  browser.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    // Firefox and older Chromium versions do not expose this API.
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
