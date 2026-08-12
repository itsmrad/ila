import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { IlaMark } from '@ila/ui';
import type { ChatMessage, ChatModel, PageContext } from '@ila/shared';
import { UtilityBar } from '../../components/layout/UtilityBar';
import { ModeTabs, tabPanelId, type PanelMode } from '../../components/layout/ModeTabs';
import { Composer } from '../../components/chat/Composer';
import { MessageBubble } from '../../components/chat/MessageBubble';
import { ErrorToast } from '../../components/chat/ErrorToast';
import { ChatHistoryPanel } from '../../components/chat/ChatHistoryPanel';
import { ContextBar } from '../../components/context/ContextBar';
import { AutomationsPanel } from '../../components/automations/AutomationsPanel';
import { SettingsDrawer } from '../../components/settings/SettingsDrawer';
import { LoginScreen } from '../../components/auth/LoginScreen';
import { useAuth } from '../../lib/useAuth';
import { useTabContext } from '../../lib/useTabContext';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type Preferences,
} from '../../lib/prefs';
import {
  ChatApiError,
  deleteChat,
  fetchChat,
  fetchModels,
} from '../../lib/chat-api';
import { createChatTransport } from '../../lib/chat-transport';
import {
  clearChatSession,
  loadChatSession,
  saveChatSession,
} from '../../lib/chat-storage';
import type { SessionUser } from '../../lib/auth';
import './style.css';

/** Map persisted/loaded messages onto the AI SDK's UI message shape. */
function toUIMessages(
  messages: ReadonlyArray<Pick<ChatMessage, 'id' | 'role' | 'parts'>>,
): UIMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: message.parts.map((part) => ({ type: part.type, text: part.text })),
  }));
}

export default function App() {
  const { status, user, signOut } = useAuth();

  if (status === 'loading') {
    return (
      <main className="flex h-[100dvh] min-w-[300px] items-center justify-center bg-gradient-to-b from-[#fbfbfb] to-[#fdfdfd] text-[#bbb]">
        <IlaMark large />
      </main>
    );
  }

  if (status === 'unauthenticated' || !user) {
    return <LoginScreen />;
  }

  // Keyed by user id so switching accounts starts from a clean slate rather
  // than inheriting the previous user's in-memory transcript.
  return <ChatApp key={user.id} user={user} onSignOut={signOut} />;
}

