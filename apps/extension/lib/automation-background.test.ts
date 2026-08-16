import { describe, expect, test } from 'bun:test';
import { actionRequiresHttpPage } from './automation-background';

describe('automation page boundary', () => {
  test('allows website navigation to bootstrap from Chrome New Tab', () => {
    expect(actionRequiresHttpPage({ kind: 'navigate', url: 'https://example.com' })).toBe(false);
    expect(actionRequiresHttpPage({ kind: 'newTab', url: 'https://example.com' })).toBe(false);
  });

  test('keeps DOM interaction restricted to regular websites', () => {
    expect(actionRequiresHttpPage({
      kind: 'click',
      selector: 'button',
      target: 'Continue button',
    })).toBe(true);
    expect(actionRequiresHttpPage({
      kind: 'type',
      selector: 'input',
      target: 'Search field',
      text: 'Darjeeling',
      clear: true,
    })).toBe(true);
  });
});
