import { CodeBlock, DiffTable } from './DataDisplay';

export function StreamingText({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const segments = text.split(/```([\w-]*)\n([\s\S]*?)```/g);
  return (
    <div className="text-[13.5px] leading-[1.7] text-[var(--ink)]" aria-live={streaming ? 'polite' : undefined}>
      {segments.map((segment, index) => {
        if (index % 3 === 0) return <span key={index} className="whitespace-pre-wrap break-words">{segment}</span>;
        if (index % 3 === 1) return null;
        const language = segments[index - 1] || undefined;
        return language === 'diff'
          ? <DiffTable key={index} lines={segment.replace(/\n$/, '').split('\n')} />
          : <CodeBlock key={index} code={segment.replace(/\n$/, '')} {...(language ? { language } : {})} />;
      })}
      {streaming && <span aria-hidden="true" className="ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 rounded-full bg-[var(--accent)] animate-pulse" />}
    </div>
  );
}
