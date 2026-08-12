import { ArrowRight, Globe2, ShieldCheck, X } from 'lucide-react';
import type { ReactNode } from 'react';

export function ApprovalCard({
  title,
  description,
  children,
  onApprove,
  onCancel,
}: {
  title: string;
  description: string;
  children?: ReactNode;
  onApprove: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-[15px] bg-[var(--surface)] shadow-[var(--shadow-overlay)]" aria-label="Approve browser task">
      <div className="flex items-start gap-3 px-4 pt-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-[var(--accent-tint)] text-[var(--accent)]">
          <ShieldCheck size={16} />
        </span>
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-[var(--ink)]">{title}</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-3)]">{description}</p>
        </div>
      </div>
      {children && <div className="px-4 py-3">{children}</div>}
      <div className="flex items-center justify-end gap-1 border-t border-dashed border-[var(--line)] px-3 py-2.5">
        <button type="button" onClick={onCancel} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] text-[var(--ink-2)] transition-colors hover:bg-[var(--hover)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]">
          <X size={13} /> Cancel
        </button>
        <button type="button" onClick={onApprove} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--accent)] px-3.5 text-[12px] font-semibold text-white shadow-[0_4px_12px_color-mix(in_srgb,var(--accent)_24%,transparent)] transition-[opacity,transform] hover:opacity-90 active:scale-[.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">
          Run task <ArrowRight size={13} />
        </button>
      </div>
    </section>
  );
}

export function ContextCard({
  label,
  detail,
  onRemove,
}: {
  label: string;
  detail?: string;
  onRemove?: () => void;
}) {
  return (
    <div className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-[10px] bg-[var(--field)] px-2.5 py-1.5 text-[11.5px] text-[var(--ink-2)]">
      <Globe2 size={13} className="shrink-0 text-[var(--ink-3)]" />
      <span className="min-w-0 truncate font-medium" title={detail}>{label}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="grid size-5 shrink-0 place-items-center rounded-full text-[var(--ink-3)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]">
          <X size={11} />
        </button>
      )}
    </div>
  );
}

export function RecommendationCard({
  title,
  description,
  onSelect,
}: {
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button type="button" onClick={onSelect} className="group flex w-full items-start justify-between gap-4 rounded-[13px] bg-[var(--surface)] px-3.5 py-3 text-left shadow-[var(--shadow-hairline)] transition-[background-color,transform] hover:bg-[var(--hover-2)] active:scale-[.99] focus-visible:outline-2 focus-visible:outline-[var(--focus)]">
      <span>
        <span className="block text-[12.5px] font-medium text-[var(--ink)]">{title}</span>
        <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--ink-3)]">{description}</span>
      </span>
      <ArrowRight size={14} className="mt-0.5 shrink-0 text-[var(--ink-3)] transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
