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

type InteractionIntent = 'click' | 'type' | 'select' | 'check' | 'upload';

const INTERACTION_READY_TIMEOUT_MS = 5_000;
const INTERACTION_RETRY_INTERVAL_MS = 100;
const CLICKABLE_SELECTOR = [
  'a[href]',
  'button',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[onclick]',
].join(',');

const GENERIC_TARGET_WORDS = new Set([
  'a',
  'an',
  'the',
  'control',
  'element',
  'field',
  'box',
  'bar',
  'input',
  'button',
  'link',
  'textbox',
]);

function queryRoots(root: Document | Element): ParentNode[] {
  const roots: ParentNode[] = [root];
  for (let index = 0; index < roots.length; index += 1) {
    const current = roots[index]!;
    for (const element of current.querySelectorAll('*')) {
      if (element.shadowRoot) roots.push(element.shadowRoot);
    }
  }
  return roots;
}

export function queryElements(
  document: Document,
  selector: string,
): Element[] {
  try {
    const matches = queryRoots(document).flatMap((root) =>
      Array.from(root.querySelectorAll(selector)),
    );
    return Array.from(new Set(matches));
  } catch {
    throw new PageActionError('ACTION_FAILED', 'Selector is not valid CSS');
  }
}

function normalizeWords(value: string): string[] {
  return value
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Pure scoring primitive kept exported so resolver behavior can be regression-tested. */
export function scoreSemanticTarget(target: string, descriptions: string[]): number {
  const rawTargetWords = normalizeWords(target);
  const targetWords = rawTargetWords.filter((word) => !GENERIC_TARGET_WORDS.has(word));
  const meaningfulTarget = targetWords.length > 0 ? targetWords : rawTargetWords;
  if (meaningfulTarget.length === 0) return 0;

  let best = 0;
  for (const description of descriptions) {
    const descriptionWords = normalizeWords(description);
    if (descriptionWords.length === 0) continue;
    const targetText = meaningfulTarget.join(' ');
    const descriptionText = descriptionWords.join(' ');
    const overlap = meaningfulTarget.filter((word) => descriptionWords.includes(word)).length;
    let score = overlap * 40;
    if (descriptionText === targetText) score += 100;
    else if (descriptionText.includes(targetText) || targetText.includes(descriptionText)) score += 50;
    score += Math.max(0, 20 - Math.abs(descriptionWords.length - meaningfulTarget.length) * 4);
    best = Math.max(best, score);
  }
  return best;
}

export function requestedOrdinal(target: string): 'first' | 'last' | undefined {
  const words = normalizeWords(target);
  if (
    words.includes('first') ||
    words.includes('top') ||
    words.includes('latest') ||
    words.includes('newest') ||
    /\bmost\s+recent\b/i.test(target)
  ) return 'first';
  if (words.includes('last') || words.includes('bottom')) return 'last';
  return undefined;
}

function isHidden(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current) {
    if (current.hidden || current.getAttribute('aria-hidden') === 'true') return true;
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (style?.display === 'none' || style?.visibility === 'hidden') return true;
    const root = current.getRootNode();
    current = current.parentElement ?? (root instanceof ShadowRoot ? root.host as HTMLElement : null);
  }
  return false;
}

function isEditableElement(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement) || isElementDisabled(element) || isHidden(element)) {
    return false;
  }
  if (element instanceof HTMLInputElement) {
    return !element.readOnly && new Set([
      'email',
      'number',
      'search',
      'tel',
      'text',
      'url',
    ]).has(element.type);
  }
  return (
    (element instanceof HTMLTextAreaElement && !element.readOnly) ||
    element.isContentEditable
  );
}

function isSelectableElement(element: Element): element is HTMLSelectElement {
  return element instanceof HTMLSelectElement && !element.disabled && !isHidden(element);
}

