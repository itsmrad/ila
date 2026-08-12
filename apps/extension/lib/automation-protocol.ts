export const AUTOMATION_EXECUTE_MESSAGE = 'ila:automation:execute' as const;
export const AUTOMATION_CONTENT_MESSAGE = 'ila:automation:content-execute' as const;
export const AUTOMATION_RESULT_MESSAGE = 'ila:automation:result' as const;

export const MAX_SELECTOR_LENGTH = 1_024;
export const MAX_TARGET_LENGTH = 240;
export const MAX_TYPE_TEXT_LENGTH = 50_000;
export const MAX_EXTRACT_LENGTH = 100_000;
export const MAX_SCROLL_DELTA = 100_000;
export const MAX_UPLOAD_DATA_URL_LENGTH = 14_000_000;

export type NavigateAction = {
  kind: 'navigate';
  url: string;
};

export type NewTabAction = {
  kind: 'newTab';
  url: string;
};

export type CloseTabAction = {
  kind: 'closeTab';
};

export type ReloadAction = {
  kind: 'reload';
  bypassCache?: boolean;
};

export type BackAction = {
  kind: 'back';
};

export type ForwardAction = {
  kind: 'forward';
};

export type ClickAction = {
  kind: 'click';
  selector: string;
  target?: string;
};

export type TypeAction = {
  kind: 'type';
  selector: string;
  target?: string;
  text: string;
  clear?: boolean;
  submit?: boolean;
};

export type SelectAction = {
  kind: 'select';
  selector: string;
  target?: string;
  value: string;
};

export type CheckAction = {
  kind: 'check';
  selector: string;
  target?: string;
  checked?: boolean;
};

export type UploadAction = {
  kind: 'upload';
  selector: string;
  target?: string;
  file: {
    name: string;
    mimeType: string;
    dataUrl: string;
  };
};

export type ScrollAction = {
  kind: 'scroll';
  selector?: string;
  deltaX?: number;
  deltaY: number;
  behavior?: 'auto' | 'smooth';
};

export type ExtractAction = {
  kind: 'extract';
  selector: string;
  property?: 'text' | 'html' | 'value' | 'outline';
  attribute?: string;
  maxLength?: number;
};

export type PageAutomationAction =
  | ClickAction
  | TypeAction
  | SelectAction
  | CheckAction
  | UploadAction
  | ScrollAction
  | ExtractAction;

export type AutomationAction =
  | NavigateAction
  | NewTabAction
  | CloseTabAction
  | ReloadAction
  | BackAction
  | ForwardAction
  | PageAutomationAction;

export type ConfirmationMetadata = {
  required: boolean;
  approved: boolean;
  reason?: string;
};

/** Public request accepted by the background service worker. */
export type AutomationExecuteRequest = {
  type: typeof AUTOMATION_EXECUTE_MESSAGE;
  requestId: string;
  scope: 'activeTab';
  action: AutomationAction;
  expectedUrl?: string;
  confirmation?: {
    approved: boolean;
  };
};

/** Internal, background-to-content-script request. */
export type AutomationContentRequest = {
  type: typeof AUTOMATION_CONTENT_MESSAGE;
  requestId: string;
  expectedUrl: string;
  action: PageAutomationAction;
  confirmation: ConfirmationMetadata;
};

export type AutomationErrorCode =
  | 'INVALID_REQUEST'
  | 'CONFIRMATION_REQUIRED'
  | 'NO_ACTIVE_TAB'
  | 'UNSUPPORTED_URL'
  | 'ACTIVE_TAB_CHANGED'
  | 'ELEMENT_NOT_FOUND'
  | 'AMBIGUOUS_SELECTOR'
  | 'UNSUPPORTED_ELEMENT'
  | 'ACTION_FAILED';

export type ExtractedPageData = {
  values: string[];
  truncated: boolean;
};

export type AutomationSuccessResponse = {
  type: typeof AUTOMATION_RESULT_MESSAGE;
  requestId: string;
  ok: true;
  confirmation: ConfirmationMetadata;
  data?: ExtractedPageData;
};

export type AutomationErrorResponse = {
  type: typeof AUTOMATION_RESULT_MESSAGE;
  requestId: string;
  ok: false;
  confirmation: ConfirmationMetadata;
  error: {
    code: AutomationErrorCode;
    message: string;
  };
};

