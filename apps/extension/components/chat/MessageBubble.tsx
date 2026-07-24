import type { UIMessage } from 'ai';
import { User, Sparkles } from 'lucide-react';
import { IlaMark } from '@ila/ui';

export function MessageBubble({ message }: { message: UIMessage }) {
  const text = message.parts.find(p => p.type === 'text')?.text || '';

  if (message.role === 'user') {
    return (
      <div className="w-fit max-w-[85%] md:max-w-[76%] ml-auto p-4 md:px-[28px] md:pt-[23px] md:pb-[19px] grid gap-[5px] bg-[#f0f0f0] rounded-[28px] leading-[1.25]">
        <div className="flex items-center gap-[9px] text-[#303030] text-sm font-medium mb-1">
          <User size={16} /> <span>You</span>
        </div>
        <div className="text-[15px] text-[#181818]">{text}</div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 max-w-[655px] mx-auto w-full">
      <div className="mt-1">
        <IlaMark />
      </div>
      <div className="flex-1 text-[15px] md:text-base leading-relaxed text-[#181818]">
        <div className="flex items-center gap-[9px] text-[#303030] text-sm font-medium mb-2">
          <Sparkles size={16} className="text-[#aebcf0]" /> <span>ILA</span>
        </div>
        <div className="prose prose-sm md:prose-base prose-neutral max-w-none">
          {text}
        </div>
      </div>
    </div>
  );
}
