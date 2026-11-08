// The AI Assistant chat for this session. Questions are answered FOR FREE on
// the phone (answer.ts works out the question and looks up the owner's own
// data). The paid Claude version is ready but switched off: see USE_CLAUDE.
// The chat is kept in memory until the owner taps "New chat" or logs out.
import { sampleSnapshotStore } from '@/data/ai-insights';
import { appSnapshot } from '@/data/ai-snapshot';
import { functionError } from '@/data/connected-accounts';
import { createStore } from '@/data/store';
import { newId } from '@/lib/ids';
import { supabase } from '@/lib/supabase';

import { answerQuestion } from '../../supabase/functions/_shared/ai/answer';
import type { ResultCard } from '../../supabase/functions/_shared/ai/types';

/**
 * Off = free answers only (no AI company, no cost).
 * On = questions the free version doesn't understand are sent to Claude
 * (needs ANTHROPIC_API_KEY on the server and the ai-assistant function
 * deployed; each of those questions costs a few cents).
 */
export const USE_CLAUDE = false;

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  cards: ResultCard[];
  /** The answer couldn't be fetched (shown in a warning colour, with Try again). */
  failed?: boolean;
};

type ChatState = {
  messages: ChatMessage[];
  /**
   * The conversation exactly as the server returned it. It's sent back
   * unchanged with each question (the AI needs the chat to only ever grow).
   */
  history: unknown[];
  sending: boolean;
};

const EMPTY: ChatState = { messages: [], history: [], sending: false };

export const aiChatStore = createStore<ChatState>(EMPTY);

export function useAiChat() {
  return aiChatStore.use();
}

type AssistantReply = { reply: string; cards: ResultCard[]; newMessages: unknown[] };

export async function askAssistant(question: string) {
  const text = question.trim();
  const state = aiChatStore.get();
  if (!text || state.sending) return;
  aiChatStore.set({
    ...state,
    sending: true,
    messages: [...state.messages, { id: newId(), role: 'user', text, cards: [] }],
  });

  // Free first: answered on the phone from the owner's own data (or the sample business in the preview).
  const sample = sampleSnapshotStore.get();
  let free: ReturnType<typeof answerQuestion> | null = null;
  try {
    free = answerQuestion(sample ?? (await appSnapshot()), text);
  } catch (e) {
    console.warn('Free AI answer failed:', e instanceof Error ? e.message : e);
  }
  if (free && (free.understood || !USE_CLAUDE || sample)) {
    const answer: ChatMessage = { id: newId(), role: 'assistant', text: free.text, cards: free.cards };
    aiChatStore.set((s) => ({ ...s, sending: false, messages: [...s.messages, answer] }));
    return;
  }
  if (!USE_CLAUDE) {
    const answer: ChatMessage = { id: newId(), role: 'assistant', text: "Sorry, I couldn't answer that just now. Please try again.", cards: [], failed: true };
    aiChatStore.set((s) => ({ ...s, sending: false, messages: [...s.messages, answer] }));
    return;
  }

  // Paid Claude version (only when USE_CLAUDE is on).
  const { data, error } = await supabase.functions.invoke<AssistantReply>('ai-assistant', {
    body: { history: state.history, message: text },
  });

  let answer: ChatMessage;
  let history = state.history;
  if (error || !data) {
    const { code, message } = await functionError(error, "I couldn't answer that right now. Please try again.");
    answer = {
      id: newId(),
      role: 'assistant',
      text:
        code === 'not_configured'
          ? "I'm not switched on yet. The business owner needs to add an AI key to the server (see the setup steps), then I'll be ready to help."
          : message,
      cards: [],
      failed: true,
    };
  } else {
    answer = { id: newId(), role: 'assistant', text: data.reply, cards: data.cards ?? [] };
    history = [...state.history, ...(data.newMessages ?? [])];
  }
  aiChatStore.set((s) => ({ ...s, sending: false, history, messages: [...s.messages, answer] }));
}

/** Asks the last question again after it failed. */
export function retryLast() {
  const { messages } = aiChatStore.get();
  const lastQuestion = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastQuestion) return;
  // Drop the failed question and its error, then ask again.
  aiChatStore.set((s) => ({ ...s, messages: s.messages.slice(0, s.messages.lastIndexOf(lastQuestion)) }));
  askAssistant(lastQuestion.text);
}

export function newChat() {
  aiChatStore.set(EMPTY);
}
