import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import {
  ArrowUp,
  Check,
  ChevronDown,
  Crop,
  FileUp,
  Globe,
  Image as ImageIcon,
  Mic2,
  Paperclip,
  Square,
  X,
} from 'lucide-react';
import { IconButton } from '@ila/ui';
import { CHAT_LIMITS, type ChatModel, type PageContext } from '@ila/shared';
import type { AgentSettings } from '../../lib/settings-storage';
import { ContextCard } from '../ai';
import {
  ATTACHMENT_ACCEPT,
  createAttachmentId,
  dataUrlByteLength,
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_BYTES,
  readFileAsDataUrl,
  summarizeAttachmentRejections,
  validateAttachmentCandidates,
  type ComposerAttachment,
} from './attachments';

export type { ComposerAttachment } from './attachments';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Chip showing which page will be shared with the assistant. */
function ContextTag({
  pageContext,
  onRemove,
}: {
  pageContext: PageContext;
  onRemove: () => void;
}) {
  const hostname = (() => {
    if (!pageContext.url) return pageContext.title ?? 'Current page';
    try {
      return new URL(pageContext.url).hostname.replace(/^www\./, '');
    } catch {
      return pageContext.title ?? 'Current page';
    }
  })();

  return <ContextCard label={hostname} detail={pageContext.url} onRemove={onRemove} />;
}

