import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, FileUp, Paperclip, ShieldCheck, X } from 'lucide-react';
import type { HumanInputRequest, HumanInputResponse } from '@ila/shared';
import {
  ATTACHMENT_ACCEPT,
  createAttachmentId,
  readFileAsDataUrl,
  summarizeAttachmentRejections,
  validateAttachmentCandidates,
  type ComposerAttachment,
} from '../chat/attachments';

export interface HumanInputSubmission {
  responses: HumanInputResponse[];
  attachments: ComposerAttachment[];
}

interface HumanInputCardProps {
  request: HumanInputRequest;
  submitting?: boolean;
  error?: string;
  onSubmit: (submission: HumanInputSubmission) => void;
  onCancel: () => void;
}

export function HumanInputCard({
  request,
  submitting = false,
  error,
  onSubmit,
  onCancel,
}: HumanInputCardProps) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, ComposerAttachment[]>>({});
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const question = request.questions[index]!;
  const selected = answers[question.id] ?? [];
  const selectedFiles = files[question.id] ?? [];
  const typedValue = custom[question.id]?.trim() ?? '';
  const last = index === request.questions.length - 1;

  const isAnswered = useMemo(() => {
    if (!question.required) return true;
    if (question.type === 'file') return selectedFiles.length > 0;
    if (question.type === 'manual') return acknowledged[question.id] === true;
    return selected.length > 0 || typedValue.length > 0;
  }, [acknowledged, question, selected.length, selectedFiles.length, typedValue.length]);

  const toggleOption = (option: string) => {
    setAnswers((current) => {
      const currentValues = current[question.id] ?? [];
      const next = question.type === 'single_choice'
        ? [option]
        : currentValues.includes(option)
          ? currentValues.filter((value) => value !== option)
          : [...currentValues, option];
      return { ...current, [question.id]: next };
    });
    if (question.type === 'single_choice') {
      setCustom((current) => ({ ...current, [question.id]: '' }));
    }
  };

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const candidates = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (candidates.length === 0) return;
    setFileError(null);
    const { accepted, rejected } = validateAttachmentCandidates(candidates, 0);
    const rejection = summarizeAttachmentRejections(rejected);
    if (rejection) setFileError(rejection);
    if (accepted.length === 0) return;

    setReadingFile(true);
    try {
      const additions = await Promise.all(accepted.map(async (file) => ({
        id: createAttachmentId(),
        kind: 'upload' as const,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl: await readFileAsDataUrl(file),
      })));
      setFiles((current) => ({ ...current, [question.id]: additions }));
    } catch {
      setFileError('The selected file could not be read. Choose it again.');
    } finally {
      setReadingFile(false);
    }
  };

  const submit = () => {
    if (!isAnswered || submitting) return;
    if (!last) {
      setIndex((current) => current + 1);
      setFileError(null);
      return;
    }

    const firstMissing = request.questions.findIndex((item) => {
      if (!item.required) return false;
      if (item.type === 'file') return (files[item.id] ?? []).length === 0;
      if (item.type === 'manual') return acknowledged[item.id] !== true;
      return (answers[item.id] ?? []).length === 0 && !custom[item.id]?.trim();
    });
    if (firstMissing >= 0) {
      setIndex(firstMissing);
      return;
    }

    const responses: HumanInputResponse[] = request.questions.map((item) => {
      const itemFiles = files[item.id] ?? [];
      const typed = custom[item.id]?.trim();
      const values = [
        ...(answers[item.id] ?? []),
        ...(typed ? [typed] : []),
      ];
      return {
        questionId: item.id,
        prompt: item.prompt,
        values: item.type === 'file' ? itemFiles.map((file) => file.name) : values,
        ...(itemFiles.length ? { attachmentIds: itemFiles.map((file) => file.id) } : {}),
        ...(item.type === 'manual' ? { acknowledged: acknowledged[item.id] === true } : {}),
      };
    });
    onSubmit({
      responses,
      attachments: Object.values(files).flat(),
    });
  };

  return (
    <section className="w-full overflow-hidden rounded-[16px] bg-[var(--surface)] shadow-[var(--shadow-overlay)]" aria-label="Information needed to continue">
      <div className="px-4 pb-3.5 pt-4">
        <div className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-[var(--accent-tint)] text-[var(--accent)]">
            <ShieldCheck size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-[13.5px] font-semibold leading-snug text-[var(--ink)]">{request.title}</h2>
            {request.description && (
              <p className="mt-1 break-words text-[11.5px] leading-relaxed text-[var(--ink-3)]">{request.description}</p>
            )}
          </div>
          <button type="button" onClick={onCancel} disabled={submitting} aria-label="Stop this task" className="grid size-7 shrink-0 place-items-center rounded-[7px] text-[var(--ink-3)] transition-colors hover:bg-[var(--hover-2)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--focus)] disabled:opacity-40">
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div key={question.id} className="mt-4 motion-safe:animate-[fade-up_220ms_ease-out_both]">
          <p className="break-words text-[13px] font-medium leading-relaxed text-[var(--ink)]">{question.prompt}</p>

          {(question.type === 'single_choice' || question.type === 'multiple_choice') && (
            <div className="mt-2 flex flex-col gap-1" role="group" aria-label={question.prompt}>
              {question.options.map((option) => {
                const active = selected.includes(option);
                return (
                  <button key={option} type="button" aria-pressed={active} onClick={() => toggleOption(option)} className="flex min-h-9 items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left transition-colors hover:bg-[var(--hover-2)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]">
                    <span className={`grid size-4 shrink-0 place-items-center ${question.type === 'single_choice' ? 'rounded-full' : 'rounded-[5px]'} ${active ? 'bg-[var(--ink)] text-[var(--surface)]' : 'shadow-[inset_0_0_0_1.5px_var(--line-strong)]'}`}>
                      {question.type === 'single_choice' ? (
                        <span className={`size-1.5 rounded-full bg-current transition-transform ${active ? 'scale-100' : 'scale-0'}`} />
                      ) : active ? <Check size={11} strokeWidth={3} /> : null}
                    </span>
                    <span className={`min-w-0 break-words text-[12.5px] leading-snug ${active ? 'font-medium text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}>{option}</span>
                  </button>
                );
              })}
              <input
                value={custom[question.id] ?? ''}
                onChange={(event) => {
                  setCustom((current) => ({ ...current, [question.id]: event.target.value }));
                  if (question.type === 'single_choice') setAnswers((current) => ({ ...current, [question.id]: [] }));
                }}
                maxLength={1_000}
                placeholder="Type another answer…"
                aria-label="Type another answer"
                className="mt-1 h-9 w-full rounded-[9px] bg-[var(--field)] px-3 text-[12.5px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-3)] focus-visible:shadow-[0_0_0_2px_var(--focus)]"
              />
            </div>
          )}

          {question.type === 'text' && (
            <textarea
              autoFocus
              value={custom[question.id] ?? ''}
              onChange={(event) => setCustom((current) => ({ ...current, [question.id]: event.target.value }))}
              maxLength={1_000}
              rows={3}
              placeholder={question.placeholder ?? 'Type your answer…'}
              aria-label={question.prompt}
              className="mt-2 min-h-20 w-full resize-y rounded-[10px] bg-[var(--field)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--ink)] outline-none placeholder:text-[var(--ink-3)] focus-visible:shadow-[0_0_0_2px_var(--focus)]"
            />
          )}

          {question.type === 'file' && (
            <div className="mt-2">
              <input ref={fileInput} type="file" multiple accept={question.accept?.join(',') ?? ATTACHMENT_ACCEPT} onChange={(event) => void chooseFile(event)} className="sr-only" tabIndex={-1} />
              <button type="button" onClick={() => fileInput.current?.click()} disabled={readingFile || submitting} className="flex min-h-10 w-full items-center gap-2.5 rounded-[10px] bg-[var(--field)] px-3 text-left text-[12.5px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--hover-2)] focus-visible:outline-2 focus-visible:outline-[var(--focus)] disabled:opacity-50">
                <FileUp size={15} className="shrink-0 text-[var(--accent)]" />
                <span>{readingFile ? 'Reading file…' : selectedFiles.length ? 'Choose different files' : 'Choose files'}</span>
              </button>
              {selectedFiles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Selected files">
                  {selectedFiles.map((file) => (
                    <span key={file.id} className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-[var(--accent-tint)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent)]">
                      <Paperclip size={11} className="shrink-0" />
                      <span className="truncate" title={file.name}>{file.name}</span>
                    </span>
                  ))}
                </div>
              )}
              {fileError && <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--danger)]" role="alert">{fileError}</p>}
            </div>
          )}

          {question.type === 'manual' && (
            <button type="button" aria-pressed={acknowledged[question.id] === true} onClick={() => setAcknowledged((current) => ({ ...current, [question.id]: !current[question.id] }))} className="mt-2 flex min-h-10 w-full items-center gap-2.5 rounded-[10px] bg-[var(--field)] px-3 text-left transition-colors hover:bg-[var(--hover-2)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]">
              <span className={`grid size-4 shrink-0 place-items-center rounded-[5px] ${acknowledged[question.id] ? 'bg-[var(--success)] text-white' : 'shadow-[inset_0_0_0_1.5px_var(--line-strong)]'}`}>
                {acknowledged[question.id] && <Check size={11} strokeWidth={3} />}
              </span>
              <span className="text-[12.5px] font-medium text-[var(--ink-2)]">I completed this step in the browser</span>
            </button>
          )}
        </div>

        {error && (
          <p className="mt-3 break-words text-[11.5px] leading-relaxed text-[var(--danger)]" role="alert">{error}</p>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-dashed border-[var(--line)] px-3 py-2.5">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => { setIndex((current) => Math.max(0, current - 1)); setFileError(null); }} disabled={index === 0 || submitting} aria-label="Previous question" className="grid size-7 place-items-center rounded-[7px] text-[var(--ink-3)] transition-colors enabled:hover:bg-[var(--hover-2)] enabled:hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--focus)] disabled:opacity-30">
            <ArrowLeft size={14} />
          </button>
          <div className="flex items-center gap-1.5 px-1" aria-label={`Question ${index + 1} of ${request.questions.length}`}>
            {request.questions.map((item, itemIndex) => (
              <button key={item.id} type="button" onClick={() => { setIndex(itemIndex); setFileError(null); }} disabled={submitting} aria-label={`Go to question ${itemIndex + 1}`} aria-current={itemIndex === index ? 'step' : undefined} className={`h-1.5 rounded-full transition-all ${itemIndex === index ? 'w-5 bg-[var(--ink)]' : itemIndex < index ? 'w-1.5 bg-[var(--ink-3)]' : 'w-1.5 bg-[var(--line-strong)]'}`} />
            ))}
          </div>
        </div>
        <button type="button" onClick={submit} disabled={!isAnswered || readingFile || submitting} aria-label={last ? 'Continue task' : 'Next question'} className="inline-flex min-h-8 items-center gap-1.5 rounded-[9px] bg-[var(--accent)] px-3 text-[11.5px] font-semibold text-white transition-[opacity,transform] enabled:hover:opacity-90 enabled:active:scale-[.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-35">
          {submitting ? 'Preparing…' : last ? 'Continue' : 'Next'}
          <ArrowRight size={13} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
