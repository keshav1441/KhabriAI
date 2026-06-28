"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useChatStore, type VizType } from "@/store/chat";
import { MessageBubble } from "./MessageBubble";

interface Props {
  prefillQuery?: string;
}

const SUGGESTIONS = [
  { icon: "◈", text: "Show theft cases in Bengaluru Urban in the last 6 months" },
  { icon: "◉", text: "Which districts had the most burglary cases this year?" },
  { icon: "◎", text: "Show burglary hotspots in Mysuru district on map" },
  { icon: "⬡", text: "Which suspects are linked to more than 2 cases this month?" },
];

export function ChatWindow({ prefillQuery }: Props) {
  const { messages, addMessage, updateMessage } = useChatStore();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const startVoice = useCallback(() => {
    if (typeof window === "undefined") return;
    const SR =
      (window as typeof window & { SpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ??
      (window as typeof window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const t = e.results[0][0].transcript;
      setInput((prev) => (prev ? `${prev} ${t}` : t));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, []);

  useEffect(() => { if (prefillQuery) setInput(prefillQuery); }, [prefillQuery]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || sending) return;
    setInput("");
    setSending(true);

    const userMsgId = `u-${Date.now()}`;
    const asstMsgId = `a-${Date.now()}`;

    addMessage({ id: userMsgId, role: "user", content: text });
    addMessage({ id: asstMsgId, role: "assistant", content: "", loading: true });

    const history = messages
      .filter((m) => m.role === "user" || (m.role === "assistant" && !m.loading))
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let summary = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.type === "meta") {
              updateMessage(asstMsgId, { sql: parsed.sql, rows: parsed.rows, vizType: parsed.vizType as VizType, sqlError: parsed.sqlError });
            } else if (parsed.type === "token") {
              summary += parsed.token;
              updateMessage(asstMsgId, { content: summary });
            } else if (parsed.type === "done") {
              updateMessage(asstMsgId, { loading: false, content: summary });
            }
          } catch {}
        }
      }
    } catch {
      updateMessage(asstMsgId, { content: "Connection error. Please try again.", loading: false });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages */}
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

      {/* Input */}
      <div
        className="shrink-0 px-4 pt-2 pb-3"
        style={{ borderTop: "1px solid var(--border)", background: "var(--bg-surface)" }}
      >
        {/* Suggestion chips — collapse after first message */}
        {messages.length === 0 && (
          <div className="grid grid-cols-2 gap-1.5 max-w-4xl mx-auto mb-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.text}
                className="text-left text-xs px-3 py-2 rounded-md transition-all truncate"
                style={{
                  background: "var(--bg-raised)",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--red)";
                  (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                  (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                }}
                onClick={() => sendMessage(s.text)}
              >
                <span className="mr-1.5" style={{ color: "var(--red)" }}>{s.icon}</span>
                {s.text}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-center max-w-4xl mx-auto">
          {/* Mic */}
          <button
            onClick={startVoice}
            disabled={sending}
            title="Voice input"
            className="shrink-0 w-11 h-11 rounded-md flex items-center justify-center transition-all"
            style={{
              background: listening ? "var(--red-dim)" : "var(--bg-raised)",
              border: `1px solid ${listening ? "var(--red)" : "var(--border)"}`,
              color: listening ? "var(--red)" : "var(--text-muted)",
            }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>

          {/* Textarea */}
          <div className="flex-1 relative">
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
              onFocus={(e) => { e.target.style.borderColor = "var(--red)"; }}
              onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
            />
          </div>

          {/* Send */}
          <button
            onClick={() => sendMessage(input)}
            disabled={sending || !input.trim()}
            className="shrink-0 w-11 h-11 rounded-md flex items-center justify-center text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--red)" }}
          >
            {sending ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
                <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
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
