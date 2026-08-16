import { useCallback, useEffect, useRef, useState } from 'react';
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

/** How long to wait for progress before assuming the worker is gone. */
const RUN_TIMEOUT_MS = 15_000;

export interface AutomationsPanelProps {
  mode: ContextMode;
  selectedTabs: BrowserTab[];
}

export function AutomationsPanel({ mode, selectedTabs }: AutomationsPanelProps) {
  const [runs, setRuns] = useState<Partial<Record<AutomationId, RunState>>>({});
  const [starting, setStarting] = useState<Partial<Record<AutomationId, boolean>>>(
    {},
  );
  /** Watchdog timers, keyed by automation, cleared when a run finishes. */
  const watchdogs = useRef(new Map<AutomationId, ReturnType<typeof setTimeout>>());

  const settle = useCallback((automationId: AutomationId) => {
    const timer = watchdogs.current.get(automationId);
    if (timer !== undefined) {
      clearTimeout(timer);
      watchdogs.current.delete(automationId);
    }
  }, []);

  useEffect(() => {
    const watchdogTimers = watchdogs.current;
    return () => {
      for (const timer of watchdogTimers.values()) clearTimeout(timer);
      watchdogTimers.clear();
    };
  }, []);

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
        if (progress.status !== 'running') settle(progress.automationId);
      }),
    [settle],
  );

  const run = async (automationId: AutomationId) => {
    // Marked before the await so a second click cannot start a parallel run and
    // clobber the first run's progress tracking.
    if (starting[automationId]) return;
    setStarting((current) => ({ ...current, [automationId]: true }));

    try {
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

      settle(automationId);
      if (!response.accepted) return;

      // The service worker can be suspended mid-run, in which case no further
      // progress arrives. Fail visibly instead of spinning forever.
      watchdogs.current.set(
        automationId,
        setTimeout(() => {
          watchdogs.current.delete(automationId);
          setRuns((current) => {
            const existing = current[automationId];
            if (existing?.runId !== response.runId) return current;
            if (existing.status !== 'running') return current;
            return {
              ...current,
              [automationId]: {
                runId: response.runId,
                status: 'error',
                message: 'The background worker stopped responding.',
              },
            };
          });
        }, RUN_TIMEOUT_MS),
      );
    } finally {
      setStarting((current) => ({ ...current, [automationId]: false }));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-[var(--ink-3)]">
        {selectedTabs.length > 0
          ? `${selectedTabs.length} tab(s) will be passed to the automation.`
          : 'No tab context selected — automations will run without tab data.'}
      </p>

      <ul className="flex flex-col gap-2">
        {AUTOMATIONS.map((automation) => {
          const state = runs[automation.id];
          const busy = starting[automation.id] === true || state?.status === 'running';
          return (
            <li
              key={automation.id}
              className="rounded-[15px] bg-[var(--surface)] p-3 shadow-[var(--shadow-hairline)]"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-[var(--ink)]">
                    {automation.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
                    {automation.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void run(automation.id)}
                  disabled={!automation.available || busy}
                  className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
                >
                  {busy ? (
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
                    state.status === 'error' ? 'text-[var(--danger)]' : 'text-[var(--ink-2)]'
                  }`}
                >
                  {state.status === 'complete' && (
                    <Check size={12} className="text-[var(--success)]" aria-hidden="true" />
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
