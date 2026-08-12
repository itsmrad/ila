import {
  AUTOMATION_RESULT_MESSAGE,
  MAX_EXTRACT_LENGTH,
  type AutomationContentRequest,
  type AutomationResponse,
  type ExtractAction,
  type ExtractedPageData,
  type PageAutomationAction,
} from './automation-protocol';

export class PageActionError extends Error {
  constructor(
    public readonly code:
      | 'ELEMENT_NOT_FOUND'
      | 'AMBIGUOUS_SELECTOR'
      | 'UNSUPPORTED_ELEMENT'
      | 'ACTION_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'PageActionError';
  }
}

export function queryElements(
  document: Document,
  selector: string,
): Element[] {
  try {
    return Array.from(document.querySelectorAll(selector));
  } catch {
    throw new PageActionError('ACTION_FAILED', 'Selector is not valid CSS');
  }
}

export function querySingleElement(
  document: Document,
  selector: string,
): Element {
  const elements = queryElements(document, selector);
  if (elements.length === 0) {
    throw new PageActionError(
      'ELEMENT_NOT_FOUND',
      'No element matches the selector',
    );
  }
  if (elements.length > 1) {
    throw new PageActionError(
      'AMBIGUOUS_SELECTOR',
      'Selector must match exactly one element',
    );
  }
  return elements[0];
}

function isElementDisabled(element: HTMLElement): boolean {
  return 'disabled' in element && element.disabled === true;
}

function dispatchInputEvents(element: HTMLElement): void {
  element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function typeIntoElement(
  element: Element,
  text: string,
  clear: boolean,
  submit: boolean,
): void {
  if (!(element instanceof HTMLElement) || isElementDisabled(element)) {
    throw new PageActionError(
      'UNSUPPORTED_ELEMENT',
      'Target is not an enabled editable element',
    );
  }

  element.focus();
  if (element instanceof HTMLInputElement) {
    const supportedTypes = new Set([
      'email',
      'number',
      'password',
      'search',
      'tel',
      'text',
      'url',
    ]);
    if (!supportedTypes.has(element.type) || element.readOnly) {
      throw new PageActionError(
        'UNSUPPORTED_ELEMENT',
        'Input type is not editable by this action',
      );
    }
    element.value = clear ? text : `${element.value}${text}`;
  } else if (element instanceof HTMLTextAreaElement) {
    if (element.readOnly) {
      throw new PageActionError(
        'UNSUPPORTED_ELEMENT',
        'Textarea is read-only',
      );
    }
    element.value = clear ? text : `${element.value}${text}`;
  } else if (element.isContentEditable) {
    element.textContent = clear ? text : `${element.textContent ?? ''}${text}`;
  } else {
    throw new PageActionError(
      'UNSUPPORTED_ELEMENT',
      'Target is not an input, textarea, or contenteditable element',
    );
  }

  dispatchInputEvents(element);
  if (submit) {
    element.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );
    element.dispatchEvent(
      new KeyboardEvent('keyup', {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );
  }
}

function extractElementValue(element: Element, action: ExtractAction): string {
  if (action.attribute) return element.getAttribute(action.attribute) ?? '';
  switch (action.property ?? 'text') {
    case 'html':
      return element.innerHTML;
    case 'outline':
      return buildPageOutline(element);
    case 'value':
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ) {
        return element.value;
      }
      throw new PageActionError(
        'UNSUPPORTED_ELEMENT',
        'The matched element does not expose a value',
      );
    case 'text':
      return element.textContent ?? '';
  }
}

/**
 * Produce selector evidence without uploading the page's raw DOM. Values,
 * scripts, styles, hidden nodes, and password fields are deliberately omitted.
 */
export function buildPageOutline(root: Element): string {
  const selector = [
    'a[href]',
    'button',
    'input:not([type="hidden"]):not([type="password"])',
    'textarea',
    'select',
    '[contenteditable="true"]',
    '[role="button"]',
    '[role="link"]',
    '[role="textbox"]',
    'h1',
    'h2',
    'h3',
  ].join(',');

  return Array.from(root.querySelectorAll(selector))
    .slice(0, 250)
    .flatMap((node) => {
      if (!(node instanceof HTMLElement) || node.hidden || node.getAttribute('aria-hidden') === 'true') {
        return [];
      }
      const tag = node.tagName.toLowerCase();
      const attributes = ['id', 'name', 'role', 'aria-label', 'placeholder', 'type']
        .flatMap((name) => {
          const value = node.getAttribute(name)?.trim().slice(0, 160);
          return value ? [`${name}=${JSON.stringify(value)}`] : [];
        });
      const text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180);
      return [`<${tag}${attributes.length ? ` ${attributes.join(' ')}` : ''}>${text ? ` ${text}` : ''}`];
    })
    .join('\n');
}