function ChatApp({
  user,
  onSignOut,
}: {
  user: SessionUser;
  onSignOut: () => void;
}) {
  const { refresh: refreshAuth } = useAuth();

  /* ----------------------------- conversation ---------------------------- */

  // The server owns conversation ids; this mirrors whatever it hands back.
  const [chatId, setChatId] = useState<string | undefined>(undefined);
  const chatIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  const [models, setModels] = useState<ChatModel[]>([]);
  const [model, setModel] = useState<string | undefined>(undefined);
  const modelRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  const { pageContext, ...tabContext } = useTabContext(user.id);
  const pageContextRef = useRef<PageContext | undefined>(undefined);
  useEffect(() => {
    pageContextRef.current = pageContext;
  }, [pageContext]);

  // Built once: the transport reads live values through refs so it never needs
  // to be recreated (which would drop an in-flight stream).
  const transport = useMemo(
    () =>
      createChatTransport({
        getChatId: () => chatIdRef.current,
        onChatId: (assigned) => setChatId(assigned),
        getModel: () => modelRef.current,
        getPageContext: () => pageContextRef.current,
      }),
    [],
  );

  const { messages, setMessages, sendMessage, regenerate, stop, status, error, clearError } =
    useChat({ transport });

  const isBusy = status === 'submitted' || status === 'streaming';

  /* -------------------------------- local UI ------------------------------ */

  const [input, setInput] = useState('');
  const [restored, setRestored] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>('chat');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const scrollArea = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadPreferences().then(setPreferences);
  }, []);

  const updatePreferences = useCallback((next: Preferences) => {
    setPreferences(next);
    void savePreferences(next);
  }, []);

  const messagesRef = useRef<UIMessage[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  /* ------------------------------ model list ----------------------------- */

  useEffect(() => {
    let cancelled = false;
    fetchModels()
      .then((available) => {
        if (cancelled) return;
        setModels(available);
        setModel(
          (current) =>
            current ??
            available.find((option) => option.default)?.id ??
            available[0]?.id,
        );
      })
      .catch(() => {
        // Model list is an affordance only — the server applies its default.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* --------------------------- restore + persist -------------------------- */

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const session = await loadChatSession(user.id);
      if (cancelled) return;
      if (session) {
        if (session.chatId) setChatId(session.chatId);
        if (session.model) setModel(session.model);
        if (session.messages.length > 0) {
          setMessages(toUIMessages(session.messages));
        }
      }
      setRestored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id, setMessages]);

  // Snapshot at rest (not on every token) to keep storage writes cheap.
  useEffect(() => {
    if (!restored || isBusy) return;
    void saveChatSession(user.id, { chatId, model, messages });
  }, [restored, isBusy, messages, chatId, model, user.id]);

  // The side panel is destroyed without a React unmount when the window closes,
  // so also flush on `pagehide`.
  useEffect(() => {
    if (!restored) return;
    const flush = () => {
      void saveChatSession(user.id, {
        chatId: chatIdRef.current,
        model: modelRef.current,
        messages: messagesRef.current,
      });
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [restored, user.id]);

  /* ------------------------------- behaviour ------------------------------ */

  // A dead session must drop straight to the login screen.
  useEffect(() => {
    if (error instanceof ChatApiError && error.isUnauthenticated) {
      void refreshAuth();
    }
  }, [error, refreshAuth]);

  // Follow the stream, but only while the user is already near the bottom.
  useEffect(() => {
    const element = scrollArea.current;
    if (!element) return;
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceFromBottom < 240) {
      element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  const submit = useCallback(
    (text: string) => {
      setNotice(null);
      clearError();
      setInput('');
      void sendMessage({ text });
    },
    [clearError, sendMessage],
  );

  const startNewChat = useCallback(() => {
    stop();
    clearError();
    setNotice(null);
    setChatId(undefined);
    setMessages([]);
    setInput('');
    void clearChatSession(user.id);
  }, [clearError, setMessages, stop, user.id]);

  /**
   * Clear the conversation on screen and delete it from saved history.
   * Confirmed first because it is not recoverable.
   */
  const clearConversation = useCallback(async () => {
    const target = chatIdRef.current;
    const confirmed = window.confirm(
      target
        ? 'Delete this conversation? It will be removed from your history.'
        : 'Clear this conversation?',
    );
    if (!confirmed) return;

    stop();
    clearError();
    setNotice(null);
    setMessages([]);
    setInput('');
    setChatId(undefined);
    await clearChatSession(user.id);

    if (target) {
      try {
        await deleteChat(target);
        setHistoryRefresh((token) => token + 1);
      } catch (cause) {
        setNotice(
          cause instanceof ChatApiError
            ? cause.message
            : 'The conversation was cleared here but could not be deleted on the server.',
        );
      }
    }
  }, [clearError, setMessages, stop, user.id]);

  const openConversation = useCallback(
    async (selectedId: string) => {
      stop();
      clearError();
      setNotice(null);
      try {
        const detail = await fetchChat(selectedId);
        setChatId(detail.chat.id);
        setModel(detail.chat.model);
        setMessages(toUIMessages(detail.messages));
        setHistoryOpen(false);
      } catch (cause) {
        setNotice(
          cause instanceof ChatApiError
            ? cause.message
            : 'Could not open that conversation.',
        );
      }
    },
    [clearError, setMessages, stop],
  );

  const onHistoryDeleted = useCallback(
    (deletedId: string) => {
      if (chatIdRef.current !== deletedId) return;
      setChatId(undefined);
      setMessages([]);
      void clearChatSession(user.id);
    },
    [setMessages, user.id],
  );

  // Refresh the history list when a turn actually completes, so titles and
  // ordering stay current. Keyed on the streaming → ready transition: `ready`
  // is also the state on first mount, which is not a completed turn.
  const previousStatus = useRef(status);
  useEffect(() => {
    const wasStreaming =
      previousStatus.current === 'streaming' ||
      previousStatus.current === 'submitted';
    previousStatus.current = status;
    if (wasStreaming && status === 'ready' && chatId) {
      setHistoryRefresh((token) => token + 1);
    }
  }, [status, chatId]);

  const errorMessage = error
    ? error.message || 'Something went wrong. Please try again.'
    : null;
  const canRetry = Boolean(error) && Boolean(chatId);

  const lastMessage = messages.at(-1);

  return (
    <main className="relative flex flex-col h-[100dvh] min-w-[300px] overflow-hidden bg-gradient-to-b from-[#fbfbfb] to-[#fdfdfd] text-[#181818]">
      <UtilityBar
        onNewChat={startNewChat}
        onClearConversation={() => void clearConversation()}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        busy={isBusy}
        hasConversation={messages.length > 0}
        user={user}
        onSignOut={onSignOut}
      />

      <ModeTabs mode={panelMode} onModeChange={setPanelMode} />

      {panelMode === 'chat' ? (
        <div
          id={tabPanelId('chat')}
          role="tabpanel"
          aria-labelledby="ila-tab-chat"
          className="relative flex flex-1 flex-col overflow-hidden"
        >
          <div
            ref={scrollArea}
            className="flex-1 overflow-auto px-4 md:px-[42px] pt-[26px] pb-[260px] scrollbar-thin"
          >
            {messages.length > 0 ? (
              <div className="flex flex-col gap-8 pb-4">
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    isStreaming={
                      status === 'streaming' &&
                      message.id === lastMessage?.id &&
                      message.role === 'assistant'
                    }
                  />
                ))}
                {status === 'submitted' && lastMessage?.role === 'user' && (
                  <MessageBubble
                    message={{ id: 'pending', role: 'assistant', parts: [] }}
                    isStreaming
                  />
                )}
              </div>
            ) : (
              <div className="min-h-full flex flex-col items-center justify-center gap-5 text-[#bbb] text-[13px]">
                <IlaMark large />
                <span>Ask ILA anything about this page</span>
              </div>
            )}
          </div>

          <div className="absolute z-10 left-3 right-3 md:left-[28px] md:right-[28px] bottom-3 md:bottom-[25px] flex flex-col gap-2">
            {notice && (
              <ErrorToast message={notice} onDismiss={() => setNotice(null)} />
            )}
            {errorMessage && (
              <ErrorToast
                message={errorMessage}
                onDismiss={clearError}
                {...(canRetry
                  ? {
                      onRetry: () => {
                        clearError();
                        void regenerate();
                      },
                    }
                  : {})}
              />
            )}

            <ContextBar
              tabs={tabContext.tabs}
              mode={tabContext.mode}
              onModeChange={tabContext.setMode}
              customTabIds={tabContext.customTabIds}
              onToggleTab={tabContext.toggleTab}
              selectedTabs={tabContext.selectedTabs}
              unavailable={tabContext.unavailable}
            />

            <Composer
              value={input}
              onChange={setInput}
              onSubmit={submit}
              onStop={stop}
              isBusy={isBusy}
              models={models}
              model={model}
              onModelChange={setModel}
            />
          </div>
        </div>
      ) : (
        <div
          id={tabPanelId('automations')}
          role="tabpanel"
          aria-labelledby="ila-tab-automations"
          className="flex-1 overflow-auto px-4 pt-2 pb-6 md:px-[30px] scrollbar-thin"
        >
          <AutomationsPanel
            mode={tabContext.mode}
            selectedTabs={tabContext.selectedTabs}
          />
        </div>
      )}

      <ChatHistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        {...(chatId ? { activeChatId: chatId } : {})}
        onSelect={(selected) => void openConversation(selected)}
        onDeleted={onHistoryDeleted}
        refreshToken={historyRefresh}
      />

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        preferences={preferences}
        onPreferencesChange={updatePreferences}
      />
    </main>
  );
}
