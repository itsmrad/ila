import { describe, expect, test } from 'bun:test';
import {
  dataUrlByteLength,
  MAX_ATTACHMENT_BYTES,
  validateAttachmentCandidates,
} from './attachments';

describe('composer attachments', () => {
  test('accepts supported documents and rejects spoofed or oversized files', () => {
    const result = validateAttachmentCandidates([
      { name: 'brief.pdf', type: 'application/pdf', size: 100 },
      { name: 'fake.png', type: 'text/html', size: 100 },
      { name: 'huge.txt', type: 'text/plain', size: MAX_ATTACHMENT_BYTES + 1 },
    ]);
    expect(result.accepted.map((file) => file.name)).toEqual(['brief.pdf']);
    expect(result.rejected.map((file) => file.reason)).toEqual(['type', 'size']);
  });

  test('computes decoded screenshot bytes', () => {
    expect(dataUrlByteLength('data:image/png;base64,YWJjZA==')).toBe(4);
  });
});