export type AutomationResponse =
  | AutomationSuccessResponse
  | AutomationErrorResponse;

export class AutomationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AutomationValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AutomationValidationError(`${field} must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw new AutomationValidationError(
      `${field} must be at most ${maxLength} characters`,
    );
  }
  if (value.includes('\0')) {
    throw new AutomationValidationError(`${field} must not contain null bytes`);
  }
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw new AutomationValidationError(`${field} must be a boolean`);
  }
  return value;
}

function optionalFiniteNumber(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AutomationValidationError(`${field} must be a finite number`);
  }
  if (value < min || value > max) {
    throw new AutomationValidationError(
      `${field} must be between ${min} and ${max}`,
    );
  }
  return value;
}

function validateTypeText(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > MAX_TYPE_TEXT_LENGTH ||
    value.includes('\0')
  ) {
    throw new AutomationValidationError(
      `text must be a string of at most ${MAX_TYPE_TEXT_LENGTH} characters without null bytes`,
    );
  }
  return value;
}

/** Returns a canonical URL and rejects internal, local, and extension schemes. */
export function normalizeHttpUrl(value: unknown, field = 'url'): string {
  const input = requiredString(value, field, 2_048);
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new AutomationValidationError(`${field} must be an absolute URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AutomationValidationError(`${field} must use http or https`);
  }
  return url.toString();
}

export function isHttpUrl(value: unknown): value is string {
  try {
    normalizeHttpUrl(value);
    return true;
  } catch {
    return false;
  }
}

/** Performs environment-independent selector input validation. */
export function validateSelector(value: unknown, field = 'selector'): string {
  const selector = requiredString(value, field, MAX_SELECTOR_LENGTH).trim();
  if (selector.length === 0) {
    throw new AutomationValidationError(`${field} must not be blank`);
  }
  if (/\p{Cc}/u.test(selector)) {
    throw new AutomationValidationError(
      `${field} must not contain control characters`,
    );
  }
  return selector;
}

export function validateTarget(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const target = requiredString(value, 'target', MAX_TARGET_LENGTH).trim();
  if (target.length === 0) {
    throw new AutomationValidationError('target must not be blank');
  }
  return target;
}

