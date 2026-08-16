import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, Trash2, X } from 'lucide-react';
import {
  BYOK_LIMITS,
  LLM_PROVIDERS,
  LLM_PROVIDER_LABELS,
  type IntegrationApp,
  type IntegrationStatus,
  type LlmProvider,
} from '@ila/shared';
import { ChatApiError } from '../../lib/chat-api';
import {
  connectIntegration,
  deleteLlmKey,
  fetchIntegrations,
  fetchLlmKeys,
  loadByokProviders,
  saveByokProviders,
  saveLlmKey,
} from '../../lib/settings-api';
import type { Preferences } from '../../lib/prefs';

/**
 * Settings drawer: local preferences, integrations, and BYOK provider keys.
 *
 * Only the preferences section is local. Integration status and stored keys come
 * from the backend, which owns every credential: this component never writes a
 * secret to `chrome.storage`, and it drops the typed key from React state as
 * soon as the request succeeds.
 */

export interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  preferences: Preferences;
  onPreferencesChange: (preferences: Preferences) => void;
}

export function SettingsDrawer({
  open,
  onClose,
  preferences,
  onPreferencesChange,
}: SettingsDrawerProps) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) closeButton.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      // aria-modal alone does not stop Tab from reaching the side panel behind
      // the drawer, so the cycle is closed here.
      if (event.key !== 'Tab') return;
      const focusable = dialog.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label="Connections and provider keys"
      className="absolute inset-0 z-40 flex flex-col bg-[var(--page)]"
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-dashed border-[var(--line)] px-4">
        <div>
          <h2 className="text-[13px] font-semibold text-[var(--ink)]">Connections and keys</h2>
          <p className="mt-0.5 text-[10.5px] text-[var(--ink-3)]">Secure account-level integrations</p>
        </div>
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="grid size-8 cursor-pointer place-items-center rounded-[8px] text-[var(--ink-3)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 overflow-auto px-4 pb-8 pt-4 scrollbar-thin">
        <div className="flex flex-col gap-6">
          <PreferencesSection
            preferences={preferences}
            onPreferencesChange={onPreferencesChange}
          />
          <IntegrationsSection />
          <ByokSection />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                               */
/* -------------------------------------------------------------------------- */

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-[13px] font-semibold text-[var(--ink)]">{title}</h3>
        <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-[12px] bg-[var(--danger-tint)] px-3 py-2 text-[11px] text-[var(--danger)] shadow-[var(--shadow-hairline)]"
    >
      {message}
    </p>
  );
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof ChatApiError ? cause.message : fallback;
}

/* -------------------------------------------------------------------------- */
/* Preferences (local only)                                                    */
/* -------------------------------------------------------------------------- */

