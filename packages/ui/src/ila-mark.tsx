import { cn } from './lib/utils';

export function IlaMark({ large = false }: { large?: boolean }) {
  return (
    <div
      className={cn(
        'inline-grid place-items-center shrink-0 bg-white rotate-[30deg]',
        large
          ? 'w-[96px] h-[96px] opacity-12 rounded-[20px] drop-shadow-[6px_10px_6px_#00000033]'
          : 'w-[26px] h-[26px] rounded-lg shadow-[0_2px_9px_#00000010]'
      )}
      aria-hidden="true"
    >
      <span
        className={cn(
          'border-l border-b border-[#1e1e1e] rounded-[1px]',
          large ? 'w-[33px] h-[50px] border-[12px]' : 'w-[9px] h-[14px] border-[4px]'
        )}
      />
    </div>
  );
}
