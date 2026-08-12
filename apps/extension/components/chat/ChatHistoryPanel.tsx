import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquare, Trash2, X } from 'lucide-react';
import { CHAT_LIMITS, type ChatSummary } from '@ila/shared';
import { ChatApiError, deleteChat, fetchChats } from '../../lib/chat-api';
import { SearchField } from '../ai';

/** Compact relative time ("3m", "2h", "5d") with an absolute-time tooltip. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export interface ChatHistoryPanelProps {
  open: boolean;
  onClose: () => void;
  activeChatId?: string;
  /** Load a conversation into the main view. */
  onSelect: (chatId: string) => void;
  /** A conversation was deleted server-side. */
  onDeleted: (chatId: string) => void;
  /** Bumped by the parent to force a refetch (e.g. after a new turn). */
  refreshToken: number;
}

/**
 * Slide-over list of the signed-in user's saved conversations.
 *
 * The list is always fetched from the server, which scopes it to the caller's
 * user id — the client never filters someone else's data out of a shared list.
 */
export function ChatHistoryPanel({
  open,
  onClose,
  activeChatId,
  onSelect,
  onDeleted,
  refreshToken,
}: ChatHistoryPanelProps) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const closeButton = useRef<HTMLButtonElement>(null);

  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchChats({
        limit: CHAT_LIMITS.historyPageSize,
        ...(cursor ? { cursor } : {}),
      });
      setChats((current) =>
        cursor ? [...current, ...page.chats] : page.chats,
      );
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof ChatApiError
          ? cause.message
          : 'Could not load your conversations.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload on open and whenever the parent signals a change.
  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load, refreshToken]);

  // Move focus into the panel only as it opens. Doing this on every refresh
  // would yank focus away mid-interaction (a refresh fires when a turn ends).
  useEffect(() => {
    if (open) closeButton.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const remove = async (chatId: string) => {
    setPendingDelete(chatId);
    setError(null);
    try {
      await deleteChat(chatId);
      setChats((current) => current.filter((item) => item.id !== chatId));
      onDeleted(chatId);
    } catch (cause) {
      setError(
        cause instanceof ChatApiError
          ? cause.message
          : 'Could not delete that conversation.',
      );
    } finally {
      setPendingDelete(null);
    }
  };

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[var(--page)]">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-dashed border-[var(--line)] px-4">
        <h2 className="text-[13px] font-semibold text-[var(--ink)]">
          Your conversations
        </h2>
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          aria-label="Close history"
          className="grid size-8 place-items-center rounded-[8px] text-[var(--ink-3)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 overflow-auto px-3.5 pb-6 pt-3">
        <div className="mb-3">
          <SearchField value={query} onChange={setQuery} placeholder="Search conversations" />
        </div>
        {error && (
          <p
            role="alert"
            className="mb-3 rounded-[12px] bg-[var(--danger-tint)] px-3 py-2 text-[12px] text-[var(--danger)]"
          >
            {error}
          </p>
        )}

        {loading && chats.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-[var(--ink-3)]">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Loading…
          </div>
        )}

        {!loading && chats.length === 0 && !error && (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-[13px] text-[var(--ink-3)]">
            <MessageSquare size={20} aria-hidden="true" />
            <p>No saved conversations yet.</p>
          </div>
        )}

        <ul className="flex flex-col gap-1">
          {chats.filter((chat) => chat.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map((chat) => {
            const isActive = chat.id === activeChatId;
            return (
              <li key={chat.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(chat.id)}
                  aria-current={isActive ? 'true' : undefined}
                  className={`flex-1 min-w-0 rounded-[12px] px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[var(--focus)] cursor-pointer ${
                    isActive ? 'bg-[var(--accent-tint)]' : 'hover:bg-[var(--hover-2)]'
                  }`}
                >
                  <span className="block truncate text-[12.5px] font-medium text-[var(--ink)]">
                    {chat.title}
                  </span>
                  <span
                    className="block text-[10.5px] text-[var(--ink-3)]"
                    title={new Date(chat.updatedAt).toLocaleString()}
                  >
                    {relativeTime(chat.updatedAt)}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void remove(chat.id)}
                  disabled={pendingDelete === chat.id}
                  aria-label={`Delete conversation: ${chat.title}`}
                  className="grid size-8 shrink-0 place-items-center rounded-[9px] text-[var(--ink-3)] opacity-0 transition-all hover:bg-[var(--danger-tint)] hover:text-[var(--danger)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--focus)] group-hover:opacity-100 disabled:opacity-40"
                >
                  {pendingDelete === chat.id ? (
                    <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 size={15} aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {nextCursor && (
          <button
            type="button"
            onClick={() => void load(nextCursor)}
            disabled={loading}
            className="mt-3 w-full rounded-[12px] bg-[var(--field)] px-3 py-2 text-[12px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--hover)] disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load older conversations'}
          </button>
        )}
      </div>
    </div>
  );
}