function isCheckableElement(element: Element): element is HTMLInputElement {
  return (
    element instanceof HTMLInputElement &&
    (element.type === 'checkbox' || element.type === 'radio') &&
    !element.disabled &&
    !isHidden(element)
  );
}

function isUploadElement(element: Element): element is HTMLInputElement {
  // File inputs are commonly visually hidden behind a styled label, so hidden
  // state is not grounds for rejection. They must still be enabled and exact.
  return element instanceof HTMLInputElement && element.type === 'file' && !element.disabled;
}

function isClickableElement(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement) || isElementDisabled(element) || isHidden(element)) {
    return false;
  }
  return element.matches(CLICKABLE_SELECTOR);
}

/** Resolve visible label nodes (common on YouTube) to the control that owns them. */
function closestClickableElement(element: Element): HTMLElement | undefined {
  let current: Element | null = element;
  for (let depth = 0; current && depth < 12; depth += 1) {
    if (isClickableElement(current)) return current;
    const root = current.getRootNode();
    current = current.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
  }
  return undefined;
}

function eligibleElement(
  element: Element,
  intent: InteractionIntent,
): HTMLElement | undefined {
  if (intent === 'type') return isEditableElement(element) ? element : undefined;
  if (intent === 'select') return isSelectableElement(element) ? element : undefined;
  if (intent === 'check') return isCheckableElement(element) ? element : undefined;
  if (intent === 'upload') return isUploadElement(element) ? element : undefined;
  return closestClickableElement(element);
}

function accessibleDescriptions(element: HTMLElement): string[] {
  const values = [
    element.getAttribute('aria-label'),
    element.getAttribute('placeholder'),
    element.getAttribute('name'),
    element.id,
    element.getAttribute('title'),
    element.getAttribute('role'),
    element.getAttribute('href'),
    element instanceof HTMLInputElement ? element.value : null,
    element.innerText || element.textContent,
  ];
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    values.push(...Array.from(element.labels ?? []).map((label) => label.textContent));
  }
  return values.flatMap((value) => {
    const trimmed = value?.replace(/\s+/g, ' ').trim().slice(0, 240);
    return trimmed ? [trimmed] : [];
  });
}

function findSemanticElement(
  document: Document,
  target: string,
  intent: InteractionIntent,
  candidates?: Element[],
): Element | undefined {
  const candidateSelector = intent === 'type'
    ? 'input:not([type="hidden"]):not([type="password"]),textarea,[contenteditable="true"],[role="textbox"],[role="searchbox"]'
    : intent === 'select'
      ? 'select'
      : intent === 'check'
        ? 'input[type="checkbox"],input[type="radio"]'
        : intent === 'upload'
          ? 'input[type="file"]'
        : CLICKABLE_SELECTOR;
  const available = candidates ?? queryElements(document, candidateSelector);
  const eligible = Array.from(new Set(available.flatMap((element) => {
    const resolved = eligibleElement(element, intent);
    return resolved ? [resolved] : [];
  })));
  const ranked = eligible
    .map((element) => ({
      element,
      score: scoreSemanticTarget(target, accessibleDescriptions(element)),
    }))
    .filter(({ score }) => score >= 40)
    .sort((left, right) => right.score - left.score);

  if (ranked.length === 0) return undefined;
  const top = ranked.filter((candidate) => candidate.score === ranked[0]!.score);
  if (top.length > 1) {
    // Repeated responsive/header links can point to the exact same place. In
    // that case choosing the first visible instance is deterministic and safe.
    const destinations = top.map(({ element }) =>
      element instanceof HTMLAnchorElement ? element.href : null,
    );
    if (destinations.every(Boolean) && new Set(destinations).size === 1) {
      return top[0]!.element;
    }
    throw new PageActionError(
      'AMBIGUOUS_SELECTOR',
      `More than one control matches “${target}”`,
    );
  }
  return ranked[0]!.element;
}

