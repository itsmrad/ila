import { AlertCircle, CheckCircle2, ChevronDown, Square, X } from 'lucide-react';
import type { AgentPlan, AgentPlanStep, HumanInputRequest } from '@ila/shared';
import { useState } from 'react';
import {
  ApprovalCard,
  LoadingState,
  TaskRow,
  ThinkingTrace,
} from '../ai';
import { HumanInputCard, type HumanInputSubmission } from './HumanInputCard';

export type AgentRunStatus = 'planning' | 'awaiting-confirmation' | 'awaiting-input' | 'running' | 'complete' | 'failed';

export interface AgentRunView {
  status: AgentRunStatus;
  task: string;
  plan?: AgentPlan;
  activeStep?: number;
  completedSteps?: number;
  error?: string;
  summary?: string;
  thinking?: boolean;
  humanInput?: HumanInputRequest;
  inputSubmitting?: boolean;
  execution?: Array<{
    step: AgentPlanStep;
    status: 'running' | 'succeeded' | 'failed';
    error?: string;
  }>;
}

interface AgentRunPanelProps {
  run: AgentRunView;
  onConfirm: () => void;
  onHumanInput: (submission: HumanInputSubmission) => void;
  onCancel: () => void;
}

export function AgentRunPanel({ run, onConfirm, onHumanInput, onCancel }: AgentRunPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const rows: Array<{
    step: AgentPlanStep;
    status: 'pending' | 'running' | 'succeeded' | 'failed';
    error?: string;
  }> = run.execution?.length
    ? run.execution
    : run.plan?.steps.map((step) => ({
        step,
        status: 'pending' as const,
      })) ?? [];

  if (run.status === 'awaiting-confirmation') {
    return (
      <ApprovalCard
        title={run.plan?.summary ?? 'Run this browser task?'}
        description="ILA will operate the active tab, observe each result, and stop if the page no longer matches the task."
        onApprove={onConfirm}
        onCancel={onCancel}
      >
        <ol className="divide-y divide-dashed divide-[var(--line)]">
          {rows.map(({ step, status, error }, index) => (
            <TaskRow key={`${step.id}-${index}`} title={step.title} action={step.action} status={status} {...(error ? { error } : {})} />
          ))}
        </ol>
      </ApprovalCard>
    );
  }

  if (run.status === 'awaiting-input' && run.humanInput) {
    return (
      <HumanInputCard
        request={run.humanInput}
        submitting={run.inputSubmitting}
        {...(run.error ? { error: run.error } : {})}
        onSubmit={onHumanInput}
        onCancel={onCancel}
      />
    );
  }

  return (
    <section className="py-2" aria-label="Browser agent activity" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-[8px] ${run.status === 'failed' ? 'bg-[var(--danger-tint)] text-[var(--danger)]' : run.status === 'complete' ? 'bg-[var(--success-tint)] text-[var(--success)]' : 'bg-[var(--accent-tint)] text-[var(--accent)]'}`}>
          {run.status === 'failed' ? <AlertCircle size={14} /> : run.status === 'complete' ? <CheckCircle2 size={14} /> : <span className="size-2 rounded-[2px] bg-current motion-safe:animate-pulse" />}
        </span>
        <div className="min-w-0 flex-1">
          {run.status === 'planning' ? (
            <LoadingState label="Planning browser task" />
          ) : run.status === 'running' ? (
            <ThinkingTrace label={run.thinking ? 'Observing the page' : 'Using the browser'} active={run.thinking} />
          ) : (
            <div className="text-[12.5px] font-medium text-[var(--ink)]">
              {run.status === 'complete' ? 'Task completed' : 'Task needs attention'}
            </div>
          )}
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-2)]">
            {run.summary ?? run.plan?.summary ?? run.task}
          </p>
        </div>
        {(rows.length > 0 || run.status === 'running') && (
          <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-label={expanded ? 'Collapse task activity' : 'Expand task activity'} className="grid size-7 shrink-0 place-items-center rounded-[7px] text-[var(--ink-3)] transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]">
            <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {expanded && rows.length > 0 && (
        <ol className="ml-10 mt-2 divide-y divide-dashed divide-[var(--line)]">
          {rows.map(({ step, status, error }, index) => (
            <TaskRow key={`${step.id}-${index}`} title={step.title} action={step.action} status={status} {...(error ? { error } : {})} />
          ))}
        </ol>
      )}

      {run.error && <p className="ml-10 mt-2 text-[12px] leading-relaxed text-[var(--danger)]">{run.error}</p>}

      {(run.status === 'planning' || run.status === 'running') && (
        <button type="button" onClick={onCancel} className="ml-9 mt-2 inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] text-[var(--ink-3)] transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]">
          {run.status === 'running' ? <Square size={10} fill="currentColor" /> : <X size={12} />}
          {run.status === 'running' ? 'Stop task' : 'Cancel'}
        </button>
      )}
    </section>
  );
}
