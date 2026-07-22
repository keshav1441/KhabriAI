"use client";
import { create } from "zustand";
import type { ChatSessionSummary } from "@/lib/chat-api";

export type VizType = "table" | "chart" | "graph";
export type Lang = "en" | "kn";

export interface RelatedCase {
  id: number;
  crimeNo: string | null;
  briefFacts: string | null;
  crimeGroup: string | null;
  district: string | null;
  score: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sql?: string;
  rows?: Record<string, unknown>[];
  vizType?: VizType;
  sqlError?: string | null;
  relatedCases?: RelatedCase[];
  loading?: boolean;
}

export interface CaseBoardStep {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  status: "ok" | "error" | "pending";
}

interface ChatStore {
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  messages: ChatMessage[];
  caseBoardSteps: CaseBoardStep[];
  lang: Lang;
  setLang: (lang: Lang) => void;
  setSessions: (sessions: ChatSessionSummary[]) => void;
  upsertSession: (session: ChatSessionSummary) => void;
  removeSession: (id: string) => void;
  setActiveSessionId: (id: string | null) => void;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (msg: ChatMessage) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  resetToNewChat: () => void;
  resetCaseBoard: () => void;
  upsertCaseBoardStep: (step: CaseBoardStep) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  caseBoardSteps: [],
  lang: "en",
  setLang: (lang) => set({ lang }),
  setSessions: (sessions) => set({ sessions }),
  upsertSession: (session) =>
    set((state) => {
      const rest = state.sessions.filter((s) => s.id !== session.id);
      return { sessions: [session, ...rest].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()) };
    }),
  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
      messages: state.activeSessionId === id ? [] : state.messages,
    })),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setMessages: (messages) => set({ messages }),
  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),
  updateMessage: (id, patch) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),
  resetToNewChat: () => set({ activeSessionId: null, messages: [], caseBoardSteps: [] }),
  resetCaseBoard: () => set({ caseBoardSteps: [] }),
  upsertCaseBoardStep: (step) =>
    set((state) => {
      const idx = state.caseBoardSteps.findIndex((s) => s.id === step.id);
      if (idx === -1) return { caseBoardSteps: [...state.caseBoardSteps, step] };
      const next = state.caseBoardSteps.slice();
      next[idx] = step;
      return { caseBoardSteps: next };
    }),
}));
