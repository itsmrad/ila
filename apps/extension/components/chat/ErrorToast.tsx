import { AlertTriangle, RotateCcw, X } from 'lucide-react';

/**
 * Inline error banner for a failed request.
 *
 * Rendered as an assertive live region so screen-reader users hear the failure
 * without having to hunt for it, and always dismissible so a stale error cannot
 * block the composer.
 */
export function ErrorToast({
  message,
  onDismiss,
  onRetry,
}: {
  message: string;
  onDismiss: () => void;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-start gap-3 rounded-[16px] border border-[#f5c2c7] bg-[#fdf2f3] px-4 py-3 text-[13px] text-[#8a1c24] shadow-[0_4px_16px_#00000010]"
    >
      <AlertTriangle size={16} className="mt-[2px] shrink-0" aria-hidden="true" />
      <p className="flex-1 leading-snug break-words">{message}</p>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex shrink-0 items-center gap-1 rounded-[8px] px-2 py-1 font-medium text-[#8a1c24] transition-colors hover:bg-[#f8dcdf] focus-visible:outline-2 focus-visible:outline-[#8a1c24] cursor-pointer"
        >
          <RotateCcw size={13} aria-hidden="true" /> Try again
        </button>
      )}

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="shrink-0 rounded-[8px] p-1 transition-colors hover:bg-[#f8dcdf] focus-visible:outline-2 focus-visible:outline-[#8a1c24] cursor-pointer"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
