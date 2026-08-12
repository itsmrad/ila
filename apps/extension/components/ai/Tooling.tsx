import {
  Check,
  Circle,
  Globe2,
  LoaderCircle,
  MousePointer2,
  TextCursorInput,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { BrowserAction } from '@ila/shared';

const actionIcons: Partial<Record<BrowserAction['type'], LucideIcon>> = {
  navigate: Globe2,
  open_tab: Globe2,
  click: MousePointer2,
  type: TextCursorInput,
  select: TextCursorInput,
  check: Check,
};

export function ToolChip({ action }: { action: BrowserAction }) {
  const Icon = actionIcons[action.type] ?? Circle;
  const label = action.type.replace('_', ' ');
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-[var(--field)] px-2 text-[10.5px] font-medium capitalize text-[var(--ink-2)]">
      <Icon size={11} aria-hidden="true" />
      {label}
    </span>
  );
}

export function TaskRow({
  title,
  action,
  status,
  error,
}: {
  title: string;
  action: BrowserAction;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  error?: string;
}) {
  return (
    <li className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-2.5 py-2.5">
      <span className="mt-0.5 grid size-[18px] place-items-center rounded-full bg-[var(--field)] text-[var(--ink-3)]">
        {status === 'succeeded' ? (
          <Check size={11} strokeWidth={2.7} className="text-[var(--success)]" />
        ) : status === 'failed' ? (
          <X size={11} strokeWidth={2.7} className="text-[var(--danger)]" />
        ) : status === 'running' ? (
          <LoaderCircle size={11} className="animate-spin motion-reduce:animate-none text-[var(--accent)]" />
        ) : (
          <Circle size={6} fill="currentColor" />
        )}
      </span>
      <span className="min-w-0">
        <span className={`block text-[12.5px] leading-[1.45] ${status === 'running' ? 'font-medium text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}>
          {title}
        </span>
        {error && <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--danger)]">{error}</span>}
      </span>
      <ToolChip action={action} />
    </li>
  );
}
