import { describe, expect, test } from 'bun:test';
import { toAutomationAction } from './agent-runner';

describe('agent action mapping', () => {
  test('maps safe planned actions to the extension protocol', () => {
    expect(toAutomationAction({ type: 'open_tab', url: 'https://example.com', active: true })).toEqual({
      kind: 'newTab',
      url: 'https://example.com',
    });
    expect(toAutomationAction({ type: 'scroll', direction: 'up', amount: 500 })).toEqual({
      kind: 'scroll',
      deltaY: -500,
      behavior: 'smooth',
    });
    expect(toAutomationAction({ type: 'extract', kind: 'links' })).toEqual({
      kind: 'extract',
      selector: 'a[href]',
      attribute: 'href',
    });
    expect(toAutomationAction({
      type: 'type',
      selector: 'input#search',
      target: 'YouTube search field',
      text: 'mrbeast',
      clear: true,
    })).toEqual({
      kind: 'type',
      selector: 'input#search',
      target: 'YouTube search field',
      text: 'mrbeast',
      clear: true,
    });
    expect(toAutomationAction({
      type: 'select',
      selector: '#country',
      target: 'Country field',
      value: 'India',
    })).toEqual({
      kind: 'select',
      selector: '#country',
      target: 'Country field',
      value: 'India',
    });
  });

  test('keeps wait local to the runner', () => {
    expect(toAutomationAction({ type: 'wait', milliseconds: 250 })).toBeNull();
  });

  test('resolves upload attachment ids locally without exposing filesystem paths', () => {
    expect(toAutomationAction({
      type: 'upload',
      selector: 'input[type="file"]',
      target: 'Resume upload field',
      attachmentId: 'resume-one',
    }, [{
      id: 'resume-one',
      name: 'Resume.pdf',
      mimeType: 'application/pdf',
      dataUrl: 'data:application/pdf;base64,JVBERg==',
    }])).toEqual({
      kind: 'upload',
      selector: 'input[type="file"]',
      target: 'Resume upload field',
      file: {
        name: 'Resume.pdf',
        mimeType: 'application/pdf',
        dataUrl: 'data:application/pdf;base64,JVBERg==',
      },
    });
    expect(() => toAutomationAction({
      type: 'upload',
      selector: 'input[type="file"]',
      attachmentId: 'missing',
    })).toThrow();
  });
});
