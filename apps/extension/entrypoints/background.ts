import { executeAutomationRequest } from '../lib/automation-background';
import {
  AUTOMATION_EXECUTE_MESSAGE,
  AUTOMATION_RESULT_MESSAGE,
  AutomationValidationError,
  validateAutomationRequest,
} from '../lib/automation-protocol';

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
});
