import { Search, X } from 'lucide-react';

export function SearchField({ value, onChange, placeholder = 'Search' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-[10px] bg-[var(--field)] px-3 text-[var(--ink-3)] transition-shadow focus-within:shadow-[0_0_0_2px_var(--focus)]">
      <Search size={14} aria-hidden="true" />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-3)]" />
      {value && <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="grid size-5 place-items-center rounded-full hover:bg-[var(--hover)]"><X size={11} /></button>}
    </label>
  );
}
