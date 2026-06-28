"use client";
import { create } from "zustand";

export type VizType = "table" | "chart" | "graph";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sql?: string;
  rows?: Record<string, unknown>[];
  vizType?: VizType;
  sqlError?: string | null;
  loading?: boolean;
}

interface ChatStore {
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),
  updateMessage: (id, patch) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),
  clearMessages: () => set({ messages: [] }),
}));
