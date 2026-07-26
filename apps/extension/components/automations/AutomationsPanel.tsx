import { useEffect, useState } from 'react';
import { Loader2, Check, CircleAlert, Play } from 'lucide-react';
import {
  AUTOMATIONS,
  onAutomationProgress,
  startAutomation,
  type AutomationId,
} from '../../lib/automations';
import type { BrowserTab, ContextMode } from '../../lib/tab-context';

/**
 * Automations list.
 *
 * Clicking one hands a payload to the background worker and renders whatever it
 * reports back. No automation logic runs here, and the worker's current
 * responses are mocked — this validates the messaging path introduced in this
 * stage.
 */

interface RunState {
  runId: string;
  status: 'running' | 'complete' | 'error';
  message: string;
}

export interface AutomationsPanelProps {
  mode: ContextMode;
  selectedTabs: BrowserTab[];
}

export function AutomationsPanel({ mode, selectedTabs }: AutomationsPanelProps) {
  const [runs, setRuns] = useState<Partial<Record<AutomationId, RunState>>>({});

  useEffect(
    () =>
      onAutomationProgress((progress) => {
        setRuns((current) => {
          // A late update from a superseded run must not overwrite the newest one.
          const existing = current[progress.automationId];
          if (existing && existing.runId !== progress.runId) return current;
          return {
            ...current,
            [progress.automationId]: {
              runId: progress.runId,
              status: progress.status,
              message: progress.message,
            },
          };
        });
      }),
    [],
  );

  const run = async (automationId: AutomationId) => {
    const response = await startAutomation({
      automationId,
      mode,
      tabs: selectedTabs,
    });

    setRuns((current) => ({
      ...current,
      [automationId]: response.accepted
        ? {
            runId: response.runId,
            status: 'running',
            message: response.message ?? 'Starting…',
          }
        : {
            runId: response.runId,
            status: 'error',
            message: response.message ?? 'Could not start that automation.',
          },
    }));
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-[#8a8a8a]">
        {selectedTabs.length > 0
          ? `${selectedTabs.length} tab(s) will be passed to the automation.`
          : 'No tab context selected — automations will run without tab data.'}
      </p>

      <ul className="flex flex-col gap-2">
        {AUTOMATIONS.map((automation) => {
          const state = runs[automation.id];
          return (
            <li
              key={automation.id}
              className="rounded-[16px] border border-[#e8e8e8] bg-white p-3 shadow-[0_2px_6px_#00000008]"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-[#282828]">
                    {automation.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#a0a0a0]">
                    {automation.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void run(automation.id)}
                  disabled={!automation.available || state?.status === 'running'}
                  className="flex shrink-0 items-center gap-1.5 rounded-[12px] bg-[#aebcf0] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#97a8e8] disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#a9baf6]"
                >
                  {state?.status === 'running' ? (
                    <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Play size={13} aria-hidden="true" />
                  )}
                  Run
                </button>
              </div>

              {state && (
                <p
                  aria-live="polite"
                  className={`mt-2 flex items-center gap-1.5 text-[11px] ${
                    state.status === 'error' ? 'text-[#b4232a]' : 'text-[#707070]'
                  }`}
                >
                  {state.status === 'complete' && (
                    <Check size={12} className="text-[#2f8f4e]" aria-hidden="true" />
                  )}
                  {state.status === 'error' && (
                    <CircleAlert size={12} aria-hidden="true" />
                  )}
                  {state.message}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
