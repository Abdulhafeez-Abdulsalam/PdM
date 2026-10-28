/**
 * Which app-wide overlay is open: the copilot panel, the command palette (Ctrl/Cmd + K) or the
 * shortcut sheet (?). One store, so a shortcut, a top-bar button or the palette can open any of
 * them. The copilot's conversation lives here too, so it survives closing and reopening the
 * panel (it's in memory only: a reload starts afresh).
 */
import type { CopilotAnswer } from "@pdm/contracts";
import { create } from "zustand";

type Overlay = "copilot" | "palette" | "shortcuts" | null;

interface OverlayStore {
  open: Overlay;
  show: (overlay: Exclude<Overlay, null>) => void;
  toggle: (overlay: Exclude<Overlay, null>) => void;
  close: () => void;
  /** The copilot conversation, oldest first. */
  answers: CopilotAnswer[];
  addAnswer: (answer: CopilotAnswer) => void;
  /** A question to ask as soon as the copilot opens (from the palette's "Ask the copilot"). */
  pendingQuestion: string | null;
  ask: (question: string) => void;
  takePending: () => string | null;
}

export const useOverlays = create<OverlayStore>((set, get) => ({
  open: null,
  show: (overlay) => set({ open: overlay }),
  toggle: (overlay) => set((s) => ({ open: s.open === overlay ? null : overlay })),
  close: () => set({ open: null }),
  answers: [],
  addAnswer: (answer) => set((s) => ({ answers: [...s.answers.slice(-19), answer] })),
  pendingQuestion: null,
  ask: (question) => set({ open: "copilot", pendingQuestion: question }),
  takePending: () => {
    const q = get().pendingQuestion;
    if (q !== null) set({ pendingQuestion: null });
    return q;
  },
}));
