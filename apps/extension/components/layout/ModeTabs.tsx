import type { KeyboardEvent } from 'react';
import { MessageSquare, Sparkles } from 'lucide-react';

/**
 * Top-level mode switch.
 *
 * A hand-rolled ARIA tablist rather than a component-library one: the panel has
 * exactly two modes, and this keeps the extension free of another UI dependency
 * (the rest of the side panel is built the same way).
 */

export type PanelMode = 'chat' | 'automations';

const TABS: ReadonlyArray<{
  mode: PanelMode;
  label: string;
  icon: typeof MessageSquare;
}> = [
  { mode: 'chat', label: 'Chat', icon: MessageSquare },
  { mode: 'automations', label: 'Automations', icon: Sparkles },
];

export function tabPanelId(mode: PanelMode): string {
  return `ila-panel-${mode}`;
}

export function ModeTabs({
  mode,
  onModeChange,
}: {
  mode: PanelMode;
  onModeChange: (mode: PanelMode) => void;
}) {
  // Arrow keys move between tabs, which is what a tablist is expected to do.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = TABS.findIndex((tab) => tab.mode === mode);
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const next = TABS[(index + offset + TABS.length) % TABS.length];
    if (!next) return;
    onModeChange(next.mode);
    // Focus follows selection: the previously selected tab drops to tabIndex -1,
    // so focus has to move with it or it lands on the container.
    document.getElementById(`ila-tab-${next.mode}`)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Panel mode"
      onKeyDown={onKeyDown}
      className="mx-4 mb-2 flex shrink-0 gap-1 rounded-[13px] bg-[var(--field)] p-1 shadow-[var(--shadow-hairline)] md:mx-6"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const selected = tab.mode === mode;
        return (
          <button
            key={tab.mode}
            type="button"
            role="tab"
            id={`ila-tab-${tab.mode}`}
            aria-selected={selected}
            aria-controls={tabPanelId(tab.mode)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onModeChange(tab.mode)}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[var(--focus)] ${
              selected
                ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-hairline)]'
                : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
            }`}
          >
            <Icon size={14} aria-hidden="true" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
