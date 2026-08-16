import type { UIMessage } from 'ai';
import { IlaMark } from '@ila/ui';
import { LoadingState, StreamingText, ThinkingTrace } from '../ai';

function textOf(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

function reasoningOf(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'reasoning')
    .map((part) => part.text)
    .join('')
    .trim();
}

export function MessageBubble({
  message,
  isStreaming = false,
}: {
  message: UIMessage;
  isStreaming?: boolean;
}) {
  const text = textOf(message);

  if (message.role === 'user') {
    return (
      <div className="ml-auto max-w-[88%] rounded-[15px] bg-[var(--field)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--ink)] shadow-[var(--shadow-hairline)]">
        <div className="whitespace-pre-wrap break-words">{text}</div>
      </div>
    );
  }

  const reasoning = reasoningOf(message);
  return (
    <article className="flex w-full gap-3">
      <div className="mt-0.5 scale-[.82]"><IlaMark /></div>
      <div className="min-w-0 flex-1">
        {reasoning && (
          <div className="mb-2">
            <ThinkingTrace label="Reasoning">{reasoning}</ThinkingTrace>
          </div>
        )}
        {text ? (
          <StreamingText text={text} streaming={isStreaming} />
        ) : (
          <LoadingState label="Thinking" />
        )}
      </div>
    </article>
  );
}
