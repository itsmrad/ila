import { FormEvent, useEffect, useRef, useState } from 'react';
import { Paperclip, Crop, Mic2, ArrowUp, SlidersHorizontal, Plus, X, Globe, Sparkles, Settings2, Code2, Cpu } from 'lucide-react';
import { IconButton } from '@ila/ui';

function ContextTag({ onRemove }: { onRemove: () => void }) {
  const [tabInfo, setTabInfo] = useState<{ title: string; url: string; favicon?: string } | null>(null);

  useEffect(() => {
    // Attempt to get the actual active Chrome tab if running as an extension
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          try {
            const url = new URL(tabs[0].url || '');
            setTabInfo({
              title: url.hostname.replace('www.', ''),
              url: tabs[0].url || '',
              favicon: tabs[0].favIconUrl
            });
          } catch (e) {
            setTabInfo({ title: 'Current Page', url: '' });
          }
        }
      });
    } else {
      // Mock for standard dev environment when not inside extension popup/sidepanel
      setTabInfo({ title: 'youtube.com', url: 'https://youtube.com', favicon: 'https://www.youtube.com/favicon.ico' });
    }
  }, []);

  if (!tabInfo) return null;

  return (
    <div className="group relative flex items-center gap-2 w-fit h-[34px] px-[14px] mb-3 rounded-[12px] bg-[#f0f0f0] border border-[#e5e5e5] text-[#4e4e4e] text-[13px] font-medium transition-all hover:bg-[#e8e8e8] cursor-default shadow-sm">
      {tabInfo.favicon ? (
        <img src={tabInfo.favicon} alt="" className="w-[18px] h-[18px] rounded-sm" />
      ) : (
        <Globe size={16} className="text-gray-500" />
      )}
      <span className="max-w-[160px] truncate">{tabInfo.title}</span>
      
      <button 
        type="button"
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 ml-1 w-5 h-5 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition-all cursor-pointer"
        aria-label="Remove context"
      >
        <X size={12} className="text-gray-600" />
      </button>
    </div>
  );
}

function ControlMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <IconButton 
        label="Controls" 
        onClick={() => setOpen(!open)}
        className={open ? "bg-[#f0f0f0] text-[#303030]" : ""}
      >
        <SlidersHorizontal size={20} />
      </IconButton>

      {open && (
        <div className="absolute bottom-[calc(100%+12px)] left-0 w-[240px] p-2 rounded-[24px] bg-white border border-[#e8e8e8] shadow-[0_16px_40px_#00000018,0_4px_12px_#00000008] z-20 flex flex-col gap-1">
          <div className="px-3 pt-2 pb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Models</div>
          <button type="button" onClick={() => setOpen(false)} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-gray-700 hover:bg-[#f5f5f5] rounded-xl transition-colors font-medium">
            <Sparkles size={18} className="text-blue-500" /> Google Gemini 2.5
          </button>
          <button type="button" onClick={() => setOpen(false)} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-gray-700 hover:bg-[#f5f5f5] rounded-xl transition-colors font-medium">
            <Cpu size={18} className="text-purple-500" /> ILA Automation Core
          </button>
          
          <div className="h-[1px] bg-gray-100 my-1 mx-2" />
          
          <div className="px-3 pt-2 pb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Actions</div>
          <button type="button" onClick={() => setOpen(false)} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-gray-700 hover:bg-[#f5f5f5] rounded-xl transition-colors font-medium">
            <Code2 size={18} className="text-gray-500" /> Memory & Rules
          </button>
          <button type="button" onClick={() => setOpen(false)} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-gray-700 hover:bg-[#f5f5f5] rounded-xl transition-colors font-medium">
            <Settings2 size={18} className="text-gray-500" /> Extension Settings
          </button>
        </div>
      )}
    </div>
  );
}

export function Composer({ 
  value, 
  setValue, 
  onSubmit 
}: { 
  value: string; 
  setValue: (v: string) => void; 
  onSubmit: () => void 
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [showContext, setShowContext] = useState(true);

  useEffect(() => {
    if (textarea.current) {
      textarea.current.style.height = 'auto';
      textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 132)}px`;
    }
  }, [value]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim()) onSubmit();
  };

  return (
    <div className="p-2 md:p-[10px] border border-[#dedede] rounded-[30px] md:rounded-[35px] bg-[#fafafa]/80 backdrop-blur-md shadow-[0_8px_28px_#00000012,0_2px_5px_#00000018]">
      <form 
        className="flex flex-col min-h-[100px] p-3 md:px-[18px] md:pt-[16px] md:pb-[14px] border border-[#dedede] rounded-[22px] md:rounded-[26px] bg-white shadow-inner transition-colors focus-within:border-[#a9baf6] focus-within:shadow-[0_0_0_2px_#a9baf633]" 
        onSubmit={submit}
      >
        {showContext && <ContextTag onRemove={() => setShowContext(false)} />}
        
        <textarea
          ref={textarea}
          value={value}
          rows={1}
          onChange={e => {
            setValue(e.target.value);
            if (e.target.value.includes('@') && !showContext) {
              setShowContext(true); // Re-add context if user types @
            }
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (value.trim()) onSubmit();
            }
          }}
          placeholder="Type a message or use @ for context, / for actions..."
          aria-label="Message ILA"
          className="w-full min-h-[44px] mb-2 p-0 resize-none border-0 outline-none text-[#222] bg-transparent leading-[1.45] text-base md:text-[17px] placeholder-[#aaa]"
        />
        <div className="flex items-center gap-1 md:gap-[5px] mt-auto">
          <IconButton label="Add Action"><Plus size={20} /></IconButton>
          <ControlMenu />
          <div className="flex-1" />
          <IconButton label="Attach file"><Paperclip size={20} /></IconButton>
          <IconButton label="Capture screenshot"><Crop size={20} /></IconButton>
          <IconButton label="Voice input"><Mic2 size={20} /></IconButton>
          <button 
            type="submit"
            className="w-[38px] h-[38px] md:w-[47px] md:h-[47px] p-0 border-0 rounded-[12px] md:rounded-[15px] flex items-center justify-center bg-[#aebcf0] hover:bg-[#97a8e8] text-white cursor-pointer transition-colors disabled:opacity-55 disabled:cursor-not-allowed ml-1 shadow-sm"
            disabled={!value.trim()}
            aria-label="Send message"
          >
            <ArrowUp size={22} strokeWidth={2.6} />
          </button>
        </div>
      </form>
    </div>
  );
}
