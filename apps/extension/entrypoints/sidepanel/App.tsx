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
import type {
  AgentExecutionRecord,
  AgentPlanStep,
  ChatMessage,
  ChatModel,
  MemoryContextItem,
  PageContext,
  HumanInputResponse,
} from '@ila/shared';
import { UtilityBar } from '../../components/layout/UtilityBar';
import { ModeTabs, tabPanelId, type PanelMode } from '../../components/layout/ModeTabs';
import { Composer } from '../../components/chat/Composer';
import { MessageBubble } from '../../components/chat/MessageBubble';
import { ErrorToast } from '../../components/chat/ErrorToast';
import { RecommendationCard } from '../../components/ai';
import { ChatHistoryPanel } from '../../components/chat/ChatHistoryPanel';
import type { ComposerAttachment } from '../../components/chat/Composer';
import { AgentRunPanel, type AgentRunView } from '../../components/agent/AgentRunPanel';
import type { HumanInputSubmission } from '../../components/agent/HumanInputCard';
import { SettingsPanel } from '../../components/settings/SettingsPanel';
import { MemoryPanel } from '../../components/memory/MemoryPanel';
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
  type StoredAgentRun,
} from '../../lib/chat-storage';
import type { SessionUser } from '../../lib/auth';
import { nextAgentAction, planAgentTask, processAgentAttachments } from '../../lib/agent-api';
import {
  executeAgentAction,
  observeActivePage,
  observeActivePageState,
} from '../../lib/agent-runner';
import {
  DEFAULT_AGENT_SETTINGS,
  loadAgentSettings,
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

interface AgentRunCheckpoint {
  execution: AgentExecutionRecord[];
  rows: NonNullable<AgentRunView['execution']>;
  plannedQueue: AgentPlanStep[];
  consecutiveFailures: number;
  nextTurn: number;
  approved: boolean;
}

export default function App() {
  const { status, user, signOut } = useAuth();

  if (status === 'loading') {
    return (
      <main className="flex h-[100dvh] min-w-[300px] items-center justify-center bg-[var(--page)] text-[var(--ink-3)]">
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

  const isChatBusy = status === 'submitted' || status === 'streaming';

  /* -------------------------------- local UI ------------------------------ */

  const [input, setInput] = useState('');
  const [restored, setRestored] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>('chat');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [agentSettings, setAgentSettings] = useState<AgentSettings>({
    ...DEFAULT_AGENT_SETTINGS,
  });
  const [agentRuns, setAgentRuns] = useState<StoredAgentRun[]>([]);
  const agentRunsRef = useRef<StoredAgentRun[]>([]);
  useEffect(() => {
    agentRunsRef.current = agentRuns;
  }, [agentRuns]);
  const isAgentExecuting = agentRuns.some(
    (run) =>
      run.status === 'planning' ||
      run.status === 'running',
  );
  const isAgentBusy = isAgentExecuting || agentRuns.some(
    (run) => run.status === 'awaiting-confirmation' || run.status === 'awaiting-input',
  );
  const isBusy = isChatBusy || isAgentBusy;
  const agentCancelled = useRef(false);
  const agentAbort = useRef<AbortController | null>(null);
  const agentMemory = useRef<MemoryContextItem[] | undefined>(undefined);
  const agentAttachments = useRef<ComposerAttachment[]>([]);
  const agentAttachmentContext = useRef<string | undefined>(undefined);
  const agentCheckpoints = useRef(new Map<string, AgentRunCheckpoint>());
  const agentHumanResponses = useRef(new Map<string, HumanInputResponse[]>());
  const agentSettingsRef = useRef(agentSettings);
  useEffect(() => {
    agentSettingsRef.current = agentSettings;
  }, [agentSettings]);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    return document.documentElement.dataset.theme === 'dark';
  });
  const scrollArea = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    localStorage.setItem('ila-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

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
        if (session.agentRuns.length > 0) setAgentRuns(session.agentRuns);
      }
      setRestored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id, setMessages]);

  // Snapshot at rest (not on every token) to keep storage writes cheap.
  useEffect(() => {
    if (!restored || isChatBusy || isAgentExecuting) return;
    void saveChatSession(user.id, { chatId, model, messages, agentRuns });
  }, [restored, isChatBusy, isAgentExecuting, messages, agentRuns, chatId, model, user.id]);

  // The side panel is destroyed without a React unmount when the window closes,
  // so also flush on `pagehide`.
  useEffect(() => {
    if (!restored) return;
    const flush = () => {
      void saveChatSession(user.id, {
        chatId: chatIdRef.current,
        model: modelRef.current,
        messages: messagesRef.current,
        agentRuns: agentRunsRef.current,
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
  }, [messages, agentRuns]);

  const updateAgentRun = useCallback(
    (id: string, next: AgentRunView | ((current: AgentRunView) => AgentRunView)) => {
      setAgentRuns((current) => current.map((entry) => {
        if (entry.id !== id) return entry;
        const run = typeof next === 'function' ? next(entry) : next;
        return { ...entry, ...run };
      }));
    },
    [],
  );

  const runPlan = useCallback(async (
    entryId: string,
    run: AgentRunView,
    approved: boolean,
    checkpoint?: AgentRunCheckpoint,
  ) => {
    if (!run.plan) return;
    agentAbort.current?.abort();
    const controller = new AbortController();
    agentAbort.current = controller;
    agentCancelled.current = false;
    const execution = checkpoint ? [...checkpoint.execution] : [];
    const rows = checkpoint ? [...checkpoint.rows] : [];
    const plannedQueue = checkpoint ? [...checkpoint.plannedQueue] : [...run.plan.steps];
    let consecutiveFailures = checkpoint?.consecutiveFailures ?? 0;
    const firstTurn = checkpoint?.nextTurn ?? 0;

    updateAgentRun(entryId, (current) => ({
      ...current,
      status: 'running',
      thinking: true,
      completedSteps: rows.filter((row) => row.status === 'succeeded').length,
      execution: [...rows],
      humanInput: undefined,
      inputSubmitting: false,
      error: undefined,
    }));

    try {
      for (let turn = firstTurn; turn < 20; turn += 1) {
        if (agentCancelled.current) return;
        let step: AgentPlanStep | undefined = plannedQueue.shift();
        let observation: Awaited<ReturnType<typeof observeActivePageState>> | undefined;
        try {
          observation = await observeActivePageState();
        } catch (cause) {
          const canBootstrap =
            step?.action.type === 'open_tab' || step?.action.type === 'navigate';
          if (!canBootstrap) throw cause;
        }
        if (!step) {
          if (!observation) {
            throw new Error('Open or navigate to a regular website before using page controls.');
          }
          const decision = await nextAgentAction(
            {
              task: run.task,
              ...(modelRef.current ? { model: modelRef.current } : {}),
              pageContext: observation.pageContext,
              ...(observation.pageSnapshot
                ? { pageSnapshot: observation.pageSnapshot }
                : {}),
              ...(agentMemory.current?.length ? { memory: agentMemory.current } : {}),
              ...(agentAttachmentContext.current
                ? { attachmentContext: agentAttachmentContext.current }
                : {}),
              ...(agentAttachments.current.length
                ? {
                    attachmentMetadata: agentAttachments.current.map((attachment) => ({
                      id: attachment.id,
                      name: attachment.name,
                      mediaType: attachment.mimeType,
                      size: attachment.size,
                    })),
                  }
                : {}),
              reasoning: agentSettingsRef.current.reasoning,
              execution,
              ...(agentHumanResponses.current.get(entryId)?.length
                ? { humanInputResponses: agentHumanResponses.current.get(entryId) }
                : {}),
            },
            controller.signal,
          );
          if (agentCancelled.current) return;
          if (decision.status === 'complete') {
            agentCheckpoints.current.delete(entryId);
            agentHumanResponses.current.delete(entryId);
            updateAgentRun(entryId, {
              ...run,
              status: 'complete',
              thinking: false,
              completedSteps: rows.filter((row) => row.status === 'succeeded').length,
              execution: [...rows],
              summary: decision.summary,
              humanInput: undefined,
              inputSubmitting: false,
              error: undefined,
            });
            return;
          }
          if (decision.status === 'blocked') throw new Error(decision.summary);
          if (decision.status === 'needs_input') {
            agentCheckpoints.current.set(entryId, {
              execution: [...execution],
              rows: [...rows],
              plannedQueue: [...plannedQueue],
              consecutiveFailures,
              nextTurn: turn,
              approved,
            });
            updateAgentRun(entryId, (current) => ({
              ...current,
              status: 'awaiting-input',
              thinking: false,
              execution: [...rows],
              humanInput: decision.request,
              inputSubmitting: false,
              error: undefined,
            }));
            return;
          }
          step = decision.step;
        }

        rows.push({ step, status: 'running' });
        updateAgentRun(entryId, {
          ...run,
          status: 'running',
          thinking: false,
          activeStep: rows.length - 1,
          completedSteps: rows.filter((row) => row.status === 'succeeded').length,
          execution: [...rows],
          humanInput: undefined,
          inputSubmitting: false,
          error: undefined,
        });

        let result: Awaited<ReturnType<typeof executeAgentAction>>;
        try {
          result = await executeAgentAction(
            step.action,
            approved,
            agentAttachments.current,
            observation?.pageContext.url,
          );
        } catch (cause) {
          const actionError = cause instanceof Error
            ? cause.message
            : 'The browser action failed.';
          rows[rows.length - 1] = { step, status: 'failed', error: actionError };
          execution.push({ step, outcome: 'failed', error: actionError });
          if (step.action.type === 'upload' && /attachment|file/i.test(actionError)) {
            plannedQueue.length = 0;
            agentCheckpoints.current.set(entryId, {
              execution: [...execution],
              rows: [...rows],
              plannedQueue: [],
              consecutiveFailures: consecutiveFailures + 1,
              nextTurn: turn + 1,
              approved,
            });
            updateAgentRun(entryId, (current) => ({
              ...current,
              status: 'awaiting-input',
              thinking: false,
              execution: [...rows],
              humanInput: {
                title: 'Attach the required file',
                description: 'ILA kept the completed browser steps and will continue from this page.',
                questions: [{
                  id: 'required-file',
                  prompt: 'Choose the file required by this page.',
                  type: 'file',
                  required: true,
                }],
              },
              inputSubmitting: false,
              error: undefined,
            }));
            return;
          }
          throw cause;
        }
        if (result && !result.ok) {
          plannedQueue.length = 0;
          consecutiveFailures += 1;
          rows[rows.length - 1] = {
            step,
            status: 'failed',
            error: result.error.message,
          };
          execution.push({
            step,
            outcome: 'failed',
            error: result.error.message,
          });
          if (consecutiveFailures >= 3) {
            throw new Error(result.error.message);
          }
        } else {
          consecutiveFailures = 0;
          rows[rows.length - 1] = { step, status: 'succeeded' };
          execution.push({
            step,
            outcome: 'succeeded',
          });
        }

        updateAgentRun(entryId, {
          ...run,
          status: 'running',
          thinking: true,
          activeStep: rows.length,
          completedSteps: rows.filter((row) => row.status === 'succeeded').length,
          execution: [...rows],
          humanInput: undefined,
          inputSubmitting: false,
          error: undefined,
        });
      }
      throw new Error('ILA reached the 20-action safety limit before verifying completion.');
    } catch (cause) {
      if (agentCancelled.current || (cause instanceof Error && cause.name === 'AbortError')) {
        return;
      }
      agentCheckpoints.current.delete(entryId);
      agentHumanResponses.current.delete(entryId);
      updateAgentRun(entryId, {
        ...run,
        status: 'failed',
        thinking: false,
        completedSteps: rows.filter((row) => row.status === 'succeeded').length,
        execution: [...rows],
        humanInput: undefined,
        inputSubmitting: false,
        error: cause instanceof Error ? cause.message : 'The browser action failed.',
      });
    } finally {
      if (agentAbort.current === controller) agentAbort.current = null;
    }
  }, [updateAgentRun]);

  const submitHumanInput = useCallback(async (
    entryId: string,
    submission: HumanInputSubmission,
  ) => {
    const checkpoint = agentCheckpoints.current.get(entryId);
    const run = agentRunsRef.current.find((entry) => entry.id === entryId);
    if (!checkpoint || !run) {
      updateAgentRun(entryId, (current) => ({
        ...current,
        status: 'failed',
        inputSubmitting: false,
        error: 'This paused task can no longer be resumed. Start it again.',
      }));
      return;
    }

    const existingAttachmentIds = new Set(agentAttachments.current.map(({ id }) => id));
    const additions = submission.attachments.filter(({ id }) => !existingAttachmentIds.has(id));
    if (agentAttachments.current.length + additions.length > 5) {
      updateAgentRun(entryId, (current) => ({
        ...current,
        inputSubmitting: false,
        error: 'A browser task can use up to five files. Remove extras and continue.',
      }));
      return;
    }

    updateAgentRun(entryId, (current) => ({
      ...current,
      inputSubmitting: true,
      error: undefined,
    }));

    agentAbort.current?.abort();
    const controller = new AbortController();
    agentAbort.current = controller;
    agentCancelled.current = false;
    try {
      if (additions.length > 0) {
        const extracted = await processAgentAttachments({
          attachments: additions.map((attachment) => ({
            id: attachment.id,
            name: attachment.name,
            mediaType: attachment.mimeType,
            size: attachment.size,
            dataUrl: attachment.dataUrl,
          })),
        }, controller.signal);
        if (agentCancelled.current) return;
        agentAttachments.current = [...agentAttachments.current, ...additions];
        if (extracted) {
          agentAttachmentContext.current = [extracted, agentAttachmentContext.current]
            .filter((value): value is string => Boolean(value))
            .join('\n\n')
            .slice(0, 6_000);
        }
      }

      const responseIds = new Set(submission.responses.map(({ questionId }) => questionId));
      const previous = agentHumanResponses.current.get(entryId) ?? [];
      agentHumanResponses.current.set(entryId, [
        ...previous.filter(({ questionId }) => !responseIds.has(questionId)),
        ...submission.responses,
      ]);
      if (agentCancelled.current) return;
      if (agentAbort.current === controller) agentAbort.current = null;
      await runPlan(entryId, run, checkpoint.approved, checkpoint);
    } catch (cause) {
      if (agentCancelled.current || (cause instanceof Error && cause.name === 'AbortError')) return;
      updateAgentRun(entryId, (current) => ({
        ...current,
        status: 'awaiting-input',
        inputSubmitting: false,
        error: cause instanceof Error
          ? cause.message
          : 'ILA could not use that information. Try again.',
      }));
    } finally {
      if (agentAbort.current === controller) agentAbort.current = null;
    }
  }, [runPlan, updateAgentRun]);

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

      agentAbort.current?.abort();
      const planningController = new AbortController();
      agentAbort.current = planningController;
      agentCancelled.current = false;
      agentAttachments.current = attachments;
      agentAttachmentContext.current = undefined;
      const entryId = crypto.randomUUID();
      agentHumanResponses.current.set(entryId, []);
      const createdAt = Date.now();
      setAgentRuns((current) => [
        ...current,
        { id: entryId, createdAt, status: 'planning', task: text },
      ]);
      try {
        const pageSnapshot = await observeActivePage().catch(() => undefined);
        const memory: MemoryContextItem[] | undefined = agentSettings.memory
          ? (await listBrowsingMemory()).slice(0, 20).map((entry) => ({
              title: entry.title,
              url: entry.url,
              ...(entry.context ? { summary: entry.context.slice(0, 1_000) } : {}),
            }))
          : undefined;
        agentMemory.current = memory;
        const planned = await planAgentTask(
          {
            task: text,
            ...(model ? { model } : {}),
            ...(pageContext ? { pageContext } : {}),
            ...(pageSnapshot ? { pageSnapshot } : {}),
            ...(memory?.length ? { memory } : {}),
            ...(attachments.length
              ? {
                  attachments: attachments.map((attachment) => ({
                    id: attachment.id,
                    name: attachment.name,
                    mediaType: attachment.mimeType,
                    size: attachment.size,
                    dataUrl: attachment.dataUrl,
                  })),
                }
              : {}),
            reasoning: agentSettings.reasoning,
          },
          planningController.signal,
        );
        if (agentCancelled.current) return;
        agentAttachmentContext.current = planned.attachmentContext;
        const next: AgentRunView = {
          status: agentSettings.skipConfirmation ? 'running' : 'awaiting-confirmation',
          task: text,
          plan: planned.plan,
          completedSteps: 0,
        };
        updateAgentRun(entryId, next);
        if (agentSettings.skipConfirmation) {
          await runPlan(entryId, next, true);
        }
      } catch (cause) {
        if (
          agentCancelled.current ||
          (cause instanceof Error && cause.name === 'AbortError')
        ) return;
        updateAgentRun(entryId, {
          status: 'failed',
          task: text,
          error: cause instanceof Error ? cause.message : 'Could not plan this browser task.',
        });
      } finally {
        if (agentAbort.current === planningController) agentAbort.current = null;
      }
    },
    [agentSettings, clearError, model, pageContext, runPlan, sendMessage, updateAgentRun],
  );

  const cancelAgent = useCallback((entryId: string) => {
    agentCancelled.current = true;
    agentAbort.current?.abort();
    agentAbort.current = null;
    agentAttachments.current = [];
    agentAttachmentContext.current = undefined;
    agentCheckpoints.current.delete(entryId);
    agentHumanResponses.current.delete(entryId);
    updateAgentRun(entryId, (run) => ({
      ...run,
      status: 'failed',
      thinking: false,
      error: 'Task stopped by you.',
    }));
  }, [updateAgentRun]);

  const startNewChat = useCallback(() => {
    agentCancelled.current = true;
    agentAbort.current?.abort();
    agentAbort.current = null;
    stop();
    clearError();
    setNotice(null);
    agentAttachments.current = [];
    agentAttachmentContext.current = undefined;
    agentCheckpoints.current.clear();
    agentHumanResponses.current.clear();
    setAgentRuns([]);
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
    agentCancelled.current = true;
    agentAbort.current?.abort();
    agentAbort.current = null;
    clearError();
    setNotice(null);
    agentAttachments.current = [];
    agentAttachmentContext.current = undefined;
    agentCheckpoints.current.clear();
    agentHumanResponses.current.clear();
    setMessages([]);
    setInput('');
    setChatId(undefined);
    setAgentRuns([]);
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
        setAgentRuns([]);
        agentCheckpoints.current.clear();
        agentHumanResponses.current.clear();
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
      setAgentRuns([]);
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
    <main className="relative flex h-[100dvh] min-w-[300px] flex-col overflow-hidden bg-[var(--page)] text-[var(--ink)]">
      <UtilityBar
        onNewChat={startNewChat}
        onClearConversation={() => void clearConversation()}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        busy={isBusy}
        hasConversation={messages.length > 0 || agentRuns.length > 0}
        user={user}
        onSignOut={onSignOut}
        onOpenMemory={() => setMemoryOpen(true)}
        memoryEnabled={agentSettings.memory}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((value) => !value)}
      />
      <ModeTabs mode={panelMode} onModeChange={setPanelMode} />

      {panelMode === 'chat' ? (
        <div
          id={tabPanelId('chat')}
          role="tabpanel"
          aria-labelledby="ila-tab-chat"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div
            ref={scrollArea}
            className="flex-1 overflow-auto px-4 pb-6 pt-5 scrollbar-thin md:px-6"
          >
            {messages.length > 0 || agentRuns.length > 0 ? (
              <div className="mx-auto flex w-full max-w-[620px] flex-col gap-6 pb-4">
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
                {agentRuns.map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-3">
                    <MessageBubble
                      message={{
                        id: `${entry.id}-prompt`,
                        role: 'user',
                        parts: [{ type: 'text', text: entry.task }],
                      }}
                    />
                    <AgentRunPanel
                      run={entry}
                      onCancel={() => cancelAgent(entry.id)}
                      onConfirm={() => void runPlan(entry.id, entry, true)}
                      onHumanInput={(submission) => void submitHumanInput(entry.id, submission)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mx-auto flex min-h-full w-full max-w-[480px] flex-col justify-center py-8">
                <div className="flex items-center gap-3">
                  <IlaMark />
                  <div>
                    <h1 className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--ink)]">What should I do?</h1>
                    <p className="mt-0.5 text-[12px] text-[var(--ink-3)]">Ask a question or hand ILA a browser task.</p>
                  </div>
                </div>
                <div className="mt-6 grid gap-2">
                  <RecommendationCard title="Work with this page" description="Summarize, compare, or extract what matters." onSelect={() => setInput('Summarize this page and highlight the key actions.')} />
                  <RecommendationCard title="Use the browser" description="Navigate, search, and complete multi-step forms." onSelect={() => setInput('Use the browser to ')} />
                  <RecommendationCard title="Remember this context" description="Save the useful parts of this page locally." onSelect={() => setInput('Remember the important context from this page.')} />
                </div>
              </div>
            )}
          </div>

          <div className="z-10 flex shrink-0 flex-col gap-2 border-t border-dashed border-[var(--line)] bg-[var(--page)] px-3 pb-3 pt-2.5 md:px-4">
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
              onStop={() => {
                const active = agentRuns.findLast(
                  (run) =>
                    run.status === 'planning' ||
                    run.status === 'awaiting-confirmation' ||
                    run.status === 'awaiting-input' ||
                    run.status === 'running',
                );
                if (active) cancelAgent(active.id);
                else stop();
              }}
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
          className="flex-1 overflow-auto px-4 pb-6 pt-2 scrollbar-thin md:px-6"
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
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onChange={setAgentSettings}
        onOpenMemory={() => {
          setSettingsOpen(false);
          setMemoryOpen(true);
        }}
        onOpenAccountSettings={() => {
          setSettingsOpen(false);
          setAccountSettingsOpen(true);
        }}
      />
      <MemoryPanel open={memoryOpen} onClose={() => setMemoryOpen(false)} />
      <SettingsDrawer
        open={accountSettingsOpen}
        onClose={() => setAccountSettingsOpen(false)}
        preferences={preferences}
        onPreferencesChange={updatePreferences}
      />
    </main>
  );
}
