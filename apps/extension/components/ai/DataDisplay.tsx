import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

export function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };
  return (
    <div className="my-3 overflow-hidden rounded-[13px] bg-[#20211f] text-[#f4f4ef] shadow-[var(--shadow-hairline)]">
      <div className="flex h-9 items-center justify-between border-b border-white/10 px-3 text-[10.5px] text-white/55">
        <span>{language || 'Code'}</span>
        <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1.5 rounded-[6px] px-1.5 py-1 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white/60">
          {copied ? <Check size={11} /> : <Copy size={11} />}{copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="max-h-80 overflow-auto p-3 font-mono text-[11.5px] leading-relaxed"><code>{code}</code></pre>
    </div>
  );
}

export function DiffTable({ lines }: { lines: string[] }) {
  return (
    <div className="my-3 overflow-hidden rounded-[13px] bg-[var(--surface)] shadow-[var(--shadow-hairline)]">
      <div className="border-b border-dashed border-[var(--line)] px-3 py-2 text-[10.5px] font-medium text-[var(--ink-3)]">Changes</div>
      <table className="w-full border-collapse font-mono text-[11px] leading-relaxed">
        <tbody>
          {lines.map((line, index) => {
            const kind = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'remove' : 'same';
            return (
              <tr key={`${index}-${line}`} className={kind === 'add' ? 'bg-[var(--success-tint)]' : kind === 'remove' ? 'bg-[var(--danger-tint)]' : ''}>
                <td className="w-9 select-none border-r border-[var(--line)] px-2 text-right text-[var(--ink-3)]">{index + 1}</td>
                <td className={`whitespace-pre-wrap break-all px-2.5 py-0.5 ${kind === 'add' ? 'text-[var(--success)]' : kind === 'remove' ? 'text-[var(--danger)]' : 'text-[var(--ink-2)]'}`}>{line || ' '}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
