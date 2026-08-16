import * as mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { AGENT_LIMITS } from "@ila/shared";

const MAX_PDF_PAGES = 25;
const EXTRACTION_TIMEOUT_MS = 6_000;

export interface ExtractableAttachment {
  id?: string;
  name: string;
  mediaType: string;
  dataUrl: string;
}

function attachmentBuffer(attachment: ExtractableAttachment): Buffer {
  const comma = attachment.dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Attachment data is invalid");
  return Buffer.from(attachment.dataUrl.slice(comma + 1), "base64");
}

function cleanExtractedText(value: string): string {
  return value
    // Keep newlines but remove other control characters and prompt markers.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/<<<|>>>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeText(buffer: Buffer): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

function decodeRtf(buffer: Buffer): string {
  return decodeText(buffer)
    .replace(/\\'[0-9a-f]{2}/gi, " ")
    .replace(/\\[a-z]+-?\d* ?/gi, " ")
    .replace(/[{}]/g, " ");
}

async function extractOne(attachment: ExtractableAttachment): Promise<string> {
  const buffer = attachmentBuffer(attachment);
  switch (attachment.mediaType.toLowerCase()) {
    case "application/pdf": {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      if (pdf.numPages > MAX_PDF_PAGES) {
        throw new Error(`PDF exceeds the ${MAX_PDF_PAGES}-page extraction limit`);
      }
      const result = await extractText(pdf, { mergePages: true });
      return result.text;
    }
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case "application/rtf":
      return decodeRtf(buffer);
    case "application/json":
    case "text/csv":
    case "text/markdown":
    case "text/plain":
      return decodeText(buffer);
    default:
      return "";
  }
}

async function withExtractionTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Attachment text extraction timed out")),
          EXTRACTION_TIMEOUT_MS,
        );
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Extract bounded text locally. Raw file bytes are never forwarded to the
 * language model; the original attachment remains available for page upload.
 */
export async function extractAgentAttachmentContext(
  attachments: readonly ExtractableAttachment[],
): Promise<string | undefined> {
  const sections: string[] = [];
  for (const attachment of attachments) {
    try {
      const text = cleanExtractedText(await withExtractionTimeout(extractOne(attachment)));
      if (!text) continue;
      const label = attachment.id
        ? `Attachment ${attachment.id} (${attachment.name})`
        : `Attachment ${attachment.name}`;
      sections.push(`${label}:\n${text}`);
    } catch {
      // A malformed or image-only document can still be uploaded. Planning
      // receives its metadata and must ask for any missing required details.
    }
  }
  if (sections.length === 0) return undefined;
  return sections.join("\n\n").slice(0, AGENT_LIMITS.maxAttachmentContextChars);
}

/** Documents become text; only actual images remain as provider file parts. */
export async function prepareModelAttachments(
  attachments: readonly ExtractableAttachment[],
): Promise<{
  context?: string;
  visualAttachments: ExtractableAttachment[];
}> {
  const context = await extractAgentAttachmentContext(attachments);
  const visualAttachments = attachments.filter(({ mediaType }) =>
    mediaType.toLowerCase().startsWith("image/"),
  );
  return {
    ...(context ? { context } : {}),
    visualAttachments,
  };
}
