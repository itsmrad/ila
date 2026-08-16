import { ChevronDown, Sparkles } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

export function LoadingState({ label = 'Working' }: { label?: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Date.now() - started), 100);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className="inline-flex items-center gap-2.5 text-[12.5px] text-[var(--ink-2)]" role="status">
      <span aria-hidden="true" className="grid grid-cols-3 gap-[1.5px]">
        {Array.from({ length: 9 }, (_, index) => (
          <span
            key={index}
            className="size-1 rounded-[1px] bg-[var(--ink)] opacity-15 motion-safe:animate-[pixel-on_650ms_ease-in-out_infinite]"
            style={{ animationDelay: `${(index % 4) * 90}ms` }}
          />
        ))}
      </span>
      <span className="bui-shimmer font-medium">{label}</span>
      <span className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
        {(elapsed / 1000).toFixed(1)}s
      </span>
    </span>
  );
}

export function ThinkingTrace({
  label = 'Thinking',
  active = false,
  children,
}: {
  label?: string;
  active?: boolean;
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(Boolean(children));
  return (
    <div className="text-[12.5px] text-[var(--ink-2)]">
      <button
        type="button"
        onClick={() => children && setExpanded((value) => !value)}
        aria-expanded={children ? expanded : undefined}
        className="-ml-1.5 inline-flex items-center gap-2 rounded-[7px] px-1.5 py-1 transition-colors hover:bg-[var(--hover-2)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
      >
        <Sparkles size={14} fill="currentColor" className="text-[var(--ink-2)]" />
        <span className={active ? 'bui-shimmer font-medium' : 'font-medium'}>{label}</span>
        {children && (
          <ChevronDown
            size={13}
            className={`text-[var(--ink-3)] transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
          />
        )}
      </button>
      {children && (
        <div className={`grid transition-[grid-template-rows,opacity] duration-300 ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
            <div className="ml-[5px] mt-1 border-l border-[var(--line)] py-1 pl-4 leading-relaxed text-[var(--ink-3)]">
              {children}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
