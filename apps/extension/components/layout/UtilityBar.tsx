import { Eraser, History, LogOut, PenLine, Settings2 } from 'lucide-react';
import { IconButton } from '@ila/ui';
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
}: UtilityBarProps) {
  return (
    <header className="h-[76px] px-4 md:px-[30px] pt-[22px] pb-[14px] flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2 md:gap-[17px]">
        <IconButton label="New chat" onClick={onNewChat} disabled={busy}>
          <PenLine size={20} />
        </IconButton>
        <IconButton label="Conversation history" onClick={onOpenHistory}>
          <History size={20} />
        </IconButton>
        <IconButton
          label="Clear conversation"
          onClick={onClearConversation}
          disabled={busy || !hasConversation}
        >
          <Eraser size={20} />
        </IconButton>
      </div>
      <div className="flex items-center gap-2 md:gap-[17px]">
        <IconButton label="Settings (coming soon)" disabled>
          <Settings2 size={20} />
        </IconButton>
        {user && (
          <>
            <span
              className="grid h-[28px] w-[28px] place-items-center rounded-full bg-[#6d5efc] text-[12px] font-semibold text-white select-none"
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
              <LogOut size={20} />
            </IconButton>
          </>
        )}
      </div>
    </header>
  );
}