export function querySingleElement(
  document: Document,
  selector: string,
  target?: string,
  intent?: InteractionIntent,
): Element {
  let elements: Element[] = [];
  try {
    elements = queryElements(document, selector);
  } catch (error) {
    if (!target || !intent) throw error;
  }
  if (elements.length === 1) {
    if (!intent) return elements[0]!;
    const eligible = eligibleElement(elements[0]!, intent);
    if (eligible) return eligible;
    if (target) {
      const semantic = findSemanticElement(document, target, intent);
      if (semantic) return semantic;
    }
    return elements[0]!;
  }
  if (target && intent) {
    const ordinal = requestedOrdinal(target);
    const eligible = Array.from(new Set(elements.flatMap((element) => {
      const resolved = eligibleElement(element, intent);
      return resolved ? [resolved] : [];
    })));
    if (ordinal && eligible.length > 0) {
      return ordinal === 'first' ? eligible[0]! : eligible[eligible.length - 1]!;
    }
    const scopedSemantic = findSemanticElement(
      document,
      target,
      intent,
      elements.length > 1 ? elements : undefined,
    );
    if (scopedSemantic) return scopedSemantic;
    if (elements.length > 1) {
      const pageSemantic = findSemanticElement(document, target, intent);
      if (pageSemantic) return pageSemantic;
    }
  }
  if (elements.length === 0) {
    throw new PageActionError(
      'ELEMENT_NOT_FOUND',
      target
        ? `Could not find the ${target} control on this page`
        : 'No element matches the selector',
    );
  }
  if (elements.length > 1) {
    throw new PageActionError(
      'AMBIGUOUS_SELECTOR',
      'Selector must match exactly one element',
    );
  }
  return elements[0]!;
}

async function queryReadyElement(
  document: Document,
  selector: string,
  target: string | undefined,
  intent: InteractionIntent,
): Promise<Element> {
  const deadline = Date.now() + INTERACTION_READY_TIMEOUT_MS;
  while (true) {
    try {
      return querySingleElement(document, selector, target, intent);
    } catch (error) {
      if (
        !(error instanceof PageActionError) ||
        error.code !== 'ELEMENT_NOT_FOUND' ||
        Date.now() >= deadline
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, INTERACTION_RETRY_INTERVAL_MS));
    }
  }
}

function isElementDisabled(element: HTMLElement): boolean {
  return 'disabled' in element && element.disabled === true;
}

