import { useState } from 'react';
import { IlaMark } from '@ila/ui';
import { useAuth } from '../../lib/useAuth';

export function LoginScreen() {
  const { signIn, error } = useAuth();
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    setPending(true);
    await signIn();
    setPending(false);
  };

  return (
    <main className="flex h-[100dvh] min-w-[300px] flex-col items-center justify-center gap-6 bg-[var(--page)] px-8 text-[var(--ink)]">
      <IlaMark large />

      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-[17px] font-semibold">Welcome to ILA</h1>
        <p className="max-w-[240px] text-[13px] text-[var(--ink-3)]">
          Sign in to start automating your browser with natural language.
        </p>
      </div>

      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="mt-1 w-full max-w-[260px] rounded-[12px] bg-[var(--accent)] px-4 py-3 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Opening sign-in…' : 'Sign in to ILA'}
      </button>

      {error && (
        <p className="max-w-[260px] text-center text-[12px] text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}

      <p className="max-w-[260px] text-center text-[11px] leading-relaxed text-[var(--ink-3)]">
        A secure window will open to complete sign-in, then bring you back here.
      </p>
    </main>
  );
}
