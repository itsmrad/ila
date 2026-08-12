import { Brain, Eraser, History, LogOut, Moon, PenLine, Settings2, Sun } from 'lucide-react';
import { IconButton } from '@ila/ui';
import { IlaMark } from '@ila/ui';
import type { SessionUser } from '../../lib/auth';

interface UtilityBarProps {
  /** Start a fresh conversation (saved history is untouched). */
  onNewChat: () => void;
  /** Clear what is on screen and drop the local cache. */
  onClearConversation: () => void;
  /** Open the saved-conversation list. */
  onOpenHistory: () => void;
  /** Disables destructive actions while a response is streaming. */
  busy?: boolean;
  /** True when there is something on screen worth clearing. */
  hasConversation?: boolean;
  user?: SessionUser | null;
  onSignOut?: () => void;
  onOpenSettings: () => void;
  onOpenMemory: () => void;
  memoryEnabled?: boolean;
  darkMode: boolean;
  onToggleTheme: () => void;
}

function initialOf(user: SessionUser): string {
  const source = user.name || user.username || user.email || '?';
  return source.trim().charAt(0).toUpperCase() || '?';
}

export function UtilityBar({
  onNewChat,
  onClearConversation,
  onOpenHistory,
  busy = false,
  hasConversation = false,
  user,
  onSignOut,
  onOpenSettings,
  onOpenMemory,
  memoryEnabled = false,
  darkMode,
  onToggleTheme,
}: UtilityBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-dashed border-[var(--line)] px-3.5">
      <div className="flex items-center gap-1">
        <span className="mr-2 flex items-center gap-2 pr-2 text-[13px] font-semibold tracking-[-0.01em] text-[var(--ink)]">
          <span className="scale-[.8]"><IlaMark /></span> ILA
        </span>
        <IconButton label="New chat" onClick={onNewChat} disabled={busy}>
          <PenLine size={17} />
        </IconButton>
        <IconButton label="Conversation history" onClick={onOpenHistory}>
          <History size={17} />
        </IconButton>
        <IconButton
          label="Clear conversation"
          onClick={onClearConversation}
          disabled={busy || !hasConversation}
        >
          <Eraser size={17} />
        </IconButton>
      </div>
      <div className="flex items-center gap-1">
        <IconButton label={darkMode ? 'Use light theme' : 'Use dark theme'} onClick={onToggleTheme}>
          {darkMode ? <Sun size={17} /> : <Moon size={17} />}
        </IconButton>
        <IconButton
          label={memoryEnabled ? 'Browsing memory is on' : 'Browsing memory'}
          onClick={onOpenMemory}
          className={memoryEnabled ? '!bg-[var(--accent-tint)] !text-[var(--accent)]' : ''}
        >
          <Brain size={17} />
        </IconButton>
        <IconButton label="Agent settings" onClick={onOpenSettings}>
          <Settings2 size={17} />
        </IconButton>
        {user && (
          <>
            <span
              className="grid size-7 select-none place-items-center rounded-full bg-[var(--accent)] text-[11px] font-semibold text-white"
              title={user.email}
              aria-label={`Signed in as ${user.name || user.email}`}
            >
              {user.image ? (
                <img
                  src={user.image}
                  alt=""
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                initialOf(user)
              )}
            </span>
            <IconButton label="Sign out" onClick={onSignOut}>
              <LogOut size={17} />
            </IconButton>
          </>
        )}
      </div>
    </header>
  );
}
