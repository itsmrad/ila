import { useEffect, useRef, useState } from 'react';
import { Brain, Loader2, Trash2, X } from 'lucide-react';
import {
  clearBrowsingMemory,
  listBrowsingMemory,
  type BrowsingMemoryEntry,
} from '../../lib/browsing-memory';

export interface MemoryPanelProps {
  open: boolean;
  onClose: () => void;
  onClear?: () => void;
}

function visitedLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** Inspectable and clearable local browsing-memory surface. */
export function MemoryPanel({ open, onClose, onClear }: MemoryPanelProps) {
  const [entries, setEntries] = useState<BrowsingMemoryEntry[] | null>(null);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setConfirmClear(false);
    void listBrowsingMemory().then((memory) => {
      if (cancelled) return;
      setEntries(memory);
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

  const clear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setClearing(true);
    await clearBrowsingMemory();
    setEntries([]);
    setConfirmClear(false);
    setClearing(false);
    onClear?.();
  };

  if (!open) return null;

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="browsing-memory-title"
      className="absolute inset-0 z-30 flex flex-col bg-white/95 backdrop-blur-sm"
    >
      <header className="flex h-[76px] shrink-0 items-center justify-between px-4 pt-[22px] pb-[14px] md:px-[30px]">
        <div>
          <h2
            id="browsing-memory-title"
            className="text-[15px] font-semibold text-[#181818]"
          >
            Browsing memory
          </h2>
          <p className="mt-0.5 text-[11px] text-[#929292]">
            Recent context kept on this device
          </p>
        </div>
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          aria-label="Close browsing memory"
          className="grid h-8 w-8 cursor-pointer place-items-center rounded-[10px] text-[#707070] transition-colors hover:bg-[#f0f0f0] hover:text-[#303030] focus-visible:outline-2 focus-visible:outline-[#a9baf6]"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 overflow-auto px-3 pb-6 md:px-[22px]">
        {entries === null && (
          <div
            role="status"
            className="flex items-center justify-center gap-2 py-12 text-[13px] text-[#929292]"
          >
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Loading memory…
          </div>
        )}

        {entries?.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-[13px] text-[#929292]">
            <Brain size={21} aria-hidden="true" />
            <p>No browsing memory saved.</p>
          </div>
        )}

        {entries && entries.length > 0 && (
          <ul className="flex flex-col gap-2" aria-label="Remembered pages">
            {entries.map((entry) => {
              const host = new URL(entry.url).hostname;
              return (
                <li
                  key={entry.url}
                  className="rounded-[14px] border border-[#ededed] bg-white px-3 py-3"
                >
                  <p className="truncate text-[13px] font-medium text-[#282828]">
                    {entry.title}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-[#777]">
                    {host}
                  </p>
                  {entry.context && (
                    <p className="mt-2 line-clamp-3 text-[11px] leading-4 text-[#777]">
                      {entry.context}
                    </p>
                  )}
                  <p className="mt-2 text-[10px] text-[#a0a0a0]">
                    <time dateTime={new Date(entry.lastVisitedAt).toISOString()}>
                      {visitedLabel(entry.lastVisitedAt)}
                    </time>
                    {entry.visitCount > 1 ? ` · ${entry.visitCount} visits` : ''}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {entries && entries.length > 0 && (
        <footer className="border-t border-[#ededed] px-4 py-3 md:px-[30px]">
          <button
            type="button"
            onClick={() => void clear()}
            disabled={clearing}
            aria-describedby={confirmClear ? 'clear-memory-warning' : undefined}
            className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-[12px] px-3 py-2 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[#a9baf6] disabled:opacity-50 ${
              confirmClear
                ? 'bg-[#fdf2f3] text-[#a52a30] hover:bg-[#fae7e9]'
                : 'text-[#777] hover:bg-[#f5f5f5]'
            }`}
          >
            {clearing ? (
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 size={15} aria-hidden="true" />
            )}
            {confirmClear ? 'Confirm clear all' : 'Clear browsing memory'}
          </button>
          {confirmClear && (
            <p
              id="clear-memory-warning"
              role="alert"
              className="mt-1.5 text-center text-[11px] text-[#8a1c24]"
            >
              This permanently removes every remembered page.
            </p>
          )}
        </footer>
      )}
    </section>
  );
}
