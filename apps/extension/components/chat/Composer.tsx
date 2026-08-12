import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import {
  ArrowUp,
  Bot,
  Brain,
  Check,
  Crop,
  FileUp,
  Globe,
  Image as ImageIcon,
  Mic2,
  Paperclip,
  SlidersHorizontal,
  Database,
  ShieldOff,
  Square,
  X,
} from 'lucide-react';
import { IconButton } from '@ila/ui';
import { CHAT_LIMITS, type ChatModel, type PageContext } from '@ila/shared';
import type { AgentSettings } from '../../lib/settings-storage';
import {
  ATTACHMENT_ACCEPT,
  dataUrlByteLength,
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_BYTES,
  summarizeAttachmentRejections,
  validateAttachmentCandidates,
  type ComposerAttachment,
} from './attachments';

export type { ComposerAttachment } from './attachments';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('The selected file could not be read.'));
      }
    });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('The selected file could not be read.'));
    });
    reader.readAsDataURL(file);
  });
}

function attachmentId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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

  return (
    <div className="group relative flex items-center gap-2 w-fit h-[34px] px-[14px] mb-3 rounded-[12px] bg-[#f0f0f0] border border-[#e5e5e5] text-[#4e4e4e] text-[13px] font-medium transition-all hover:bg-[#e8e8e8] shadow-sm">
      <Globe size={16} className="text-gray-500" aria-hidden="true" />
      <span className="max-w-[160px] truncate" title={pageContext.url}>
        {hostname}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ml-1 w-5 h-5 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition-all cursor-pointer"
        aria-label="Stop sharing this page"
      >
        <X size={12} className="text-gray-600" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Model picker backed by the server's allowlist. */
function ModelMenu({
  models,
  model,
  onModelChange,
  agentSettings,
  onAgentSettingChange,
}: {
  models: ChatModel[];
  model?: string;
  onModelChange: (id: string) => void;
  agentSettings: AgentSettings;
  onAgentSettingChange: (key: keyof AgentSettings, enabled: boolean) => void;
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
      <IconButton
        ref={trigger}
        label="Model"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={open ? 'bg-[#f0f0f0] text-[#303030]' : ''}
      >
        <SlidersHorizontal size={20} />
      </IconButton>

      {open && (
        <div className="absolute bottom-[calc(100%+12px)] left-0 w-[240px] p-2 rounded-[24px] bg-white border border-[#e8e8e8] shadow-[0_16px_40px_#00000018,0_4px_12px_#00000008] z-20 flex flex-col gap-1">
          <div
            id="model-group-label"
            className="px-3 pt-2 pb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider"
          >
            Model
          </div>
          {/*
            A group of toggle buttons rather than role="menu": Tab and
            Shift+Tab already move between them natively, so the announced
            semantics match the behaviour without hand-rolled key handling.
          */}
          <div ref={groupRef} role="group" aria-labelledby="model-group-label">
            {models.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-[#96949d]">Server default</div>
            )}
            {models.map((option) => {
              const selected = option.id === model;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => select(option.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-gray-700 hover:bg-[#f5f5f5] rounded-xl transition-colors font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-[#a9baf6]"
                >
                  <span className="w-[18px] shrink-0">
                    {selected && <Check size={16} className="text-[#6d5efc]" />}
                  </span>
                  <span className="truncate" title={option.id}>
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mx-2 my-2 h-px bg-[#ececf0]" />
          <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Capabilities
          </div>
          <div className="space-y-0.5 px-1 pb-1">
            {([
              ['reasoning', 'Reasoning', Brain],
              ['browserAgent', 'Browser agent', Bot],
              ['memory', 'Memory', Database],
              ['skipConfirmation', 'Skip confirmation', ShieldOff],
            ] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                role="switch"
                aria-checked={agentSettings[key]}
                onClick={() => onAgentSettingChange(key, !agentSettings[key])}
                className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-[12px] font-medium text-[#55545d] transition-colors hover:bg-[#f5f5f7] focus-visible:outline-2 focus-visible:outline-[#a9baf6]"
              >
                <Icon size={15} className={agentSettings[key] ? 'text-[#6557d8]' : 'text-[#a2a1a8]'} />
                <span className="flex-1">{label}</span>
                <span
                  aria-hidden="true"
                  className={`relative h-[18px] w-8 rounded-full transition-colors ${agentSettings[key] ? 'bg-[#6d5efc]' : 'bg-[#d8d8dd]'}`}
                >
                  <span className={`absolute top-[3px] h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${agentSettings[key] ? 'translate-x-[17px]' : 'translate-x-[3px]'}`} />
                </span>
              </button>
            ))}
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
        id: attachmentId(),
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
          id: attachmentId(),
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
    <div className="p-2 md:p-[10px] border border-[#dedede] rounded-[30px] md:rounded-[35px] bg-[#fafafa]/80 backdrop-blur-md shadow-[0_8px_28px_#00000012,0_2px_5px_#00000018]">
      <form
        className="flex flex-col min-h-[100px] p-3 md:px-[18px] md:pt-[16px] md:pb-[14px] border border-[#dedede] rounded-[22px] md:rounded-[26px] bg-white shadow-inner transition-colors focus-within:border-[#a9baf6] focus-within:shadow-[0_0_0_2px_#a9baf633]"
        onSubmit={onFormSubmit}
      >
        {shareContext && pageContext && (
          <ContextTag
            pageContext={pageContext}
            onRemove={() => onShareContextChange(false)}
          />
        )}

        {attachments.length > 0 && (
          <div
            className="mb-3 flex flex-wrap gap-2"
            aria-label="Attachments"
          >
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="group flex h-[34px] max-w-full items-center gap-2 rounded-[12px] border border-[#e5e5e5] bg-[#f5f5f5] px-3 text-[12px] font-medium text-[#555] shadow-sm"
              >
                {attachment.kind === 'capture' ? (
                  <ImageIcon size={15} className="shrink-0 text-gray-500" aria-hidden="true" />
                ) : (
                  <Paperclip size={15} className="shrink-0 text-gray-500" aria-hidden="true" />
                )}
                <span className="max-w-[150px] truncate" title={attachment.name}>
                  {attachment.name}
                </span>
                <span className="shrink-0 text-[10px] text-[#999]">
                  {formatFileSize(attachment.size)}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                  className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-full bg-black/5 transition-colors hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-[#a9baf6]"
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
          aria-describedby="composer-hint"
          aria-invalid={overLimit}
          maxLength={CHAT_LIMITS.maxMessageChars * 2}
          className="w-full min-h-[44px] p-0 resize-none border-0 outline-none text-[#222] bg-transparent leading-[1.45] text-base md:text-[17px] placeholder-[#aaa]"
        />

        <div
          id="composer-hint"
          className="mt-1 mb-2 flex items-center justify-between gap-3 text-[11px] text-[#a8a8a8]"
        >
          <span>
            <kbd className="font-sans font-medium text-[#8a8a8a]">Enter</kbd> to
            send ·{' '}
            <kbd className="font-sans font-medium text-[#8a8a8a]">
              Shift + Enter
            </kbd>{' '}
            for a new line
          </span>
          {showCounter && (
            <span
              className={overLimit ? 'font-medium text-[#e5484d]' : undefined}
              aria-live="polite"
            >
              {trimmed.length.toLocaleString()} /{' '}
              {CHAT_LIMITS.maxMessageChars.toLocaleString()}
            </span>
          )}
        </div>

        {attachmentError && (
          <p
            className="mb-2 text-[12px] font-medium text-[#c73f45]"
            role="alert"
          >
            {attachmentError}
          </p>
        )}

        <div className="flex items-center gap-1 md:gap-[5px] mt-auto">
          <ModelMenu
            models={models}
            model={model}
            onModelChange={onModelChange}
            agentSettings={agentSettings}
            onAgentSettingChange={onAgentSettingChange}
          />
          {pageContext && !shareContext && (
            <IconButton
              label="Share this page as context"
              onClick={() => onShareContextChange(true)}
            >
              <Globe size={20} />
            </IconButton>
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
            <FileUp size={20} />
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
            <Crop size={20} />
          </IconButton>
          <IconButton label="Voice input (coming soon)" disabled>
            <Mic2 size={20} />
          </IconButton>

          {isBusy ? (
            <button
              type="button"
              onClick={onStop}
              className="w-[38px] h-[38px] md:w-[47px] md:h-[47px] p-0 border-0 rounded-[12px] md:rounded-[15px] flex items-center justify-center bg-[#303030] hover:bg-[#181818] text-white cursor-pointer transition-colors ml-1 shadow-sm"
              aria-label="Stop generating"
            >
              <Square size={16} strokeWidth={3} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              className="w-[38px] h-[38px] md:w-[47px] md:h-[47px] p-0 border-0 rounded-[12px] md:rounded-[15px] flex items-center justify-center bg-[#aebcf0] hover:bg-[#97a8e8] text-white cursor-pointer transition-colors disabled:opacity-55 disabled:cursor-not-allowed ml-1 shadow-sm"
              disabled={!canSend}
              aria-label="Send message"
            >
              <ArrowUp size={22} strokeWidth={2.6} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
