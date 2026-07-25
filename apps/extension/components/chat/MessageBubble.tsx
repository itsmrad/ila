import type { UIMessage } from 'ai';
import { Sparkles, User } from 'lucide-react';
import { IlaMark } from '@ila/ui';

/** Concatenated text of every text part, in order. */
function textOf(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

/** Concatenated reasoning trace, when the model exposes one. */
function reasoningOf(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'reasoning')
    .map((part) => part.text)
    .join('')
    .trim();
}

/** Three-dot "thinking" affordance shown before the first token arrives. */
function TypingDots() {
  return (
    <span
      className="inline-flex items-center gap-1 py-1"
      role="status"
      aria-label="ILA is thinking"
    >
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-[6px] w-[6px] rounded-full bg-[#c3c3c3] animate-bounce"
          style={{ animationDelay: `${delay}ms`, animationDuration: '1s' }}
        />
      ))}
    </span>
  );
}

export function MessageBubble({
  message,
  isStreaming = false,
}: {
  message: UIMessage;
  /** True while this message is the one currently being streamed. */
  isStreaming?: boolean;
}) {
  const text = textOf(message);

  if (message.role === 'user') {
    return (
      <div className="w-fit max-w-[85%] md:max-w-[76%] ml-auto p-4 md:px-[28px] md:pt-[23px] md:pb-[19px] grid gap-[5px] bg-[#f0f0f0] rounded-[28px] leading-[1.25]">
        <div className="flex items-center gap-[9px] text-[#303030] text-sm font-medium mb-1">
          <User size={16} /> <span>You</span>
        </div>
        <div className="text-[15px] text-[#181818] whitespace-pre-wrap break-words">
          {text}
        </div>
      </div>
    );
  }

  const reasoning = reasoningOf(message);

  return (
    <div className="flex gap-4 max-w-[655px] mx-auto w-full">
      <div className="mt-1">
        <IlaMark />
      </div>
      <div className="flex-1 min-w-0 text-[15px] md:text-base leading-relaxed text-[#181818]">
        <div className="flex items-center gap-[9px] text-[#303030] text-sm font-medium mb-2">
          <Sparkles size={16} className="text-[#aebcf0]" /> <span>ILA</span>
        </div>

        {reasoning && (
          <details className="mb-2 rounded-[12px] border border-[#ececec] bg-[#fafafa] px-3 py-2 text-[12px] text-[#7a7a7a]">
            <summary className="cursor-pointer select-none font-medium">
              Reasoning
            </summary>
            <div className="mt-2 whitespace-pre-wrap break-words">{reasoning}</div>
          </details>
        )}

        {text ? (
          <div
            className="whitespace-pre-wrap break-words"
            aria-live={isStreaming ? 'polite' : undefined}
          >
            {text}
            {isStreaming && (
              <span
                className="ml-[2px] inline-block h-[1em] w-[2px] translate-y-[2px] bg-[#aebcf0] animate-pulse"
                aria-hidden="true"
              />
            )}
          </div>
        ) : (
          <TypingDots />
        )}
      </div>
    </div>
  );
}
