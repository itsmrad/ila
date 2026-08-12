import { describe, expect, test } from 'bun:test';
import { fileMatchesAccept, requestedOrdinal, scoreSemanticTarget } from './automation-content';

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
    expect(requestedOrdinal('Play the latest MrBeast video')).toBe('first');
    expect(requestedOrdinal('Play the most recent upload')).toBe('first');
    expect(requestedOrdinal('Choose the bottom option')).toBe('last');
    expect(requestedOrdinal('Open a video result')).toBe(undefined);
  });

  test('uses link destinations to distinguish similarly named channels', () => {
    const official = scoreSemanticTarget('official MrBeast channel', [
      'MrBeast',
      '/@MrBeast',
    ]);
    const secondary = scoreSemanticTarget('official MrBeast channel', [
      'MrBeast 2',
      '/@MrBeast2',
    ]);
    expect(official > secondary).toBe(true);
  });
});

describe('file upload acceptance', () => {
  test('supports extension, exact MIME, and wildcard accept rules', () => {
    expect(fileMatchesAccept('Resume.pdf', 'application/pdf', '.pdf')).toBe(true);
    expect(fileMatchesAccept('Resume.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
    expect(fileMatchesAccept('photo.png', 'image/png', 'image/*')).toBe(true);
    expect(fileMatchesAccept('Resume.pdf', 'application/pdf', '.docx')).toBe(false);
  });
});
