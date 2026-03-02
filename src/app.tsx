import { Suspense, useCallback, useState, useEffect, useRef } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { isToolUIPart, getToolName } from "ai";
import type { UIMessage } from "ai";
import { Button, InputArea } from "@cloudflare/kumo";
import { Toasty, useKumoToastManager } from "@cloudflare/kumo/components/toast";
import { Streamdown } from "streamdown";
import {
  PaperPlaneRightIcon,
  StopIcon,
  TrashIcon,
  GearIcon,
  CircleIcon,
  MoonIcon,
  SunIcon,
  CheckCircleIcon,
  XCircleIcon,
  BrainIcon,
  CaretDownIcon,
  ScalesIcon,
  WarningIcon,
  MagnifyingGlassIcon,
  XIcon,
  BookOpenIcon,
  CircleNotchIcon
} from "@phosphor-icons/react";

// ── Theme toggle ──────────────────────────────────────────────────────

function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute("data-mode") === "dark"
  );
  const toggle = useCallback(() => {
    const next = !dark;
    setDark(next);
    const mode = next ? "dark" : "light";
    document.documentElement.setAttribute("data-mode", mode);
    document.documentElement.style.colorScheme = mode;
    localStorage.setItem("theme", mode);
  }, [dark]);
  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="p-2 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-white/5 transition-colors"
    >
      {dark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
    </button>
  );
}

// ── Disclaimer banner ─────────────────────────────────────────────────

function DisclaimerBanner() {
  const [visible, setVisible] = useState(
    () => localStorage.getItem("disclaimer-dismissed") !== "1"
  );
  if (!visible) return null;
  return (
    <div className="flex items-start gap-3 px-5 py-3 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60">
      <WarningIcon
        size={18}
        weight="fill"
        className="text-amber-500 mt-0.5 shrink-0"
      />
      <p className="text-sm text-amber-800 dark:text-amber-300 leading-snug flex-1">
        <strong>Important notice:</strong> LawyAI is an informational support
        tool based on Portuguese legislation. Answers may contain inaccuracies
        and <strong>do not replace advice from a qualified lawyer.</strong>
      </p>
      <button
        onClick={() => {
          localStorage.setItem("disclaimer-dismissed", "1");
          setVisible(false);
        }}
        aria-label="Dismiss warning"
        className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 transition-colors shrink-0 mt-0.5"
      >
        <XIcon size={16} />
      </button>
    </div>
  );
}

// ── Tool rendering ────────────────────────────────────────────────────

