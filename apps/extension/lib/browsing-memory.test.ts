import { describe, expect, test } from 'bun:test';
import { processBrowsingMemory, sanitizeMemoryUrl } from './browsing-memory';

describe('browsing memory', () => {
  test('drops secrets, fragments, tracking params, and internal URLs', () => {
    expect(
      sanitizeMemoryUrl('https://example.com/path?utm_source=x&token=secret&q=ok#private'),
    ).toBe('https://example.com/path?q=ok');
    expect(sanitizeMemoryUrl('chrome://settings')).toBeNull();
  });

  test('deduplicates repeated visits', () => {
    const first = processBrowsingMemory([], { url: 'https://example.com', title: 'One' }, 10);
    const second = processBrowsingMemory(first, { url: 'https://example.com', title: 'Two' }, 20);
    expect(second).toHaveLength(1);
    expect(second[0]?.visitCount).toBe(2);
    expect(second[0]?.title).toBe('Two');
  });
});