export function validateAutomationAction(value: unknown): AutomationAction {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    throw new AutomationValidationError('action must include a kind');
  }

  switch (value.kind) {
    case 'navigate':
      return { kind: 'navigate', url: normalizeHttpUrl(value.url) };
    case 'newTab':
      return { kind: 'newTab', url: normalizeHttpUrl(value.url) };
    case 'closeTab':
      return { kind: 'closeTab' };
    case 'reload': {
      const bypassCache = optionalBoolean(value.bypassCache, 'bypassCache');
      return bypassCache === undefined
        ? { kind: 'reload' }
        : { kind: 'reload', bypassCache };
    }
    case 'back':
      return { kind: 'back' };
    case 'forward':
      return { kind: 'forward' };
    case 'click': {
      const target = validateTarget(value.target);
      return {
        kind: 'click',
        selector: validateSelector(value.selector),
        ...(target ? { target } : {}),
      };
    }
    case 'type': {
      const action: TypeAction = {
        kind: 'type',
        selector: validateSelector(value.selector),
        text: validateTypeText(value.text),
      };
      const target = validateTarget(value.target);
      if (target) action.target = target;
      const clear = optionalBoolean(value.clear, 'clear');
      const submit = optionalBoolean(value.submit, 'submit');
      if (clear !== undefined) action.clear = clear;
      if (submit !== undefined) action.submit = submit;
      return action;
    }
    case 'select': {
      const target = validateTarget(value.target);
      const optionValue = requiredString(value.value, 'value', 500).trim();
      if (!optionValue) {
        throw new AutomationValidationError('value must not be blank');
      }
      return {
        kind: 'select',
        selector: validateSelector(value.selector),
        ...(target ? { target } : {}),
        value: optionValue,
      };
    }
    case 'check': {
      const target = validateTarget(value.target);
      const checked = optionalBoolean(value.checked, 'checked');
      return {
        kind: 'check',
        selector: validateSelector(value.selector),
        ...(target ? { target } : {}),
        ...(checked === undefined ? {} : { checked }),
      };
    }
    case 'upload': {
      if (!isRecord(value.file)) {
        throw new AutomationValidationError('upload.file is required');
      }
      const name = requiredString(value.file.name, 'file.name', 255).trim();
      if (!name || /[\\/]/.test(name)) {
        throw new AutomationValidationError('file.name must be a plain filename');
      }
      const mimeType = requiredString(value.file.mimeType, 'file.mimeType', 120)
        .trim()
        .toLowerCase();
      if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(mimeType)) {
        throw new AutomationValidationError('file.mimeType is invalid');
      }
      const dataUrl = requiredString(
        value.file.dataUrl,
        'file.dataUrl',
        MAX_UPLOAD_DATA_URL_LENGTH,
      );
      const encodedType = dataUrl.slice(5, dataUrl.indexOf(';')).toLowerCase();
      if (
        !dataUrl.startsWith('data:') ||
        !dataUrl.includes(';base64,') ||
        encodedType !== mimeType ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(dataUrl.slice(dataUrl.indexOf(',') + 1))
      ) {
        throw new AutomationValidationError('file.dataUrl must match file.mimeType');
      }
      const target = validateTarget(value.target);
      return {
        kind: 'upload',
        selector: validateSelector(value.selector),
        ...(target ? { target } : {}),
        file: { name, mimeType, dataUrl },
      };
    }
    case 'scroll': {
      const deltaX =
        optionalFiniteNumber(
          value.deltaX,
          'deltaX',
          -MAX_SCROLL_DELTA,
          MAX_SCROLL_DELTA,
        ) ?? 0;
      const deltaY = optionalFiniteNumber(
        value.deltaY,
        'deltaY',
        -MAX_SCROLL_DELTA,
        MAX_SCROLL_DELTA,
      );
      if (deltaY === undefined) {
        throw new AutomationValidationError('deltaY is required');
      }
      if (deltaX === 0 && deltaY === 0) {
        throw new AutomationValidationError('scroll delta must not be zero');
      }
      if (
        value.behavior !== undefined &&
        value.behavior !== 'auto' &&
        value.behavior !== 'smooth'
      ) {
        throw new AutomationValidationError(
          'behavior must be either auto or smooth',
        );
      }
      const action: ScrollAction = {
        kind: 'scroll',
        deltaX,
        deltaY,
      };
      if (value.selector !== undefined) {
        action.selector = validateSelector(value.selector);
      }
      if (value.behavior !== undefined) action.behavior = value.behavior;
      return action;
    }
    case 'extract': {
      if (
        value.property !== undefined &&
        value.property !== 'text' &&
        value.property !== 'html' &&
        value.property !== 'value' &&
        value.property !== 'outline'
      ) {
        throw new AutomationValidationError(
          'property must be text, html, value, or outline',
        );
      }
      if (value.attribute !== undefined && typeof value.attribute !== 'string') {
        throw new AutomationValidationError('attribute must be a string');
      }
      if (
        typeof value.attribute === 'string' &&
        !/^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/.test(value.attribute)
      ) {
        throw new AutomationValidationError('attribute name is invalid');
      }
      if (value.attribute !== undefined && value.property !== undefined) {
        throw new AutomationValidationError(
          'extract accepts either attribute or property, not both',
        );
      }
      const maxLength = optionalFiniteNumber(
        value.maxLength,
        'maxLength',
        1,
        MAX_EXTRACT_LENGTH,
      );
      if (maxLength !== undefined && !Number.isInteger(maxLength)) {
        throw new AutomationValidationError('maxLength must be an integer');
      }
      const action: ExtractAction = {
        kind: 'extract',
        selector: validateSelector(value.selector),
      };
      if (value.property !== undefined) action.property = value.property;
      if (value.attribute !== undefined) action.attribute = value.attribute;
      if (maxLength !== undefined) action.maxLength = maxLength;
      return action;
    }
    default:
      throw new AutomationValidationError(
        `unsupported action kind: ${value.kind}`,
      );
  }
}