function SearchArticlesResult({ output }: { output: unknown }) {
  const data = output as {
    articles?: { id: number; text: string; category: string }[];
    message?: string;
  } | null;
  const articles = data?.articles ?? [];
  const categories = [...new Set(articles.map((a) => a.category))];
  if (!articles.length) {
    return (
      <p className="text-xs text-kumo-inactive italic">
        {data?.message ?? "No relevant articles found."}
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-kumo-default">
        {articles.length} article{articles.length !== 1 ? "s" : ""} retrieved
      </p>
      <div className="flex flex-wrap gap-1">
        {categories.map((cat) => (
          <span
            key={cat}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
          >
            <BookOpenIcon size={10} />
            {cat}
          </span>
        ))}
      </div>
    </div>
  );
}

function ToolPartView({
  part,
  addToolApprovalResponse
}: {
  part: UIMessage["parts"][number];
  addToolApprovalResponse: (response: {
    id: string;
    approved: boolean;
  }) => void;
}) {
  if (!isToolUIPart(part)) return null;
  const toolName = getToolName(part);
  const isSearch = toolName === "searchLegalArticles";

  if (part.state === "input-available" || part.state === "input-streaming") {
    return (
      <div className="flex justify-start my-1">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 text-xs text-kumo-inactive">
          {isSearch ? (
            <MagnifyingGlassIcon
              size={13}
              className="text-amber-500 animate-pulse"
            />
          ) : (
            <GearIcon size={13} className="animate-spin" />
          )}
          {isSearch
            ? "Searching relevant legislation..."
            : `Running ${toolName}...`}
        </div>
      </div>
    );
  }

  if (part.state === "output-available") {
    return (
      <div className="flex justify-start my-1">
        <div className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 max-w-[85%]">
          <div className="flex items-center gap-2 mb-1.5">
            {isSearch ? (
              <MagnifyingGlassIcon size={13} className="text-amber-500" />
            ) : (
              <GearIcon size={13} className="text-kumo-inactive" />
            )}
            <span className="text-xs font-semibold text-kumo-default">
              {isSearch ? "Legislation retrieved" : toolName}
            </span>
            <CheckCircleIcon size={12} className="text-green-500 ml-auto" />
          </div>
          {isSearch ? (
            <SearchArticlesResult output={part.output} />
          ) : (
            <pre className="text-[11px] text-kumo-inactive font-mono whitespace-pre-wrap overflow-auto max-h-40">
              {JSON.stringify(part.output, null, 2)}
            </pre>
          )}
        </div>
      </div>
    );
  }

  if ("approval" in part && part.state === "approval-requested") {
    const approvalId = (part.approval as { id?: string })?.id;
    return (
      <div className="flex justify-start my-1">
        <div className="px-4 py-3 rounded-xl border-2 border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 max-w-[85%]">
          <div className="flex items-center gap-2 mb-2">
            <WarningIcon size={14} className="text-amber-500" />
            <span className="text-sm font-semibold text-kumo-default">
              Approval needed: {toolName}
            </span>
          </div>
          <pre className="text-[11px] font-mono text-kumo-inactive mb-3 whitespace-pre-wrap">
            {JSON.stringify(part.input, null, 2)}
          </pre>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={<CheckCircleIcon size={13} />}
              onClick={() =>
                approvalId &&
                addToolApprovalResponse({ id: approvalId, approved: true })
              }
            >
              Approve
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<XCircleIcon size={13} />}
              onClick={() =>
                approvalId &&
                addToolApprovalResponse({ id: approvalId, approved: false })
              }
            >
              Reject
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (part.state === "output-denied") {
    return (
      <div className="flex justify-start my-1">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 text-xs text-kumo-inactive">
          <XCircleIcon size={13} className="text-red-400" />
          {toolName} — rejected
        </div>
      </div>
    );
  }

  return null;
}

// ── Empty / welcome state ─────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  "What are a tenant's rights when facing eviction?",
  "What does the law say about unfair dismissal?",
  "What is the limitation period for a civil debt?",
  "How does divorce by mutual consent work in Portugal?"
];

function WelcomeState({
  onPrompt,
  disabled
}: {
  onPrompt: (text: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400/20 to-amber-600/10 border border-amber-500/20 flex items-center justify-center mb-5">
        <ScalesIcon size={32} weight="duotone" className="text-amber-500" />
      </div>
      <h2 className="text-xl font-bold text-kumo-default mb-1">
        How can I help?
      </h2>
      <p className="text-sm text-kumo-inactive mb-8 max-w-sm">
        Ask a legal question. I will search relevant Portuguese legislation and
        provide an initial analysis.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            disabled={disabled}
            onClick={() => onPrompt(prompt)}
            className="text-left px-4 py-3 rounded-xl border border-kumo-line bg-kumo-base hover:bg-kumo-elevated hover:border-amber-500/40 text-sm text-kumo-default transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main chat ─────────────────────────────────────────────────────────

function Chat() {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toasts = useKumoToastManager();

  const agent = useAgent({
    agent: "ChatAgent",
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), []),
    onError: useCallback(
      (error: Event) => console.error("WebSocket error:", error),
      []
    ),
    onMessage: useCallback(
      (message: MessageEvent) => {
        try {
          const data = JSON.parse(String(message.data));
          if (data.type === "scheduled-task") {
            toasts.add({
              title: "Task completed",
              description: data.description,
              timeout: 0
            });
          }
        } catch {
          /* not our event */
        }
      },
      [toasts]
    )
  });

  const {
    messages,
    sendMessage,
    clearHistory,
    addToolApprovalResponse,
    stop,
    status
  } = useAgentChat({
    agent,
    onToolCall: async (event) => {
      if (
        "addToolOutput" in event &&
        event.toolCall.toolName === "getUserTimezone"
      ) {
        event.addToolOutput({
          toolCallId: event.toolCall.toolCallId,
          output: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            localTime: new Date().toLocaleTimeString()
          }
        });
      }
    }
  });

  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isStreaming && textareaRef.current) textareaRef.current.focus();
  }, [isStreaming]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    sendMessage({ role: "user", parts: [{ type: "text", text }] });
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input, isStreaming, sendMessage]);

  const sendPrompt = useCallback(
    (text: string) => {
      if (isStreaming) return;
      sendMessage({ role: "user", parts: [{ type: "text", text }] });
    },
    [isStreaming, sendMessage]
  );

  return (
    <div className="flex flex-col h-screen bg-kumo-elevated">
      {/* ── Header ── */}
      <header className="shrink-0 bg-slate-900 border-b border-slate-700/60 shadow-lg">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-md shadow-amber-900/30">
              <ScalesIcon size={20} weight="fill" className="text-slate-900" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white leading-none">
                LawyAI
              </h1>
              <p className="text-[11px] text-slate-400 leading-none mt-0.5">
                AI Legal Assistant
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 mr-2">
              <CircleIcon
                size={7}
                weight="fill"
                className={connected ? "text-emerald-400" : "text-red-400"}
              />
              <span className="text-[11px] text-slate-400">
                {connected ? "Connected" : "Disconnected"}
              </span>
            </div>
            <ThemeToggle />
            <button
              onClick={clearHistory}
              title="Clear chat"
              className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-white/5 transition-colors"
            >
              <TrashIcon size={17} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Disclaimer banner ── */}
      <DisclaimerBanner />

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <WelcomeState
            onPrompt={sendPrompt}
            disabled={isStreaming || !connected}
          />
        ) : (
          <div className="max-w-3xl mx-auto px-5 py-6 space-y-4">
            {messages.map((message: UIMessage, index: number) => {
              const isUser = message.role === "user";
              const isLastAssistant =
                message.role === "assistant" && index === messages.length - 1;

              return (
                <div key={message.id} className="space-y-1">
                  {/* Tool parts */}
                  {message.parts.filter(isToolUIPart).map((part) => (
                    <ToolPartView
                      key={part.toolCallId}
                      part={part}
                      addToolApprovalResponse={addToolApprovalResponse}
                    />
                  ))}

                  {/* Reasoning parts */}
                  {message.parts
                    .filter(
                      (p) =>
                        p.type === "reasoning" &&
                        (p as { text?: string }).text?.trim()
                    )
                    .map((p, i) => {
                      const r = p as {
                        type: "reasoning";
                        text: string;
                        state?: "streaming" | "done";
                      };
                      const done = r.state === "done" || !isStreaming;
                      return (
                        <div key={i} className="flex justify-start my-1">
                          <details className="max-w-[85%] w-full" open={!done}>
                            <summary className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-xl bg-purple-500/8 border border-purple-500/20 text-sm select-none">
                              <BrainIcon
                                size={13}
                                className="text-purple-400"
                              />
                              <span className="text-xs font-medium text-kumo-default">
                                Reasoning
                              </span>
                              {done ? (
                                <span className="text-[11px] text-emerald-500">
                                  Done
                                </span>
                              ) : (
                                <span className="text-[11px] text-kumo-brand flex items-center gap-1">
                                  <CircleNotchIcon
                                    size={11}
                                    className="animate-spin"
                                  />{" "}
                                  Thinking...
                                </span>
                              )}
                              <CaretDownIcon
                                size={13}
                                className="ml-auto text-kumo-inactive"
                              />
                            </summary>
                            <pre className="mt-1.5 px-3 py-2.5 rounded-xl bg-kumo-control text-xs text-kumo-default whitespace-pre-wrap overflow-auto max-h-56">
                              {r.text}
                            </pre>
                          </details>
                        </div>
                      );
                    })}

                  {/* Text parts */}
                  {message.parts
                    .filter((p) => p.type === "text")
                    .map((p, i) => {
                      const text = (p as { type: "text"; text: string }).text;
                      if (!text) return null;

                      if (isUser) {
                        return (
                          <div key={i} className="flex justify-end">
                            <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-sm bg-indigo-600 text-white text-sm leading-relaxed shadow-sm">
                              {text}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={i} className="flex justify-start gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                            <ScalesIcon
                              size={14}
                              weight="fill"
                              className="text-slate-900"
                            />
                          </div>
                          <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-kumo-base shadow-sm border border-kumo-line/60 text-kumo-default leading-relaxed overflow-hidden">
                            <Streamdown
                              className="sd-theme p-4"
                              controls={false}
                              isAnimating={isLastAssistant && isStreaming}
                            >
                              {text}
                            </Streamdown>
                          </div>
                        </div>
                      );
                    })}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Input ── */}
      <div className="shrink-0 border-t border-kumo-line bg-kumo-base">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="max-w-3xl mx-auto px-5 pt-4 pb-3"
        >
          <div className="flex items-end gap-2 rounded-2xl border border-kumo-line bg-kumo-elevated px-3 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-amber-500/40 focus-within:border-amber-500/40 transition-all">
            <InputArea
              ref={textareaRef}
              value={input}
              onValueChange={setInput}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
              placeholder="Ask your legal question..."
              disabled={!connected || isStreaming}
              rows={1}
              className="flex-1 !ring-0 focus:!ring-0 !shadow-none !bg-transparent !outline-none resize-none max-h-40 text-sm"
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Stop"
                className="mb-0.5 p-2 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
              >
                <StopIcon size={17} />
              </button>
            ) : (
              <button
                type="submit"
                aria-label="Enviar"
                disabled={!input.trim() || !connected}
                className="mb-0.5 p-2 rounded-xl bg-amber-500 text-slate-900 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                <PaperPlaneRightIcon size={17} weight="fill" />
              </button>
            )}
          </div>
          <p className="text-[11px] text-kumo-inactive text-center mt-2">
            Based on legislation from{" "}
            <span className="text-kumo-default">pgdlisboa.pt</span>
            {" · "}Does not replace professional legal advice
          </p>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Toasty>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-screen text-kumo-inactive">
            <ScalesIcon
              size={28}
              className="text-amber-500 animate-pulse mr-3"
            />
            Loading...
          </div>
        }
      >
        <Chat />
      </Suspense>
    </Toasty>
  );
}
