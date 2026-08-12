import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Play,
  Square,
  X,
} from 'lucide-react';
import type { AgentPlan } from '@ila/shared';
import { useState } from 'react';

export type AgentRunStatus = 'planning' | 'awaiting-confirmation' | 'running' | 'complete' | 'failed';

export interface AgentRunView {
  status: AgentRunStatus;
  task: string;
  plan?: AgentPlan;
  activeStep?: number;
  completedSteps?: number;
  error?: string;
}

interface AgentRunPanelProps {
  run: AgentRunView;
  onConfirm: () => void;
  onCancel: () => void;
}

function statusLabel(status: AgentRunStatus): string {
  switch (status) {
    case 'planning':
      return 'Planning';
    case 'awaiting-confirmation':
      return 'Ready to run';
    case 'running':
      return 'Controlling browser';
    case 'complete':
      return 'Completed';
    case 'failed':
      return 'Needs attention';
  }
}

export function AgentRunPanel({ run, onConfirm, onCancel }: AgentRunPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const completed = run.completedSteps ?? 0;

  return (
    <section
      className="overflow-hidden rounded-[22px] border border-[#dfe3f5] bg-white shadow-[0_12px_34px_#2c35610f,0_2px_8px_#0000000a]"
      aria-label="Browser agent run"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-[#eeefff] text-[#6758dc]">
          {run.status === 'planning' || run.status === 'running' ? (
            <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" />
          ) : run.status === 'complete' ? (
            <Check size={18} strokeWidth={2.5} />
          ) : run.status === 'failed' ? (
            <AlertTriangle size={18} />
          ) : (
            <Play size={17} fill="currentColor" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.11em] text-[#8b86aa]">
            {statusLabel(run.status)}
          </div>
          <div className="mt-0.5 truncate text-[13px] font-semibold text-[#2b2b33]" title={run.task}>
            {run.plan?.summary ?? run.task}
          </div>
        </div>
        {run.plan && (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="grid h-8 w-8 place-items-center rounded-[10px] text-[#777582] transition-colors hover:bg-[#f4f4f7] focus-visible:outline-2 focus-visible:outline-[#a9baf6]"
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse agent steps' : 'Expand agent steps'}
          >
            {expanded ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
          </button>
        )}
      </div>

      {expanded && run.plan && (
        <ol className="mx-3 mb-3 space-y-1 rounded-[16px] bg-[#f7f7fa] p-2">
          {run.plan.steps.map((step, index) => {
            const isComplete = index < completed;
            const isActive = run.status === 'running' && index === run.activeStep;
            return (
              <li key={step.id} className="flex items-start gap-2.5 rounded-[12px] px-2.5 py-2 text-[12px]">
                <span
                  className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                    isComplete
                      ? 'bg-[#dff5e8] text-[#27834d]'
                      : isActive
                        ? 'bg-[#e5e7ff] text-[#6254d5]'
                        : 'bg-white text-[#9897a0]'
                  }`}
                >
                  {isComplete ? <Check size={11} strokeWidth={3} /> : index + 1}
                </span>
                <span className={isActive ? 'font-semibold text-[#3b3850]' : 'text-[#67666f]'}>
                  {step.title}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {run.error && <p className="mx-4 mb-3 text-[12px] text-[#c8444c]">{run.error}</p>}

      {(run.status === 'awaiting-confirmation' || run.status === 'running' || run.status === 'planning') && (
        <div className="flex items-center justify-end gap-2 border-t border-[#eeeeF3] px-3 py-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center gap-1.5 rounded-[11px] px-3 text-[12px] font-semibold text-[#66646c] transition-colors hover:bg-[#f3f3f5] focus-visible:outline-2 focus-visible:outline-[#a9baf6]"
          >
            {run.status === 'running' ? <Square size={12} fill="currentColor" /> : <X size={14} />}
            {run.status === 'running' ? 'Stop' : 'Cancel'}
          </button>
          {run.status === 'awaiting-confirmation' && (
            <button
              type="button"
              onClick={onConfirm}
              className="inline-flex h-9 items-center gap-1.5 rounded-[11px] bg-[#6154d8] px-3.5 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#5145c5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7468e2]"
            >
              <Play size={13} fill="currentColor" />
              Run steps
            </button>
          )}
        </div>
      )}
    </section>
  );
}
