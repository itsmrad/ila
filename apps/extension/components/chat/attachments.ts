/** Serializable attachment payload exposed by the composer. */
export interface ComposerAttachment {
  id: string;
  kind: 'upload' | 'capture';
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

export interface AttachmentCandidate {
  name: string;
  type: string;
  size: number;
}

export type AttachmentRejectionReason = 'count' | 'size' | 'type';

export interface AttachmentRejection {
  name: string;
  reason: AttachmentRejectionReason;
}

export interface AttachmentValidationResult<T extends AttachmentCandidate> {
  accepted: T[];
  rejected: AttachmentRejection[];
}

export const MAX_ATTACHMENT_COUNT = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_ATTACHMENT_TYPES = [
  'application/json',
  'application/pdf',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/markdown',
  'text/plain',
] as const;

export const ACCEPTED_ATTACHMENT_EXTENSIONS = [
  '.csv',
  '.gif',
  '.jpeg',
  '.jpg',
  '.json',
  '.md',
  '.pdf',
  '.png',
  '.txt',
  '.webp',
] as const;

export const ATTACHMENT_ACCEPT = [
  ...ACCEPTED_ATTACHMENT_TYPES,
  ...ACCEPTED_ATTACHMENT_EXTENSIONS,
].join(',');

function hasAcceptedExtension(name: string): boolean {
  const normalized = name.toLowerCase();
  return ACCEPTED_ATTACHMENT_EXTENSIONS.some((extension) =>
    normalized.endsWith(extension),
  );
}

/**
 * Validate file-like metadata without touching browser APIs, so this logic can
 * be exercised in a plain TypeScript unit test.
 */
export function validateAttachmentCandidates<T extends AttachmentCandidate>(
  candidates: readonly T[],
  existingCount = 0,
): AttachmentValidationResult<T> {
  const accepted: T[] = [];
  const rejected: AttachmentRejection[] = [];
  const availableSlots = Math.max(0, MAX_ATTACHMENT_COUNT - existingCount);

  for (const candidate of candidates) {
    const hasAcceptedType = ACCEPTED_ATTACHMENT_TYPES.includes(
      candidate.type as (typeof ACCEPTED_ATTACHMENT_TYPES)[number],
    );
    const canUseExtensionFallback =
      candidate.type === '' || candidate.type === 'application/octet-stream';
    if (
      !hasAcceptedType &&
      !(canUseExtensionFallback && hasAcceptedExtension(candidate.name))
    ) {
      rejected.push({ name: candidate.name, reason: 'type' });
      continue;
    }

    if (candidate.size > MAX_ATTACHMENT_BYTES) {
      rejected.push({ name: candidate.name, reason: 'size' });
      continue;
    }

    if (accepted.length >= availableSlots) {
      rejected.push({ name: candidate.name, reason: 'count' });
      continue;
    }

    accepted.push(candidate);
  }

  return { accepted, rejected };
}

export function summarizeAttachmentRejections(
  rejected: readonly AttachmentRejection[],
): string | null {
  if (rejected.length === 0) return null;

  const reasons = new Set(rejected.map(({ reason }) => reason));
  const messages: string[] = [];
  if (reasons.has('type')) {
    messages.push('Some files use an unsupported type');
  }
  if (reasons.has('size')) {
    messages.push('Files must be 10 MB or smaller');
  }
  if (reasons.has('count')) {
    messages.push(`You can attach up to ${MAX_ATTACHMENT_COUNT} files`);
  }
  return `${messages.join('. ')}.`;
}

/** Approximate the decoded byte size of a base64 data URL. */
export function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return 0;
  const payload = dataUrl.slice(comma + 1);
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}
