import { describe, expect, test } from 'bun:test';
import { requestedOrdinal, scoreSemanticTarget } from './automation-content';

describe('semantic browser target matching', () => {
  test('matches an accessible name even when a site-specific selector is stale', () => {
    expect(
      scoreSemanticTarget('YouTube search field', ['Search', 'search_query']) > 40,
    ).toBe(true);
  });

  test('prefers exact accessible purpose over unrelated controls', () => {
    const search = scoreSemanticTarget('Search button', ['Search']);
    const account = scoreSemanticTarget('Search button', ['Sign in', 'Account']);
    expect(search > account).toBe(true);
    expect(account < 40).toBe(true);
  });

  test('recognizes ordinal result intent for repeated selectors', () => {
    expect(requestedOrdinal('Open the first video result')).toBe('first');
    expect(requestedOrdinal('Choose the bottom option')).toBe('last');
    expect(requestedOrdinal('Open a video result')).toBe(undefined);
  });
});