export function extractPageData(
  document: Document,
  action: ExtractAction,
): ExtractedPageData {
  const elements = queryElements(document, action.selector);
  if (elements.length === 0) {
    throw new PageActionError(
      'ELEMENT_NOT_FOUND',
      'No element matches the selector',
    );
  }

  let remaining = action.maxLength ?? MAX_EXTRACT_LENGTH;
  const values: string[] = [];
  let truncated = false;
  for (const element of elements) {
    const value = extractElementValue(element, action);
    if (value.length > remaining) {
      values.push(value.slice(0, remaining));
      truncated = true;
      remaining = 0;
      break;
    }
    values.push(value);
    remaining -= value.length;
    if (remaining === 0) {
      truncated = elements.length > values.length;
      break;
    }
  }
  return { values, truncated };
}

export function executePageAction(
  action: PageAutomationAction,
  document: Document,
  window: Window,
): ExtractedPageData | undefined {
  switch (action.kind) {
    case 'click': {
      const element = querySingleElement(document, action.selector);
      if (!(element instanceof HTMLElement) || isElementDisabled(element)) {
        throw new PageActionError(
          'UNSUPPORTED_ELEMENT',
          'Target is not an enabled clickable element',
        );
      }
      element.focus();
      element.click();
      return;
    }
    case 'type':
      typeIntoElement(
        querySingleElement(document, action.selector),
        action.text,
        action.clear ?? true,
        action.submit ?? false,
      );
      return;
    case 'scroll': {
      const options: ScrollToOptions = {
        left: action.deltaX ?? 0,
        top: action.deltaY,
        behavior: action.behavior ?? 'auto',
      };
      if (action.selector) {
        const element = querySingleElement(document, action.selector);
        element.scrollBy(options);
      } else {
        window.scrollBy(options);
      }
      return;
    }
    case 'extract':
      return extractPageData(document, action);
  }
}

export function executeContentRequest(
  request: AutomationContentRequest,
  document: Document,
  window: Window,
): AutomationResponse {
  const confirmation = request.confirmation;
  if (window.location.href !== request.expectedUrl) {
    return {
      type: AUTOMATION_RESULT_MESSAGE,
      requestId: request.requestId,
      ok: false,
      confirmation,
      error: {
        code: 'ACTIVE_TAB_CHANGED',
        message: 'The page URL changed before the action could run',
      },
    };
  }

  try {
    const data = executePageAction(request.action, document, window);
    return {
      type: AUTOMATION_RESULT_MESSAGE,
      requestId: request.requestId,
      ok: true,
      confirmation,
      ...(data ? { data } : {}),
    };
  } catch (error) {
    const pageError =
      error instanceof PageActionError
        ? error
        : new PageActionError('ACTION_FAILED', 'Page action failed');
    return {
      type: AUTOMATION_RESULT_MESSAGE,
      requestId: request.requestId,
      ok: false,
      confirmation,
      error: { code: pageError.code, message: pageError.message },
    };
  }
}
