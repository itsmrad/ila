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
      expectedUrl: 'https://jobs.example.com/apply',
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

  test('validates select and checkbox form actions', () => {
    expect(validateAutomationRequest({
      type: 'ila:automation:execute',
      requestId: 'select-country',
      scope: 'activeTab',
      action: {
        kind: 'select',
        selector: '#country',
        target: 'Country field',
        value: 'India',
      },
      confirmation: { approved: true },
    }).action).toEqual({
      kind: 'select',
      selector: '#country',
      target: 'Country field',
      value: 'India',
    });
    expect(confirmationPolicyForAction({
      kind: 'check',
      selector: '#terms',
      checked: true,
    }).required).toBe(true);
  });

  test('validates confirmed file uploads without accepting mismatched data', () => {
    const request = validateAutomationRequest({
      type: 'ila:automation:execute',
      requestId: 'upload-resume',
      scope: 'activeTab',
      action: {
        kind: 'upload',
        selector: 'input[type="file"]',
        target: 'Resume upload field',
        file: {
          name: 'Resume.pdf',
          mimeType: 'application/pdf',
          dataUrl: 'data:application/pdf;base64,JVBERg==',
        },
      },
      expectedUrl: 'https://jobs.example.com/apply',
      confirmation: { approved: true },
    });
    expect(request.action.kind).toBe('upload');
    expect(request.expectedUrl).toBe('https://jobs.example.com/apply');
    expect(confirmationPolicyForAction(request.action).required).toBe(true);
    expect(() => validateAutomationRequest({
      type: 'ila:automation:execute',
      requestId: 'bad-upload',
      scope: 'activeTab',
      action: {
        kind: 'upload',
        selector: 'input',
        file: {
          name: 'Resume.pdf',
          mimeType: 'application/pdf',
          dataUrl: 'data:text/plain;base64,SGVsbG8=',
        },
      },
    })).toThrow();
  });
});
