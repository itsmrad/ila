import { ChevronLeft, Home, PenLine, Settings2, Bolt, CheckCircle2, Circle } from 'lucide-react';
import { IconButton } from '@ila/ui';

export function UtilityBar({ onNew }: { onNew: () => void }) {
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
        <IconButton label="Notifications"><Circle size={20} /></IconButton>
      </div>
    </header>
  );
}