/** Model picker backed by the server's allowlist. */
function ModelMenu({
  models,
  model,
  onModelChange,
}: {
  models: ChatModel[];
  model?: string;
  onModelChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Move focus to the current selection when the popup opens.
  useEffect(() => {
    if (!open) return;
    const group = groupRef.current;
    if (!group) return;
    const selected = group.querySelector<HTMLButtonElement>(
      'button[aria-pressed="true"]',
    );
    (selected ?? group.querySelector<HTMLButtonElement>('button'))?.focus();
  }, [open]);

  const select = (id: string) => {
    onModelChange(id);
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-[11.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[var(--focus)] ${open ? 'bg-[var(--field)] text-[var(--ink)]' : 'text-[var(--ink-2)] hover:bg-[var(--hover-2)]'}`}
      >
        Model
        <ChevronDown size={12} className={`text-[var(--ink-3)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-[calc(100%+10px)] left-0 z-20 flex w-[250px] flex-col gap-1 rounded-[15px] bg-[var(--surface)] p-2 shadow-[var(--shadow-overlay)]">
          <div className="px-2.5 pb-1 pt-1.5">
            <div id="model-group-label" className="text-[10.5px] font-medium text-[var(--ink-3)]">Choose model</div>
            <div className="mt-0.5 text-[10px] text-[var(--ink-3)]">Kimi K3 is recommended for browser tasks.</div>
          </div>
          {/*
            A group of toggle buttons rather than role="menu": Tab and
            Shift+Tab already move between them natively, so the announced
            semantics match the behaviour without hand-rolled key handling.
          */}
          <div ref={groupRef} role="group" aria-labelledby="model-group-label">
            {models.length === 0 && (
              <div className="px-2.5 py-2 text-[12px] text-[var(--ink-3)]">Server default</div>
            )}
            {models.map((option) => {
              const selected = option.id === model;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => select(option.id)}
                  className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[12px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--hover-2)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
                >
                  <span className="w-[18px] shrink-0">
                    {selected && <Check size={14} className="text-[var(--accent)]" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={option.id}>
                    {option.label}
                  </span>
                  {option.default && <span className="rounded-full bg-[var(--accent-tint)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--accent)]">Best</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  /** Called with the trimmed text and a serializable attachment snapshot. */
  onSubmit: (text: string, attachments: ComposerAttachment[]) => void;
  onStop: () => void;
  /** True while a request is in flight (submitted or streaming). */
  isBusy: boolean;
  models: ChatModel[];
  model?: string;
  onModelChange: (id: string) => void;
  pageContext: PageContext | null;
  shareContext: boolean;
  onShareContextChange: (share: boolean) => void;
  agentSettings: AgentSettings;
  onAgentSettingChange: (key: keyof AgentSettings, enabled: boolean) => void;
  /** Receives the complete serializable attachment list after each change. */
  onAttachmentsChange?: (attachments: ComposerAttachment[]) => void;
  /** Receives user-facing upload/capture errors, or null when cleared. */
  onAttachmentError?: (message: string | null) => void;
}

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  isBusy,
  models,
  model,
  onModelChange,
  pageContext,
  shareContext,
  onShareContextChange,
  agentSettings,
  onAgentSettingChange,
  onAttachmentsChange,
  onAttachmentError,
}: ComposerProps) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<ComposerAttachment[]>([]);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isAddingFiles, setIsAddingFiles] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const reportAttachmentError = (message: string | null) => {
    setAttachmentError(message);
    onAttachmentError?.(message);
  };

  const commitAttachments = (next: ComposerAttachment[]) => {
    attachmentsRef.current = next;
    setAttachments(next);
    onAttachmentsChange?.(next);
  };

  // Focus the composer as soon as the side panel opens.
  useEffect(() => {
    textarea.current?.focus();
  }, []);

  // Autogrow up to a fixed ceiling, then scroll.
  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 132)}px`;
  }, [value]);

  const trimmed = value.trim();
  const overLimit = trimmed.length > CHAT_LIMITS.maxMessageChars;
  const canSend = trimmed.length > 0 && !overLimit && !isBusy;

  const send = () => {
    if (!canSend) return;
    onSubmit(trimmed, [...attachmentsRef.current]);
    commitAttachments([]);
    // Return focus for the next turn (clicking the send button steals it).
    requestAnimationFrame(() => textarea.current?.focus());
  };

  const onFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };

  const showCounter =
    trimmed.length > CHAT_LIMITS.maxMessageChars * 0.6 || overLimit;

  const addFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    // Let the same file be selected again after it is removed.
    event.target.value = '';
    if (selected.length === 0) return;

    reportAttachmentError(null);
    const { accepted, rejected } = validateAttachmentCandidates(
      selected,
      attachmentsRef.current.length,
    );
    const validationMessage = summarizeAttachmentRejections(rejected);
    if (validationMessage) reportAttachmentError(validationMessage);
    if (accepted.length === 0) return;

    setIsAddingFiles(true);
    const settled = await Promise.allSettled(
      accepted.map(async (file): Promise<ComposerAttachment> => ({
        id: createAttachmentId(),
        kind: 'upload',
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl: await readFileAsDataUrl(file),
      })),
    );
    setIsAddingFiles(false);

    const additions = settled.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    if (additions.length > 0) {
      commitAttachments([...attachmentsRef.current, ...additions]);
    }
    if (settled.some((result) => result.status === 'rejected')) {
      reportAttachmentError('One or more files could not be read.');
    }
  };

  const removeAttachment = (id: string) => {
    reportAttachmentError(null);
    commitAttachments(
      attachmentsRef.current.filter((attachment) => attachment.id !== id),
    );
  };

  const captureVisibleTab = async () => {
    reportAttachmentError(null);
    const { accepted, rejected } = validateAttachmentCandidates(
      [{ name: 'Visible tab screenshot.png', type: 'image/png', size: 0 }],
      attachmentsRef.current.length,
    );
    if (accepted.length === 0) {
      reportAttachmentError(
        summarizeAttachmentRejections(rejected) ??
          'The screenshot could not be attached.',
      );
      return;
    }

    if (!globalThis.chrome?.tabs?.captureVisibleTab) {
      reportAttachmentError('Visible-tab capture is unavailable in this browser.');
      return;
    }

    setIsCapturing(true);
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
      const size = dataUrlByteLength(dataUrl);
      if (!dataUrl.startsWith('data:image/') || size === 0) {
        throw new Error('The browser returned an invalid screenshot.');
      }
      if (size > MAX_ATTACHMENT_BYTES) {
        reportAttachmentError('The screenshot is larger than 10 MB.');
        return;
      }

      const capturedAt = new Date();
      const timestamp = capturedAt.toISOString().replace(/[:.]/g, '-');
      commitAttachments([
        ...attachmentsRef.current,
        {
          id: createAttachmentId(),
          kind: 'capture',
          name: `visible-tab-${timestamp}.png`,
          mimeType: 'image/png',
          size,
          dataUrl,
        },
      ]);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message.trim() : '';
      reportAttachmentError(
        detail
          ? `Could not capture the visible tab: ${detail}`
          : 'Could not capture the visible tab. Try opening a regular webpage first.',
      );
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="rounded-[18px] bg-[var(--surface)] p-2 shadow-[var(--shadow-overlay)]">
      <form
        className="flex min-h-[108px] flex-col rounded-[12px] bg-[var(--canvas)] px-3 pb-2.5 pt-3 transition-shadow focus-within:shadow-[0_0_0_2px_var(--focus)]"
        onSubmit={onFormSubmit}
      >
        {shareContext && pageContext && (
          <div className="mb-2.5">
            <ContextTag
              pageContext={pageContext}
              onRemove={() => onShareContextChange(false)}
            />
          </div>
        )}

        {attachments.length > 0 && (
          <div
            className="mb-2.5 flex flex-wrap gap-1.5"
            aria-label="Attachments"
          >
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="group flex h-7 max-w-full items-center gap-1.5 rounded-[9px] bg-[var(--field)] px-2.5 text-[11px] font-medium text-[var(--ink-2)]"
              >
                {attachment.kind === 'capture' ? (
                  <ImageIcon size={13} className="shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
                ) : (
                  <Paperclip size={13} className="shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
                )}
                <span className="max-w-[150px] truncate" title={attachment.name}>
                  {attachment.name}
                </span>
                <span className="shrink-0 text-[10px] text-[var(--ink-3)]">
                  {formatFileSize(attachment.size)}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                  className="grid size-5 shrink-0 place-items-center rounded-full text-[var(--ink-3)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
                  aria-label={`Remove ${attachment.name}`}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textarea}
          value={value}
          rows={1}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter inserts a newline. IME composition must
            // not be interrupted, hence the `isComposing` guard.
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="Ask ILA about this page…"
          aria-label="Message ILA"
          aria-invalid={overLimit}
          maxLength={CHAT_LIMITS.maxMessageChars * 2}
          className="min-h-[42px] w-full resize-none border-0 bg-transparent p-0 text-[13.5px] leading-[1.55] text-[var(--ink)] outline-none placeholder:text-[var(--ink-3)]"
        />

        {attachmentError && (
          <p
            className="mb-2 text-[11.5px] font-medium text-[var(--danger)]"
            role="alert"
          >
            {attachmentError}
          </p>
        )}

        <div className="mt-2 flex items-center gap-0.5">
          <ModelMenu
            models={models}
            model={model}
            onModelChange={onModelChange}
          />
          {pageContext && !shareContext && (
            <IconButton
              label="Share this page as context"
              onClick={() => onShareContextChange(true)}
            >
              <Globe size={17} />
            </IconButton>
          )}
          {showCounter && (
            <span className={`ml-1 text-[10px] tabular-nums ${overLimit ? 'font-medium text-[var(--danger)]' : 'text-[var(--ink-3)]'}`} aria-live="polite">
              {trimmed.length.toLocaleString()} / {CHAT_LIMITS.maxMessageChars.toLocaleString()}
            </span>
          )}
          <div className="flex-1" />
          <input
            ref={fileInput}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            multiple
            onChange={(event) => void addFiles(event)}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
          <IconButton
            label="Attach files"
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={
              isAddingFiles || attachments.length >= MAX_ATTACHMENT_COUNT
            }
          >
            <FileUp size={17} />
          </IconButton>
          <IconButton
            label={isCapturing ? 'Capturing visible tab' : 'Capture visible tab'}
            type="button"
            onClick={() => void captureVisibleTab()}
            disabled={
              isCapturing ||
              isAddingFiles ||
              attachments.length >= MAX_ATTACHMENT_COUNT
            }
          >
            <Crop size={17} />
          </IconButton>
          <IconButton label="Voice input (coming soon)" disabled>
            <Mic2 size={17} />
          </IconButton>

          {isBusy ? (
            <button
              type="button"
              onClick={onStop}
              className="ml-1 grid size-9 place-items-center rounded-[10px] bg-[var(--ink)] text-[var(--canvas)] transition-[opacity,transform] hover:opacity-90 active:scale-[.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
              aria-label="Stop generating"
            >
              <Square size={16} strokeWidth={3} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              className="ml-1 grid size-9 place-items-center rounded-[10px] bg-[var(--accent)] text-white transition-[opacity,transform] hover:opacity-90 active:scale-[.96] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
              disabled={!canSend}
              aria-label="Send message"
            >
              <ArrowUp size={18} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
