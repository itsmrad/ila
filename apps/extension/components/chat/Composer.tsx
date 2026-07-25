import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowUp,
  Check,
  Crop,
  Globe,
  Mic2,
  Paperclip,
  SlidersHorizontal,
  Square,
  X,
} from 'lucide-react';
import { IconButton } from '@ila/ui';
import { CHAT_LIMITS, type ChatModel, type PageContext } from '@ila/shared';

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

  if (models.length === 0) return null;

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
        </div>
      )}
    </div>
  );
}

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  /** Called with the trimmed text; never called with an empty string. */
  onSubmit: (text: string) => void;
  onStop: () => void;
  /** True while a request is in flight (submitted or streaming). */
  isBusy: boolean;
  models: ChatModel[];
  model?: string;
  onModelChange: (id: string) => void;
  pageContext: PageContext | null;
  shareContext: boolean;
  onShareContextChange: (share: boolean) => void;
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
}: ComposerProps) {
  const textarea = useRef<HTMLTextAreaElement>(null);

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
    onSubmit(trimmed);
    // Return focus for the next turn (clicking the send button steals it).
    requestAnimationFrame(() => textarea.current?.focus());
  };

  const onFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };

  const showCounter =
    trimmed.length > CHAT_LIMITS.maxMessageChars * 0.6 || overLimit;

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

        <div className="flex items-center gap-1 md:gap-[5px] mt-auto">
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
              <Globe size={20} />
            </IconButton>
          )}
          <div className="flex-1" />
          <IconButton label="Attach file (coming soon)" disabled>
            <Paperclip size={20} />
          </IconButton>
          <IconButton label="Capture screenshot (coming soon)" disabled>
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
