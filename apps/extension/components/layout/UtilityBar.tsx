import { ChevronLeft, Home, PenLine, Settings2, Bolt, CheckCircle2, LogOut } from 'lucide-react';
import { IconButton } from '@ila/ui';
import type { SessionUser } from '../../lib/auth';

interface UtilityBarProps {
  onNew: () => void;
  user?: SessionUser | null;
  onSignOut?: () => void;
}

function initialOf(user: SessionUser): string {
  const source = user.name || user.username || user.email || '?';
  return source.trim().charAt(0).toUpperCase() || '?';
}

export function UtilityBar({ onNew, user, onSignOut }: UtilityBarProps) {
  return (
    <header className="h-[76px] px-4 md:px-[30px] pt-[22px] pb-[14px] flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2 md:gap-[17px]">
        <IconButton label="Back"><ChevronLeft size={20} /></IconButton>
        <IconButton label="Home"><Home size={20} /></IconButton>
        <IconButton label="New chat" onClick={onNew}><PenLine size={20} /></IconButton>
      </div>
      <div className="flex items-center gap-2 md:gap-[17px]">
        <IconButton label="Settings"><Settings2 size={20} /></IconButton>
        <IconButton label="Quick actions"><Bolt size={20} /></IconButton>
        <IconButton label="Tasks"><CheckCircle2 size={20} /></IconButton>
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