function dispatchInputEvents(element: HTMLElement): void {
  element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const prototype = element instanceof HTMLInputElement
    ? HTMLInputElement.prototype
    : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) {
    element.value = value;
    return;
  }
  setter.call(element, value);
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
    setNativeValue(element, clear ? text : `${element.value}${text}`);
  } else if (element instanceof HTMLTextAreaElement) {
    if (element.readOnly) {
      throw new PageActionError(
        'UNSUPPORTED_ELEMENT',
        'Textarea is read-only',
      );
    }
    setNativeValue(element, clear ? text : `${element.value}${text}`);
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

export function fileMatchesAccept(
  name: string,
  mimeType: string,
  accept: string,
): boolean {
  const rules = accept.split(',').map((rule) => rule.trim().toLowerCase()).filter(Boolean);
  if (rules.length === 0) return true;
  const normalizedName = name.toLowerCase();
  const normalizedType = mimeType.toLowerCase();
  return rules.some((rule) =>
    rule.startsWith('.')
      ? normalizedName.endsWith(rule)
      : rule.endsWith('/*')
        ? normalizedType.startsWith(rule.slice(0, -1))
        : normalizedType === rule,
  );
}

function decodeUploadFile(
  file: { name: string; mimeType: string; dataUrl: string },
): File {
  const comma = file.dataUrl.indexOf(',');
  if (comma < 0) throw new PageActionError('ACTION_FAILED', 'Attached file data is invalid');
  let decoded: string;
  try {
    decoded = atob(file.dataUrl.slice(comma + 1));
  } catch {
    throw new PageActionError('ACTION_FAILED', 'Attached file data could not be decoded');
  }
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return new File([bytes], file.name, { type: file.mimeType });
}

function uploadIntoElement(
  element: Element,
  fileData: { name: string; mimeType: string; dataUrl: string },
): void {
  if (!isUploadElement(element)) {
    throw new PageActionError('UNSUPPORTED_ELEMENT', 'Target is not an enabled file input');
  }
  if (!fileMatchesAccept(fileData.name, fileData.mimeType, element.accept)) {
    throw new PageActionError(
      'UNSUPPORTED_ELEMENT',
      `The ${fileData.name} file type is not accepted by this upload field`,
    );
  }
  const transfer = new DataTransfer();
  transfer.items.add(decodeUploadFile(fileData));
  element.files = transfer.files;
  dispatchInputEvents(element);
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
    'label[for]',
    'legend',
    'h1',
    'h2',
    'h3',
    'iframe[title]',
    '[id*="captcha" i]',
    '[class*="captcha" i]',
    '[id*="verification" i]',
  ].join(',');

  return queryRoots(root).flatMap((queryRoot) => Array.from(queryRoot.querySelectorAll(selector)))
    .slice(0, 250)
    .flatMap((node) => {
      if (!(node instanceof HTMLElement) || node.hidden || node.getAttribute('aria-hidden') === 'true') {
        return [];
      }
      const tag = node.tagName.toLowerCase();
      const attributeNames = ['id', 'name', 'role', 'aria-label', 'placeholder', 'title', 'type', 'accept', 'href', 'data-testid'];
      if (/captcha|verification/i.test(node.className)) attributeNames.push('class');
      const attributes = attributeNames
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

export async function executePageAction(
  action: PageAutomationAction,
  document: Document,
  window: Window,
): Promise<ExtractedPageData | undefined> {
  switch (action.kind) {
    case 'click': {
      const element = await queryReadyElement(
        document,
        action.selector,
        action.target,
        'click',
      );
      if (
        !(element instanceof HTMLElement) ||
        isElementDisabled(element) ||
        isHidden(element)
      ) {
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
        await queryReadyElement(document, action.selector, action.target, 'type'),
        action.text,
        action.clear ?? true,
        action.submit ?? false,
      );
      return;
    case 'select': {
      const element = await queryReadyElement(
        document,
        action.selector,
        action.target,
        'select',
      );
      if (!(element instanceof HTMLSelectElement) || element.disabled) {
        throw new PageActionError('UNSUPPORTED_ELEMENT', 'Target is not an enabled select control');
      }
      const normalized = action.value.trim().toLocaleLowerCase();
      const option = Array.from(element.options).find(
        (candidate) =>
          candidate.value.toLocaleLowerCase() === normalized ||
          candidate.text.trim().toLocaleLowerCase() === normalized,
      );
      if (!option) {
        throw new PageActionError('ELEMENT_NOT_FOUND', `No option matches “${action.value}”`);
      }
      element.value = option.value;
      dispatchInputEvents(element);
      return;
    }
    case 'check': {
      const element = await queryReadyElement(
        document,
        action.selector,
        action.target,
        'check',
      );
      if (!isCheckableElement(element)) {
        throw new PageActionError('UNSUPPORTED_ELEMENT', 'Target is not an enabled checkbox or radio button');
      }
      const checked = action.checked ?? true;
      if (element.checked !== checked) element.click();
      if (element.checked !== checked) {
        element.checked = checked;
        dispatchInputEvents(element);
      }
      return;
    }
    case 'upload': {
      const element = await queryReadyElement(
        document,
        action.selector,
        action.target,
        'upload',
      );
      uploadIntoElement(element, action.file);
      return;
    }
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

export async function executeContentRequest(
  request: AutomationContentRequest,
  document: Document,
  window: Window,
): Promise<AutomationResponse> {
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
    const data = await executePageAction(request.action, document, window);
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
