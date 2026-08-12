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
  });

  test('keeps wait local to the runner', () => {
    expect(toAutomationAction({ type: 'wait', milliseconds: 250 })).toBeNull();
  });
});