export function isPageAutomationAction(
  action: AutomationAction,
): action is PageAutomationAction {
  return (
    action.kind === 'click' ||
    action.kind === 'type' ||
    action.kind === 'select' ||
    action.kind === 'check' ||
    action.kind === 'upload' ||
    action.kind === 'scroll' ||
    action.kind === 'extract'
  );
}

/** The policy is derived here; callers cannot downgrade an action's risk. */
export function confirmationPolicyForAction(
  action: AutomationAction,
): Pick<ConfirmationMetadata, 'required' | 'reason'> {
  switch (action.kind) {
    case 'scroll':
    case 'extract':
      return { required: false };
    case 'type':
      return {
        required: true,
        reason: 'Typing changes page state and may disclose provided text.',
      };
    case 'select':
    case 'check':
      return {
        required: true,
        reason: 'Changing a form control modifies page state.',
      };
    case 'upload':
      return {
        required: true,
        reason: 'Uploading shares the selected local file with this website.',
      };
    case 'click':
      return {
        required: true,
        reason: 'Clicking may submit data or trigger a consequential action.',
      };
    default:
      return {
        required: true,
        reason: 'This action changes browser or navigation state.',
      };
  }
}

export function validateAutomationRequest(
  value: unknown,
): AutomationExecuteRequest {
  if (!isRecord(value) || value.type !== AUTOMATION_EXECUTE_MESSAGE) {
    throw new AutomationValidationError('not an automation execute request');
  }
  const requestId = requiredString(value.requestId, 'requestId', 128).trim();
  if (requestId.length === 0) {
    throw new AutomationValidationError('requestId must not be blank');
  }
  if (value.scope !== 'activeTab') {
    throw new AutomationValidationError('scope must be activeTab');
  }
  const action = validateAutomationAction(value.action);
  const expectedUrl = value.expectedUrl === undefined
    ? undefined
    : normalizeHttpUrl(value.expectedUrl, 'expectedUrl');
  let confirmation: AutomationExecuteRequest['confirmation'];
  if (value.confirmation !== undefined) {
    if (
      !isRecord(value.confirmation) ||
      typeof value.confirmation.approved !== 'boolean'
    ) {
      throw new AutomationValidationError(
        'confirmation.approved must be a boolean',
      );
    }
    confirmation = { approved: value.confirmation.approved };
  }
  return {
    type: AUTOMATION_EXECUTE_MESSAGE,
    requestId,
    scope: 'activeTab',
    action,
    ...(expectedUrl ? { expectedUrl } : {}),
    ...(confirmation ? { confirmation } : {}),
  };
}

export function validateContentRequest(
  value: unknown,
): AutomationContentRequest {
  if (!isRecord(value) || value.type !== AUTOMATION_CONTENT_MESSAGE) {
    throw new AutomationValidationError('not an automation content request');
  }
  const requestId = requiredString(value.requestId, 'requestId', 128).trim();
  const expectedUrl = normalizeHttpUrl(value.expectedUrl, 'expectedUrl');
  const action = validateAutomationAction(value.action);
  if (!isPageAutomationAction(action)) {
    throw new AutomationValidationError(
      'content scripts only accept page-level actions',
    );
  }
  if (
    !isRecord(value.confirmation) ||
    typeof value.confirmation.required !== 'boolean' ||
    typeof value.confirmation.approved !== 'boolean'
  ) {
    throw new AutomationValidationError('confirmation metadata is required');
  }
  const policy = confirmationPolicyForAction(action);
  if (value.confirmation.required !== policy.required) {
    throw new AutomationValidationError(
      'confirmation metadata does not match action policy',
    );
  }
  if (policy.required && !value.confirmation.approved) {
    throw new AutomationValidationError('action has not been confirmed');
  }
  return {
    type: AUTOMATION_CONTENT_MESSAGE,
    requestId,
    expectedUrl,
    action,
    confirmation: {
      required: policy.required,
      approved: value.confirmation.approved,
      ...(policy.reason ? { reason: policy.reason } : {}),
    },
  };
}

export function confirmationMetadata(
  action: AutomationAction,
  approved: boolean,
): ConfirmationMetadata {
  const policy = confirmationPolicyForAction(action);
  return {
    required: policy.required,
    approved,
    ...(policy.reason ? { reason: policy.reason } : {}),
  };
}
