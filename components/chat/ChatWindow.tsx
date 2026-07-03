"use client";
import { useEffect, useRef, useState } from "react";
import { useChatStore, type VizType, type ChatMessage } from "@/store/chat";
import { MessageBubble } from "./MessageBubble";
import { chatHeaders } from "@/lib/chat-api";
import { useRefreshChatSessions } from "./ChatHistory";

function sessionTitle(text: string): string {
  const t = text.trim();
  return t.length > 50 ? `${t.slice(0, 50)}…` : t;
}

const QUERY_POOL = [
  "Which district had the most FIRs last month?",
  "List top 5 repeat accused by number of cases",
  "How many cases are still under investigation?",
  "Which crime head has the highest chargesheet rate?",
  "Show districts with rising crime this quarter",
  "List accused with cases in more than one district",
  "What's the average time to chargesheet by district?",
  "Show victim demographics for cases filed this year",
];

export function ChatWindow() {
  const {
    messages,
    activeSessionId,
    setActiveSessionId,
    addMessage,
    updateMessage,
    upsertSession,
  } = useChatStore();
  const refreshSessions = useRefreshChatSessions();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const generateQuery = () => {
    const pool = QUERY_POOL.filter((q) => q !== input);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setInput(pick);
    textareaRef.current?.focus();
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const ensureSession = async (): Promise<string | null> => {
    if (activeSessionId) return activeSessionId;
    const res = await fetch("/api/chats", { method: "POST", headers: chatHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    setActiveSessionId(data.session.id);
    upsertSession(data.session);
    return data.session.id as string;
  };

  const persistExchange = async (
    sessionId: string,
    userMsg: ChatMessage,
    asstMsg: ChatMessage,
    isFirstExchange: boolean
  ) => {
    const body: {
      title?: string;
      messages: Array<{
        role: string;
        content: string;
        sql?: string;
        rows?: Record<string, unknown>[];
        vizType?: string;
        sqlError?: string | null;
        relatedCases?: ChatMessage["relatedCases"];
      }>;
    } = {
      messages: [
        { role: "user", content: userMsg.content },
        {
          role: "assistant",
          content: asstMsg.content,
          sql: asstMsg.sql,
          rows: asstMsg.rows,
          vizType: asstMsg.vizType,
          sqlError: asstMsg.sqlError,
          relatedCases: asstMsg.relatedCases,
        },
      ],
    };
    if (isFirstExchange) body.title = sessionTitle(userMsg.content);

    const res = await fetch(`/api/chats/${sessionId}`, {
      method: "PATCH",
      headers: chatHeaders(),
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      upsertSession(data.session);
      await refreshSessions();
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || sending) return;
    setInput("");
    setSending(true);

    const userMsgId = `u-${Date.now()}`;
    const asstMsgId = `a-${Date.now()}`;
    const isFirstExchange = messages.length === 0;

    addMessage({ id: userMsgId, role: "user", content: text });
    addMessage({ id: asstMsgId, role: "assistant", content: "", loading: true });

    const history = messages
      .filter((m) => m.role === "user" || (m.role === "assistant" && !m.loading))
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

    let sessionId: string | null = null;
    let finalAsst: ChatMessage | null = null;

    try {
      const sessionPromise = ensureSession();
      const chatPromise = fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });

      const [sessionResult, res] = await Promise.all([sessionPromise, chatPromise]);
      sessionId = sessionResult;

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let summary = "";
      let meta: Partial<ChatMessage> = {};

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.type === "meta") {
              meta = {
                sql: parsed.sql,
                rows: parsed.rows,
                vizType: parsed.vizType as VizType,
                sqlError: parsed.sqlError,
                relatedCases: parsed.relatedCases,
              };
              updateMessage(asstMsgId, meta);
            } else if (parsed.type === "token") {
              summary += parsed.token;
              updateMessage(asstMsgId, { content: summary });
            } else if (parsed.type === "done") {
              updateMessage(asstMsgId, { loading: false, content: summary });
              finalAsst = {
                id: asstMsgId,
                role: "assistant",
                content: summary,
                ...meta,
                loading: false,
              };
            }
          } catch {}
        }
      }

      if (!finalAsst) {
        finalAsst = {
          id: asstMsgId,
          role: "assistant",
          content: summary || "No response.",
          ...meta,
          loading: false,
        };
        updateMessage(asstMsgId, { loading: false, content: finalAsst.content });
      }
    } catch {
      updateMessage(asstMsgId, { content: "Connection error. Please try again.", loading: false });
      finalAsst = {
        id: asstMsgId,
        role: "assistant",
        content: "Connection error. Please try again.",
        loading: false,
      };
    } finally {
      setSending(false);
      if (sessionId && finalAsst) {
        void persistExchange(
          sessionId,
          { id: userMsgId, role: "user", content: text },
          finalAsst,
          isFirstExchange
        );
      }
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-6 space-y-5">
        {messages.length === 0 && (
          <div className="min-h-full flex flex-col items-center justify-center text-center animate-fade-up">
            <div className="space-y-3">
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-data font-bold tracking-widest"
                style={{ background: "var(--red-dim)", color: "var(--red)", border: "1px solid var(--red)" }}
              >
                ● INTELLIGENCE SYSTEM ONLINE
              </div>
              <h2 className="text-3xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                What do you want to investigate?
              </h2>
              <p className="text-sm max-w-md" style={{ color: "var(--text-secondary)" }}>
                Ask anything about Karnataka crime data in plain English. I generate SQL, execute it, and explain what I found.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div
        className="shrink-0 px-4 pt-2 pb-3"
        style={{ borderTop: "1px solid var(--border)", background: "var(--bg-surface)" }}
      >
        <div className="flex flex-nowrap gap-2 items-center max-w-4xl mx-auto">
          <button
            onClick={generateQuery}
            disabled={sending}
            title="Generate a query"
            className="shrink-0 w-11 h-11 rounded-md flex items-center justify-center transition-all"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
            }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5L13 3z" />
            </svg>
          </button>

          <div className="flex-1 min-w-0 relative">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              disabled={sending}
              placeholder="Query the crime database… (Enter to send)"
              className="w-full resize-none rounded-md px-4 py-3 text-sm outline-none transition-all"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                minHeight: "44px",
                maxHeight: "120px",
              }}
              onFocus={(e) => { e.target.style.borderColor = "var(--ink)"; }}
              onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
            />
          </div>

          <button
            onClick={() => sendMessage(input)}
            disabled={sending || !input.trim()}
            className="shrink-0 w-11 h-11 rounded-md flex items-center justify-center text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--ink)" }}
          >
            {sending ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
                <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-center text-xs mt-2 font-data" style={{ color: "var(--text-muted)", opacity: 0.5 }}>
          KSP Intelligence System · Read-only · AI-generated analysis
        </p>
      </div>
    </div>
  );
}
