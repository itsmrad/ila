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
      aria-label="Settings"
      className="absolute inset-0 z-40 flex flex-col bg-white/97 backdrop-blur-sm"
    >
      <header className="flex h-[76px] shrink-0 items-center justify-between px-4 pt-[22px] pb-[14px] md:px-[30px]">
        <h2 className="text-[15px] font-semibold text-[#181818]">Settings</h2>
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="grid h-8 w-8 place-items-center rounded-[10px] text-[#707070] transition-colors hover:bg-[#f0f0f0] hover:text-[#303030] focus-visible:outline-2 focus-visible:outline-[#a9baf6] cursor-pointer"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 overflow-auto px-4 pb-8 md:px-[30px] scrollbar-thin">
        <div className="flex flex-col gap-7">
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
        <h3 className="text-[13px] font-semibold text-[#282828]">{title}</h3>
        <p className="mt-0.5 text-[11px] text-[#a0a0a0]">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-[12px] border border-[#f5c2c7] bg-[#fdf2f3] px-3 py-2 text-[11px] text-[#8a1c24]"
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
      <label className="flex items-center justify-between gap-3 rounded-[14px] border border-[#e8e8e8] bg-white px-3 py-2.5">
        <span className="text-[12px] text-[#404040]">
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
          className="h-4 w-4 accent-[#6d5efc] cursor-pointer"
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
              className="flex items-center justify-between gap-3 rounded-[14px] border border-[#e8e8e8] bg-white px-3 py-2.5"
            >
              <span className="min-w-0">
                <span className="block text-[12px] font-medium text-[#282828]">
                  {integration.label}
                </span>
                <span
                  className={`block text-[11px] ${
                    integration.connected ? 'text-[#2f8f4e]' : 'text-[#a0a0a0]'
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
                  className="shrink-0 rounded-[10px] border border-[#e0e0e0] px-2.5 py-1 text-[11px] font-medium text-[#505050] transition-colors hover:bg-[#f5f5f5] disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#a9baf6]"
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
        <p className="rounded-[14px] border border-[#e8e8e8] bg-white px-3 py-2.5 text-[11px] text-[#707070]">
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
                    className="flex items-center justify-between gap-3 rounded-[14px] border border-[#e8e8e8] bg-white px-3 py-2.5"
                  >
                    <span className="flex items-center gap-2 text-[12px] text-[#282828]">
                      <Check size={13} className="text-[#2f8f4e]" aria-hidden="true" />
                      {LLM_PROVIDER_LABELS[stored]} key saved
                    </span>
                    <button
                      type="button"
                      onClick={() => void remove(stored)}
                      disabled={removing === stored}
                      aria-label={`Remove ${LLM_PROVIDER_LABELS[stored]} key`}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] text-[#b0b0b0] transition-colors hover:bg-[#fdf2f3] hover:text-[#e5484d] disabled:opacity-40 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#a9baf6]"
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
              className="text-[11px] font-medium text-[#707070]"
            >
              Provider
            </label>
            <select
              id="byok-provider"
              value={provider}
              onChange={(event) =>
                setProvider(event.target.value as LlmProvider)
              }
              className="rounded-[12px] border border-[#e0e0e0] bg-white px-3 py-2 text-[12px] text-[#282828] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#a9baf6]"
            >
              {LLM_PROVIDERS.map((option) => (
                <option key={option} value={option}>
                  {LLM_PROVIDER_LABELS[option]}
                </option>
              ))}
            </select>

            <label
              htmlFor="byok-key"
              className="text-[11px] font-medium text-[#707070]"
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
              className="rounded-[12px] border border-[#e0e0e0] bg-white px-3 py-2 font-mono text-[12px] text-[#282828] focus-visible:outline-2 focus-visible:outline-[#a9baf6]"
            />

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={apiKey.trim().length < BYOK_LIMITS.minKeyChars || saving}
                className="rounded-[12px] bg-[#aebcf0] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#97a8e8] disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#a9baf6]"
              >
                {saving ? 'Saving…' : 'Save key'}
              </button>
              {saved && (
                <span
                  aria-live="polite"
                  className="text-[11px] text-[#2f8f4e]"
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
    <p className="flex items-center gap-2 px-1 py-2 text-[11px] text-[#a0a0a0]">
      <Loader2 size={13} className="animate-spin" aria-hidden="true" />
      Loading…
    </p>
  );
}