function PreferencesSection({
  preferences,
  onPreferencesChange,
}: {
  preferences: Preferences;
  onPreferencesChange: (preferences: Preferences) => void;
}) {
  return (
    <Section
      title="Preferences"
      description="Stored on this device only."
    >
      <label className="flex items-center justify-between gap-3 rounded-[13px] bg-[var(--surface)] px-3 py-2.5 shadow-[var(--shadow-hairline)]">
        <span className="text-[12px] text-[var(--ink-2)]">
          Share the current tab by default
        </span>
        <input
          type="checkbox"
          checked={preferences.attachContextByDefault}
          onChange={(event) =>
            onPreferencesChange({
              ...preferences,
              attachContextByDefault: event.target.checked,
            })
          }
          className="size-4 cursor-pointer accent-[var(--accent)]"
        />
      </label>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* Integrations                                                                */
/* -------------------------------------------------------------------------- */

function IntegrationsSection() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<IntegrationApp | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchIntegrations();
        if (cancelled) return;
        setIntegrations(response.integrations);
      } catch (cause) {
        if (!cancelled) {
          setError(messageOf(cause, 'Could not load your integrations.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = async (app: IntegrationApp) => {
    setPending(app);
    setError(null);
    try {
      const { redirectUrl } = await connectIntegration(app);
      // The backend owns the flow; the extension only opens the URL it returns.
      await chrome.tabs.create({ url: redirectUrl });
    } catch (cause) {
      setError(messageOf(cause, 'Could not start that connection.'));
    } finally {
      setPending(null);
    }
  };

  return (
    <Section
      title="Integrations"
      description="Connections are managed by the ILA backend. Tokens never reach the browser."
    >
      {error && <ErrorNote message={error} />}
      {loading ? (
        <Loading />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {integrations.map((integration) => (
            <li
              key={integration.app}
              className="flex items-center justify-between gap-3 rounded-[13px] bg-[var(--surface)] px-3 py-2.5 shadow-[var(--shadow-hairline)]"
            >
              <span className="min-w-0">
                <span className="block text-[12px] font-medium text-[var(--ink)]">
                  {integration.label}
                </span>
                <span
                  className={`block text-[11px] ${
                    integration.connected ? 'text-[var(--success)]' : 'text-[var(--ink-3)]'
                  }`}
                >
                  {integration.connected ? 'Connected' : 'Not connected'}
                </span>
              </span>
              {!integration.connected && (
                <button
                  type="button"
                  onClick={() => void connect(integration.app)}
                  disabled={pending === integration.app}
                  className="shrink-0 cursor-pointer rounded-[9px] bg-[var(--field)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--hover)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
                >
                  {pending === integration.app ? 'Opening…' : 'Connect'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* BYOK                                                                        */
/* -------------------------------------------------------------------------- */

function ByokSection() {
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [provider, setProvider] = useState<LlmProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<LlmProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const keys = await fetchLlmKeys();
      const stored = keys.map((key) => key.provider);
      setProviders(stored);
      await saveByokProviders(stored);
    } catch (cause) {
      // 503 means the deployment has no encryption key configured, which is a
      // state to explain rather than an error to retry.
      if (cause instanceof ChatApiError && cause.status === 503) {
        setUnavailable(true);
      } else {
        setError(messageOf(cause, 'Could not load your provider keys.'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Render the cached indicator first so the section is not empty while the
      // request is in flight.
      const cached = await loadByokProviders();
      if (!cancelled && cached.length > 0) setProviders(cached);
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const key = apiKey.trim();
    if (key.length < BYOK_LIMITS.minKeyChars || saving) return;

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveLlmKey(provider, key);
      // Drop the key from component state the moment the backend has it.
      setApiKey('');
      setSaved(true);
      await load();
    } catch (cause) {
      setError(messageOf(cause, 'Could not save that key.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (target: LlmProvider) => {
    setRemoving(target);
    setError(null);
    try {
      await deleteLlmKey(target);
      await load();
    } catch (cause) {
      setError(messageOf(cause, 'Could not remove that key.'));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <Section
      title="Your provider keys"
      description="Sent straight to the ILA backend, encrypted at rest, and never stored in the browser."
    >
      {error && <ErrorNote message={error} />}

      {unavailable ? (
        <p className="rounded-[13px] bg-[var(--surface)] px-3 py-2.5 text-[11px] text-[var(--ink-2)] shadow-[var(--shadow-hairline)]">
          This ILA server is not set up to store provider keys yet.
        </p>
      ) : (
        <>
          {loading && providers.length === 0 ? (
            <Loading />
          ) : (
            providers.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {providers.map((stored) => (
                  <li
                    key={stored}
                    className="flex items-center justify-between gap-3 rounded-[13px] bg-[var(--surface)] px-3 py-2.5 shadow-[var(--shadow-hairline)]"
                  >
                    <span className="flex items-center gap-2 text-[12px] text-[var(--ink)]">
                      <Check size={13} className="text-[var(--success)]" aria-hidden="true" />
                      {LLM_PROVIDER_LABELS[stored]} key saved
                    </span>
                    <button
                      type="button"
                      onClick={() => void remove(stored)}
                      disabled={removing === stored}
                      aria-label={`Remove ${LLM_PROVIDER_LABELS[stored]} key`}
                      className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-[9px] text-[var(--ink-3)] transition-colors hover:bg-[var(--danger-tint)] hover:text-[var(--danger)] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
                    >
                      {removing === stored ? (
                        <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 size={13} aria-hidden="true" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}

          <form onSubmit={submit} className="flex flex-col gap-2">
            <label
              htmlFor="byok-provider"
              className="text-[11px] font-medium text-[var(--ink-2)]"
            >
              Provider
            </label>
            <select
              id="byok-provider"
              value={provider}
              onChange={(event) =>
                setProvider(event.target.value as LlmProvider)
              }
              className="cursor-pointer rounded-[11px] bg-[var(--field)] px-3 py-2 text-[12px] text-[var(--ink)] shadow-[var(--shadow-hairline)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
            >
              {LLM_PROVIDERS.map((option) => (
                <option key={option} value={option}>
                  {LLM_PROVIDER_LABELS[option]}
                </option>
              ))}
            </select>

            <label
              htmlFor="byok-key"
              className="text-[11px] font-medium text-[var(--ink-2)]"
            >
              API key
            </label>
            <input
              id="byok-key"
              type="password"
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                setSaved(false);
              }}
              placeholder="sk-…"
              // A credential must not reach the browser's autofill store or a
              // spellcheck service.
              autoComplete="off"
              spellCheck={false}
              maxLength={BYOK_LIMITS.maxKeyChars}
              className="rounded-[11px] bg-[var(--field)] px-3 py-2 font-mono text-[12px] text-[var(--ink)] shadow-[var(--shadow-hairline)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
            />

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={apiKey.trim().length < BYOK_LIMITS.minKeyChars || saving}
                className="cursor-pointer rounded-[10px] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
              >
                {saving ? 'Saving…' : 'Save key'}
              </button>
              {saved && (
                <span
                  aria-live="polite"
                  className="text-[11px] text-[var(--success)]"
                >
                  Saved. It cannot be shown again.
                </span>
              )}
            </div>
          </form>
        </>
      )}
    </Section>
  );
}

function Loading() {
  return (
    <p className="flex items-center gap-2 px-1 py-2 text-[11px] text-[var(--ink-3)]">
      <Loader2 size={13} className="animate-spin" aria-hidden="true" />
      Loading…
    </p>
  );
}
