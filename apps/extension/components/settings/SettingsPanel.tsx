import { useEffect, useRef, useState } from 'react';
import { Brain, ChevronRight, Loader2, RotateCcw, X } from 'lucide-react';
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
      className="absolute inset-0 z-30 flex flex-col bg-white/95 backdrop-blur-sm"
    >
      <header className="flex h-[76px] shrink-0 items-center justify-between px-4 pt-[22px] pb-[14px] md:px-[30px]">
        <div>
          <h2
            id="agent-settings-title"
            className="text-[15px] font-semibold text-[#181818]"
          >
            Agent settings
          </h2>
          <p className="mt-0.5 text-[11px] text-[#929292]">
            Stored only in this browser
          </p>
        </div>
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="grid h-8 w-8 cursor-pointer place-items-center rounded-[10px] text-[#707070] transition-colors hover:bg-[#f0f0f0] hover:text-[#303030] focus-visible:outline-2 focus-visible:outline-[#a9baf6]"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 overflow-auto px-4 pb-6 md:px-[30px]">
        {!settings ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 py-12 text-[13px] text-[#929292]"
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
                  className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-[#ededed] bg-white px-3 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#a9baf6]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-[#282828]">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-[#858585]">
                      {option.description}
                    </span>
                  </span>
                  <input
                    id={id}
                    type="checkbox"
                    checked={settings[option.key]}
                    onChange={() => void toggle(option.key)}
                    className="h-4 w-4 shrink-0 cursor-pointer accent-[#6d5efc] focus-visible:outline-none"
                  />
                </label>
              );
            })}
          </fieldset>
          <button
            type="button"
            onClick={onOpenMemory}
            className="mt-3 flex w-full items-center gap-3 rounded-[14px] border border-[#dedff0] bg-[#f8f8ff] px-3 py-3 text-left transition-colors hover:bg-[#f2f2ff] focus-visible:outline-2 focus-visible:outline-[#a9baf6]"
          >
            <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-[#e8e9ff] text-[#6456d6]">
              <Brain size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-[#282832]">Process browsing memory</span>
              <span className="mt-0.5 block text-[11px] text-[#85858f]">Review and clear locally retained page context.</span>
            </span>
            <ChevronRight size={16} className="text-[#9998a3]" aria-hidden="true" />
          </button>
          </>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => void reset()}
            disabled={!settings || saving !== null}
            className="flex cursor-pointer items-center gap-1.5 rounded-[10px] px-2 py-1.5 text-[12px] font-medium text-[#666] transition-colors hover:bg-[#f2f2f2] focus-visible:outline-2 focus-visible:outline-[#a9baf6] disabled:cursor-default disabled:opacity-50"
          >
            {saving === 'reset' ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw size={14} aria-hidden="true" />
            )}
            Restore defaults
          </button>
          <span aria-live="polite" className="text-[11px] text-[#858585]">
            {message}
          </span>
        </div>
      </div>
    </section>
  );
}
