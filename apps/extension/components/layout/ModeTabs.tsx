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
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = TABS.findIndex((tab) => tab.mode === mode);
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const next = TABS[(index + offset + TABS.length) % TABS.length];
    if (next) onModeChange(next.mode);
  };

  return (
    <div
      role="tablist"
      aria-label="Panel mode"
      onKeyDown={onKeyDown}
      className="mx-4 mb-2 flex shrink-0 gap-1 rounded-[14px] border border-[#e8e8e8] bg-[#f5f5f5] p-1 md:mx-[30px]"
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
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[12px] font-medium transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#a9baf6] ${
              selected
                ? 'bg-white text-[#282828] shadow-sm'
                : 'text-[#8a8a8a] hover:text-[#505050]'
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
