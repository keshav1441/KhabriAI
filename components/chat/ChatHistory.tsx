"use client";
import { useEffect, useCallback } from "react";
import { useChatStore } from "@/store/chat";
import { chatHeaders, type ChatSessionSummary } from "@/lib/chat-api";
import type { ChatMessage } from "@/store/chat";

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function ChatHistory() {
  const {
    sessions,
    activeSessionId,
    setSessions,
    setActiveSessionId,
    setMessages,
    resetToNewChat,
    removeSession,
  } = useChatStore();

  const fetchSessions = useCallback(async () => {
    const res = await fetch("/api/chats", { headers: chatHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    setSessions(data.sessions as ChatSessionSummary[]);
  }, [setSessions]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const loadSession = async (id: string) => {
    if (id === activeSessionId) return;
    const res = await fetch(`/api/chats/${id}`, { headers: chatHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    setActiveSessionId(id);
    setMessages(
      (data.session.messages as ChatMessage[]).map((m) => ({
        ...m,
        id: m.id,
      }))
    );
  };

  const handleNewChat = () => {
    resetToNewChat();
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const res = await fetch(`/api/chats/${id}`, { method: "DELETE", headers: chatHeaders() });
    if (!res.ok) return;
    removeSession(id);
  };

  return (
    <div className="pt-4 flex flex-col min-h-0 flex-1">
      <div className="px-2 mb-2 shrink-0">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center gap-2 text-xs font-medium px-2 py-2 rounded-md transition-all"
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--red)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
          }}
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New chat
        </button>
      </div>

      <p className="text-xs font-bold tracking-widest uppercase px-2 mb-2 font-data shrink-0" style={{ color: "var(--text-muted)" }}>
        Recent chats
      </p>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-0.5 px-1">
        {sessions.length === 0 && (
          <p className="text-xs px-2 py-2" style={{ color: "var(--text-muted)" }}>
            No chats yet
          </p>
        )}
        {sessions.map((s) => {
          const active = activeSessionId === s.id;
          return (
            <button
              key={s.id}
              onClick={() => loadSession(s.id)}
              className="w-full group flex items-start gap-1 text-left text-xs px-2 py-2 rounded-md transition-all"
              style={{
                background: active ? "var(--bg-raised)" : "transparent",
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
                borderLeft: `2px solid ${active ? "var(--red)" : "transparent"}`,
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = "var(--bg-raised)";
                  (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                }
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.title}</p>
                <p className="font-data mt-0.5" style={{ color: "var(--text-muted)", fontSize: "10px" }}>
                  {formatRelative(s.updatedAt)}
                </p>
              </div>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => handleDelete(e, s.id)}
                onKeyDown={(e) => e.key === "Enter" && handleDelete(e as unknown as React.MouseEvent, s.id)}
                className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity"
                style={{ color: "var(--text-muted)" }}
                title="Delete chat"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// expose refresh for ChatWindow after saves
export function useRefreshChatSessions() {
  const setSessions = useChatStore((s) => s.setSessions);
  return useCallback(async () => {
    const res = await fetch("/api/chats", { headers: chatHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    setSessions(data.sessions);
  }, [setSessions]);
}
