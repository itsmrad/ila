import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, EyeOff, Globe, Layers, ListChecks } from 'lucide-react';
import { CHAT_LIMITS } from '@ila/shared';
import type { BrowserTab, ContextMode } from '../../lib/tab-context';

/**
 * What the assistant is allowed to see, chosen by the user.
 *
 * Tab metadata only — titles, URLs and favicons the browser already exposes. No
 * page content is read at this stage, and the bar renders a usable empty state
 * when the browser reports no shareable tabs.
 */

const MODE_OPTIONS: ReadonlyArray<{
  mode: ContextMode;
  label: string;
  icon: typeof Globe;
}> = [
  { mode: 'current', label: 'Current tab', icon: Globe },
  { mode: 'window', label: 'All tabs', icon: Layers },
  { mode: 'custom', label: 'Select', icon: ListChecks },
  { mode: 'none', label: 'Off', icon: EyeOff },
];

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export interface ContextBarProps {
  tabs: BrowserTab[];
  mode: ContextMode;
  onModeChange: (mode: ContextMode) => void;
  customTabIds: number[];
  onToggleTab: (tabId: number) => void;
  selectedTabs: BrowserTab[];
  unavailable: boolean;
}

export function ContextBar({
  tabs,
  mode,
  onModeChange,
  customTabIds,
  onToggleTab,
  selectedTabs,
  unavailable,
}: ContextBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Closing on any mousedown outside the whole bar — not just outside the list —
  // is what lets the "Select" pill toggle the list instead of reopening it.
  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [pickerOpen]);

  const select = (next: ContextMode) => {
    onModeChange(next);
    // Clicking the already-active "Select" pill closes the list again; the
    // chevron implies a toggle.
    setPickerOpen(next === 'custom' ? mode !== 'custom' || !pickerOpen : false);
  };

  return (
    <div ref={root} className="flex flex-col gap-1.5">
      {pickerOpen && mode === 'custom' && (
        <TabPicker
          tabs={tabs}
          customTabIds={customTabIds}
          onToggleTab={onToggleTab}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <div
        role="group"
        aria-label="Context shared with ILA"
        className="flex items-center gap-1 overflow-x-auto scrollbar-thin"
      >
        {MODE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = option.mode === mode;
          const count =
            option.mode === 'window'
              ? tabs.length
              : option.mode === 'custom'
                ? customTabIds.length
                : 0;

          return (
            <button
              key={option.mode}
              type="button"
              aria-pressed={isActive}
              disabled={unavailable && option.mode !== 'none'}
              onClick={() => select(option.mode)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#a9baf6] disabled:cursor-not-allowed disabled:opacity-40 ${
                isActive
                  ? 'border-[#c9d2f8] bg-[#eef1fd] text-[#4b52a8]'
                  : 'border-[#e5e5e5] bg-white/70 text-[#6b6b6b] hover:bg-[#f5f5f5]'
              }`}
            >
              <Icon size={12} aria-hidden="true" />
              {option.label}
              {count > 0 && <span className="text-[10px] opacity-70">{count}</span>}
              {option.mode === 'custom' && isActive && (
                <ChevronDown
                  size={12}
                  aria-hidden="true"
                  className={pickerOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
                />
              )}
            </button>
          );
        })}
      </div>

      <p className="px-1 text-[11px] text-[#a0a0a0]" aria-live="polite">
        {unavailable
          ? 'No tabs available to share.'
          : describeSelection(mode, selectedTabs)}
      </p>
    </div>
  );
}

function describeSelection(
  mode: ContextMode,
  selectedTabs: ReadonlyArray<BrowserTab>,
): string {
  if (mode === 'none') return 'ILA sees no tab context.';
  if (selectedTabs.length === 0) return 'Nothing selected yet.';
  if (selectedTabs.length === 1) {
    const [only] = selectedTabs;
    return `ILA sees ${only ? hostnameOf(only.url) : 'this tab'}.`;
  }
  return `ILA sees ${selectedTabs.length} tabs (titles and URLs only).`;
}

/** Multi-select list of the window's tabs. */
function TabPicker({
  tabs,
  customTabIds,
  onToggleTab,
  onClose,
}: {
  tabs: BrowserTab[];
  customTabIds: number[];
  onToggleTab: (tabId: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const atLimit = customTabIds.length >= CHAT_LIMITS.maxContextTabs;

  return (
    <div
      className="max-h-[220px] overflow-auto rounded-[16px] border border-[#e8e8e8] bg-white p-1.5 shadow-[0_10px_30px_#00000014] scrollbar-thin"
    >
      {tabs.length === 0 ? (
        <p className="px-2 py-3 text-center text-[12px] text-[#a0a0a0]">
          No tabs available to share.
        </p>
      ) : (
        <ul>
          {tabs.map((tab) => {
            const checked = customTabIds.includes(tab.id);
            return (
              <li key={tab.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  disabled={!checked && atLimit}
                  onClick={() => onToggleTab(tab.id)}
                  title={tab.url}
                  className="flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left transition-colors hover:bg-[#f5f5f5] focus-visible:outline-2 focus-visible:outline-[#a9baf6] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  <span
                    aria-hidden="true"
                    className={`grid h-[14px] w-[14px] shrink-0 place-items-center rounded-[4px] border ${
                      checked
                        ? 'border-[#6d5efc] bg-[#6d5efc] text-white'
                        : 'border-[#d4d4d4]'
                    }`}
                  >
                    {checked && <Check size={10} strokeWidth={3} />}
                  </span>
                  {tab.favIconUrl ? (
                    <img
                      src={tab.favIconUrl}
                      alt=""
                      className="h-[14px] w-[14px] shrink-0 rounded-sm"
                    />
                  ) : (
                    <Globe
                      size={14}
                      className="shrink-0 text-[#b0b0b0]"
                      aria-hidden="true"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-[#282828]">
                      {tab.title}
                    </span>
                    <span className="block truncate text-[10px] text-[#a0a0a0]">
                      {hostnameOf(tab.url)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {atLimit && (
        <p className="px-2 py-1 text-[10px] text-[#a0a0a0]">
          Up to {CHAT_LIMITS.maxContextTabs} tabs can be shared at once.
        </p>
      )}
    </div>
  );
}
