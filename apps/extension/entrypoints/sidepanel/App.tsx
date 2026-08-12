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
import { Composer } from '../../components/chat/Composer';
import { MessageBubble } from '../../components/chat/MessageBubble';
import { ErrorToast } from '../../components/chat/ErrorToast';
import { ChatHistoryPanel } from '../../components/chat/ChatHistoryPanel';
import type { ComposerAttachment } from '../../components/chat/Composer';
import { AgentRunPanel, type AgentRunView } from '../../components/agent/AgentRunPanel';
import { SettingsPanel } from '../../components/settings/SettingsPanel';
import { MemoryPanel } from '../../components/memory/MemoryPanel';
import { LoginScreen } from '../../components/auth/LoginScreen';
import { useAuth } from '../../lib/useAuth';
import { usePageContext } from '../../lib/usePageContext';
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
import { planAgentTask } from '../../lib/agent-api';
import { executeAgentAction, observeActivePage } from '../../lib/agent-runner';
import {
  DEFAULT_AGENT_SETTINGS,
  loadAgentSettings,
  updateAgentSettings,
  type AgentSettings,
} from '../../lib/settings-storage';
import { listBrowsingMemory, processPageVisit } from '../../lib/browsing-memory';
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

  const { pageContext } = usePageContext();
  const [shareContext, setShareContext] = useState(true);
  const pageContextRef = useRef<PageContext | undefined>(undefined);
  useEffect(() => {
    pageContextRef.current = shareContext ? (pageContext ?? undefined) : undefined;
  }, [pageContext, shareContext]);

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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [agentSettings, setAgentSettings] = useState<AgentSettings>({
    ...DEFAULT_AGENT_SETTINGS,
  });
  const [agentRun, setAgentRun] = useState<AgentRunView | null>(null);
  const agentCancelled = useRef(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const scrollArea = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadAgentSettings().then(setAgentSettings);
  }, []);

  // A deployment may remove or rename a model. Never keep sending a stale
  // locally cached id after the server publishes its current allowlist.
  useEffect(() => {
    if (models.length === 0) return;
    if (model && models.some((option) => option.id === model)) return;
    setModel(
      models.find((option) => option.default)?.id ?? models[0]?.id,
    );
  }, [model, models]);

  useEffect(() => {
    if (!agentSettings.memory || !pageContext?.url) return;
    void processPageVisit({
      url: pageContext.url,
      title: pageContext.title,
    });
  }, [agentSettings.memory, pageContext?.title, pageContext?.url]);

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
    async (text: string, attachments: ComposerAttachment[]) => {
      setNotice(null);
      clearError();
      setInput('');
      if (!agentSettings.browserAgent) {
        await sendMessage({
          text,
          ...(attachments.length
            ? {
                files: attachments.map((attachment) => ({
                  type: 'file' as const,
                  mediaType: attachment.mimeType,
                  filename: attachment.name,
                  url: attachment.dataUrl,
                })),
              }
            : {}),
        });
        return;
      }

      agentCancelled.current = false;
      setAgentRun({ status: 'planning', task: text });
      try {
        const pageSnapshot = await observeActivePage().catch(() => undefined);
        const memory = agentSettings.memory
          ? (await listBrowsingMemory()).slice(0, 20).map((entry) => ({
              title: entry.title,
              url: entry.url,
              ...(entry.context ? { summary: entry.context.slice(0, 1_000) } : {}),
            }))
          : undefined;
        const plan = await planAgentTask({
          task: text,
          ...(model ? { model } : {}),
          ...(shareContext && pageContext ? { pageContext } : {}),
          ...(pageSnapshot ? { pageSnapshot } : {}),
          ...(memory?.length ? { memory } : {}),
          reasoning: agentSettings.reasoning,
        });
        if (agentCancelled.current) return;
        const next: AgentRunView = {
          status: agentSettings.skipConfirmation ? 'running' : 'awaiting-confirmation',
          task: text,
          plan,
          completedSteps: 0,
        };
        setAgentRun(next);
        if (agentSettings.skipConfirmation) {
          await runPlan(next, true);
        }
      } catch (cause) {
        setAgentRun({
          status: 'failed',
          task: text,
          error: cause instanceof Error ? cause.message : 'Could not plan this browser task.',
        });
      }
    },
    [agentSettings, clearError, model, pageContext, sendMessage, shareContext],
  );

  const runPlan = useCallback(async (run: AgentRunView, approved: boolean) => {
    if (!run.plan) return;
    agentCancelled.current = false;
    setAgentRun({ ...run, status: 'running', activeStep: 0, completedSteps: 0 });
    try {
      for (let index = 0; index < run.plan.steps.length; index += 1) {
        if (agentCancelled.current) return;
        setAgentRun({ ...run, status: 'running', activeStep: index, completedSteps: index });
        const result = await executeAgentAction(run.plan.steps[index]!.action, approved);
        if (result && !result.ok) throw new Error(result.error.message);
        setAgentRun({ ...run, status: 'running', activeStep: index, completedSteps: index + 1 });
      }
      setAgentRun({
        ...run,
        status: 'complete',
        completedSteps: run.plan.steps.length,
      });
    } catch (cause) {
      setAgentRun({
        ...run,
        status: 'failed',
        error: cause instanceof Error ? cause.message : 'The browser action failed.',
      });
    }
  }, []);

  const cancelAgent = useCallback(() => {
    agentCancelled.current = true;
    setAgentRun(null);
  }, []);

  const changeAgentSetting = useCallback(
    (key: keyof AgentSettings, enabled: boolean) => {
      void updateAgentSettings({ [key]: enabled }).then(setAgentSettings);
    },
    [],
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
        busy={isBusy}
        hasConversation={messages.length > 0}
        user={user}
        onSignOut={onSignOut}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenMemory={() => setMemoryOpen(true)}
        memoryEnabled={agentSettings.memory}
      />

      <div
        ref={scrollArea}
        className="flex-1 overflow-auto px-4 md:px-[42px] pt-[26px] pb-[220px] scrollbar-thin"
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
        {agentRun && (
          <AgentRunPanel
            run={agentRun}
            onCancel={cancelAgent}
            onConfirm={() => void runPlan(agentRun, true)}
          />
        )}
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

        <Composer
          value={input}
          onChange={setInput}
          onSubmit={submit}
          onStop={stop}
          isBusy={isBusy}
          models={models}
          model={model}
          onModelChange={setModel}
          pageContext={pageContext}
          shareContext={shareContext}
          onShareContextChange={setShareContext}
          agentSettings={agentSettings}
          onAgentSettingChange={changeAgentSetting}
        />
      </div>

      <ChatHistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        {...(chatId ? { activeChatId: chatId } : {})}
        onSelect={(selected) => void openConversation(selected)}
        onDeleted={onHistoryDeleted}
        refreshToken={historyRefresh}
      />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onChange={setAgentSettings}
        onOpenMemory={() => {
          setSettingsOpen(false);
          setMemoryOpen(true);
        }}
      />
      <MemoryPanel open={memoryOpen} onClose={() => setMemoryOpen(false)} />
    </main>
  );
}
