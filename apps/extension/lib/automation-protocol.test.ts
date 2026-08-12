import { describe, expect, test } from 'bun:test';
import {
  confirmationPolicyForAction,
  normalizeHttpUrl,
  validateAutomationRequest,
} from './automation-protocol';

describe('automation protocol security boundary', () => {
  test('rejects internal URLs and malformed selectors', () => {
    expect(() => normalizeHttpUrl('chrome://settings')).toThrow();
    expect(() =>
      validateAutomationRequest({
        type: 'ila:automation:execute',
        requestId: 'one',
        scope: 'activeTab',
        action: { kind: 'click', selector: '   ' },
      }),
    ).toThrow();
  });

  test('derives confirmation policy instead of trusting the planner', () => {
    const request = validateAutomationRequest({
      type: 'ila:automation:execute',
      requestId: 'one',
      scope: 'activeTab',
      action: { kind: 'type', selector: '#query', text: 'hello' },
      confirmation: { approved: false },
    });
    expect(confirmationPolicyForAction(request.action).required).toBe(true);
    expect(confirmationPolicyForAction({ kind: 'extract', selector: 'body' }).required).toBe(
      false,
    );
  });

  test('preserves bounded semantic intent and rejects blank targets', () => {
    const request = validateAutomationRequest({
      type: 'ila:automation:execute',
      requestId: 'semantic-target',
      scope: 'activeTab',
      action: {
        kind: 'type',
        selector: 'input#search',
        target: 'YouTube search field',
        text: 'mrbeast',
      },
      confirmation: { approved: true },
    });
    expect(request.action).toEqual({
      kind: 'type',
      selector: 'input#search',
      target: 'YouTube search field',
      text: 'mrbeast',
    });
    expect(() =>
      validateAutomationRequest({
        type: 'ila:automation:execute',
        requestId: 'blank-target',
        scope: 'activeTab',
        action: { kind: 'click', selector: 'button', target: '   ' },
      }),
    ).toThrow();
  });
});
