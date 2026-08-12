import { executeContentRequest } from '../lib/automation-content';
import {
  AUTOMATION_CONTENT_MESSAGE,
  validateContentRequest,
} from '../lib/automation-protocol';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  main() {
    browser.runtime.onMessage.addListener((message, sender) => {
      if (
        typeof message !== 'object' ||
        message === null ||
        message.type !== AUTOMATION_CONTENT_MESSAGE ||
        sender.id !== browser.runtime.id
      ) {
        return undefined;
      }

      try {
        return Promise.resolve(
          executeContentRequest(
            validateContentRequest(message),
            document,
            window,
          ),
        );
      } catch {
        return undefined;
      }
    });
  },
});
