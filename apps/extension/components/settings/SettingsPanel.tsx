import { useEffect, useRef, useState } from 'react';
import { Brain, ChevronRight, KeyRound, Loader2, RotateCcw, X } from 'lucide-react';
import {
  loadAgentSettings,
  resetAgentSettings,
  updateAgentSettings,
  type AgentSettings,
} from '../../lib/settings-storage';

export interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onChange?: (settings: AgentSettings) => void;
  onOpenMemory?: () => void;
  onOpenAccountSettings?: () => void;
}

const OPTIONS: ReadonlyArray<{
  key: keyof AgentSettings;
  label: string;
  description: string;
}> = [
  {
    key: 'reasoning',
    label: 'Reasoning',
    description: 'Allow models to reason through complex requests.',
  },
  {
    key: 'browserAgent',
    label: 'Browser agent',
    description: 'Allow ILA to propose and perform browser actions.',
  },
  {
    key: 'memory',
    label: 'Browsing memory',
    description: 'Keep bounded page context locally for future requests.',
  },
  {
    key: 'skipConfirmation',
    label: 'Skip confirmations',
    description: 'Allow actions without asking first. Use with care.',
  },
];

/** Standalone settings surface; the parent decides where it is mounted. */
export function SettingsPanel({
  open,
  onClose,
  onChange,
  onOpenMemory,
  onOpenAccountSettings,
}: SettingsPanelProps) {
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [saving, setSaving] = useState<keyof AgentSettings | 'reset' | null>(
    null,
  );
  const [message, setMessage] = useState('');
  const closeButton = useRef<HTMLButtonElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMessage('');
    void loadAgentSettings().then((loaded) => {
      if (cancelled) return;
      setSettings(loaded);
      onChangeRef.current?.(loaded);
      requestAnimationFrame(() => closeButton.current?.focus());
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const toggle = async (key: keyof AgentSettings) => {
    if (!settings || saving) return;
    setSaving(key);
    setMessage('');
    const updated = await updateAgentSettings({ [key]: !settings[key] });
    setSettings(updated);
    onChange?.(updated);
    setSaving(null);
    setMessage('Saved locally.');
  };

  const reset = async () => {
    if (saving) return;
    setSaving('reset');
    const defaults = await resetAgentSettings();
    setSettings(defaults);
    onChange?.(defaults);
    setSaving(null);
    setMessage('Safe defaults restored.');
  };

  if (!open) return null;

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-settings-title"
      className="absolute inset-0 z-30 flex flex-col bg-[var(--page)]"
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-dashed border-[var(--line)] px-4">
        <div>
          <h2
            id="agent-settings-title"
            className="text-[13px] font-semibold text-[var(--ink)]"
          >
            Agent settings
          </h2>
          <p className="mt-0.5 text-[10.5px] text-[var(--ink-3)]">
            Stored only in this browser
          </p>
        </div>
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="grid size-8 place-items-center rounded-[8px] text-[var(--ink-3)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 overflow-auto px-4 pb-6 pt-4">
        {!settings ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 py-12 text-[13px] text-[var(--ink-3)]"
          >
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Loading settings…
          </div>
        ) : (
          <>
          <fieldset className="flex flex-col gap-2" disabled={saving !== null}>
            <legend className="sr-only">Model and agent capabilities</legend>
            {OPTIONS.map((option) => {
              const id = `agent-setting-${option.key}`;
              return (
                <label
                  key={option.key}
                  htmlFor={id}
                  className="flex cursor-pointer items-center gap-3 rounded-[13px] bg-[var(--surface)] px-3 py-3 shadow-[var(--shadow-hairline)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium text-[var(--ink)]">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-[var(--ink-3)]">
                      {option.description}
                    </span>
                  </span>
                  <input
                    id={id}
                    type="checkbox"
                    checked={settings[option.key]}
                    onChange={() => void toggle(option.key)}
                    className="size-4 shrink-0 cursor-pointer accent-[var(--accent)] focus-visible:outline-none"
                  />
                </label>
              );
            })}
          </fieldset>
          <button
            type="button"
            onClick={onOpenMemory}
            className="mt-3 flex w-full items-center gap-3 rounded-[13px] bg-[var(--accent-tint)] px-3 py-3 text-left transition-colors hover:bg-[var(--hover)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
          >
            <span className="grid size-9 place-items-center rounded-[10px] bg-[var(--accent-tint)] text-[var(--accent)]">
              <Brain size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium text-[var(--ink)]">Process browsing memory</span>
              <span className="mt-0.5 block text-[11px] text-[var(--ink-3)]">Review and clear locally retained page context.</span>
            </span>
            <ChevronRight size={16} className="text-[var(--ink-3)]" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onOpenAccountSettings}
            className="mt-2 flex w-full items-center gap-3 rounded-[13px] bg-[var(--surface)] px-3 py-3 text-left shadow-[var(--shadow-hairline)] transition-colors hover:bg-[var(--hover)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
          >
            <span className="grid size-9 place-items-center rounded-[10px] bg-[var(--field)] text-[var(--ink-2)]">
              <KeyRound size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium text-[var(--ink)]">Connections and provider keys</span>
              <span className="mt-0.5 block text-[11px] text-[var(--ink-3)]">Manage integrations and encrypted model credentials.</span>
            </span>
            <ChevronRight size={16} className="text-[var(--ink-3)]" aria-hidden="true" />
          </button>
          </>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => void reset()}
            disabled={!settings || saving !== null}
            className="flex items-center gap-1.5 rounded-[9px] px-2 py-1.5 text-[12px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--hover-2)] focus-visible:outline-2 focus-visible:outline-[var(--focus)] disabled:cursor-default disabled:opacity-50"
          >
            {saving === 'reset' ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw size={14} aria-hidden="true" />
            )}
            Restore defaults
          </button>
          <span aria-live="polite" className="text-[11px] text-[var(--ink-3)]">
            {message}
          </span>
        </div>
      </div>
    </section>
  );
}
