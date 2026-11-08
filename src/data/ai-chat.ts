// The AI Assistant chats. Questions are answered FOR FREE on the phone
// (answer.ts works out the question and looks up the owner's own data). The
// paid Claude version is ready but switched off: see USE_CLAUDE.
//
// There's one open chat at a time. "New chat" files it under Previous chats,
// "Clear" deletes it. Previous chats are saved on this phone (for the
// signed-in owner only), so they're still there after the app is closed.
// Chats asked during the sample preview aren't saved.
import { sampleSnapshotStore } from '@/data/ai-insights';
import { rosterOnJob } from '@/data/ai-roster';
import { appSnapshot } from '@/data/ai-snapshot';
import { functionError } from '@/data/connected-accounts';
import { createStore } from '@/data/store';
import { newId } from '@/lib/ids';
import { sessionStorage as phoneStorage } from '@/lib/session-storage';
import { supabase } from '@/lib/supabase';

import { answerQuestion, type RosterProposal } from '../../supabase/functions/_shared/ai/answer';
import type { ResultCard } from '../../supabase/functions/_shared/ai/types';

/**
 * Off = free answers only (no AI company, no cost).
 * On = questions the free version doesn't understand are sent to Claude
 * (needs ANTHROPIC_API_KEY on the server and the ai-assistant function
 * deployed; each of those questions costs a few cents).
 */
export const USE_CLAUDE = false;

/** How many previous chats are kept on the phone (oldest are dropped). */
const MAX_SAVED_CHATS = 30;

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  cards: ResultCard[];
  /** The answer couldn't be fetched (shown in a warning colour, with Try again). */
  failed?: boolean;
  /** "Who do you want to roster?": the people to pick from (see confirmRoster). */
  roster?: RosterProposal;
  /** The roster was confirmed (or cancelled), so the pick-list is done. */
  rosterDone?: boolean;
  /**
   * Answers only: the question as it was understood (a follow-up like "when was
   * the last one?" is combined with the question before it). The next
   * follow-up builds on this.
   */
  asked?: string;
};

export type Chat = {
  id: string;
  /** The first question, shortened. */
  title: string;
  messages: ChatMessage[];
  /**
   * Claude version only: the conversation exactly as the server returned it,
   * sent back unchanged with each question (the AI needs it to only ever grow).
   */
  history: unknown[];
  /** ISO timestamp of the last message. */
  updatedAt: string;
  /** Asked during the sample preview (never saved). */
  sample?: boolean;
};

type ChatState = {
  current: Chat;
  saved: Chat[];
  sending: boolean;
};

const emptyChat = (): Chat => ({ id: newId(), title: '', messages: [], history: [], updatedAt: new Date().toISOString() });

export const aiChatStore = createStore<ChatState>({ current: emptyChat(), saved: [], sending: false });

export function useAiChat() {
  return aiChatStore.use();
}

// ---------------------------------------------------------------------------
// Saving on the phone
// ---------------------------------------------------------------------------

let storageKey: string | null = null;

/** Saves the previous chats (and the open one, filed under them) for this owner. */
function persist() {
  if (!storageKey) return;
  const { current, saved } = aiChatStore.get();
  const keep = [current, ...saved].filter((c) => c.messages.length > 0 && !c.sample).slice(0, MAX_SAVED_CHATS);
  phoneStorage.setItem(storageKey, JSON.stringify(keep)).catch(() => {});
}

/** Loads this owner's previous chats (called after logging in). */
export async function loadSavedChats(userId: string) {
  storageKey = `nexgain-ai-chats:${userId}`;
  try {
    const raw = await phoneStorage.getItem(storageKey);
    const saved = raw ? (JSON.parse(raw) as Chat[]) : [];
    aiChatStore.set({ current: emptyChat(), saved: Array.isArray(saved) ? saved : [], sending: false });
  } catch {
    aiChatStore.set({ current: emptyChat(), saved: [], sending: false });
  }
}

/** Logging out: clear the screen (the saved chats stay on the phone for when they log back in). */
export function resetChats() {
  storageKey = null;
  aiChatStore.set({ current: emptyChat(), saved: [], sending: false });
}

// ---------------------------------------------------------------------------
// The open chat
// ---------------------------------------------------------------------------

const titleOf = (question: string) => (question.length > 60 ? `${question.slice(0, 57).trimEnd()}…` : question);

function addAnswer(answer: ChatMessage, history?: unknown[]) {
  aiChatStore.set((s) => ({
    ...s,
    sending: false,
    current: {
      ...s.current,
      messages: [...s.current.messages, answer],
      history: history ?? s.current.history,
      updatedAt: new Date().toISOString(),
    },
  }));
  persist();
}

type AssistantReply = { reply: string; cards: ResultCard[]; newMessages: unknown[] };

/** The last job shown in the chat, for "this job". */
function lastJobInChat(messages: ChatMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const job = [...messages[i].cards].reverse().find((c) => c.type === 'job');
    if (job) return job.id;
    if (messages[i].roster) return messages[i].roster!.jobId;
  }
  return null;
}

export async function askAssistant(question: string, options: { jobId?: string } = {}) {
  const text = question.trim();
  const state = aiChatStore.get();
  if (!text || state.sending) return;
  const sample = sampleSnapshotStore.get();
  const context = {
    lastJobId: options.jobId ?? lastJobInChat(state.current.messages),
    previousQuestion: [...state.current.messages].reverse().find((m) => m.role === 'assistant' && m.asked)?.asked ?? null,
  };
  aiChatStore.set({
    ...state,
    sending: true,
    current: {
      ...state.current,
      title: state.current.title || titleOf(text),
      sample: state.current.messages.length === 0 ? sample !== null : state.current.sample,
      messages: [...state.current.messages, { id: newId(), role: 'user', text, cards: [] }],
    },
  });

  // Free first: answered on the phone from the owner's own data (or the sample business in the preview).
  let free: ReturnType<typeof answerQuestion> | null = null;
  try {
    free = answerQuestion(sample ?? (await appSnapshot()), text, new Date(), context);
  } catch (e) {
    console.warn('Free AI answer failed:', e instanceof Error ? e.message : e);
  }
  if (free && (free.understood || !USE_CLAUDE || sample)) {
    addAnswer({
      id: newId(),
      role: 'assistant',
      text: free.text,
      cards: free.cards,
      roster: free.roster,
      asked: free.understood ? (free.asked ?? text) : undefined,
    });
    return;
  }
  if (!USE_CLAUDE) {
    addAnswer({ id: newId(), role: 'assistant', text: "Sorry, I couldn't answer that just now. Please try again.", cards: [], failed: true });
    return;
  }

  // Paid Claude version (only when USE_CLAUDE is on).
  const { data, error } = await supabase.functions.invoke<AssistantReply>('ai-assistant', {
    body: { history: state.current.history, message: text },
  });
  if (error || !data) {
    const { code, message } = await functionError(error, "I couldn't answer that right now. Please try again.");
    addAnswer({
      id: newId(),
      role: 'assistant',
      text:
        code === 'not_configured'
          ? "I'm not switched on yet. The business owner needs to add an AI key to the server (see the setup steps), then I'll be ready to help."
          : message,
      cards: [],
      failed: true,
    });
    return;
  }
  addAnswer(
    { id: newId(), role: 'assistant', text: data.reply, cards: data.cards ?? [] },
    [...state.current.history, ...(data.newMessages ?? [])],
  );
}

/** "Roster staff" on a job card: asks who to roster on that job. */
export function rosterStaffOn(jobId: string, jobLabel: string) {
  askAssistant(`Roster staff on ${jobLabel}`, { jobId });
}

/** The owner ticked people and tapped Roster (or Cancel, with no one). */
export function confirmRoster(messageId: string, employeeIds: string[] | null) {
  const message = aiChatStore.get().current.messages.find((m) => m.id === messageId);
  const proposal = message?.roster;
  if (!proposal || message.rosterDone) return;
  aiChatStore.set((s) => ({
    ...s,
    current: { ...s.current, messages: s.current.messages.map((m) => (m.id === messageId ? { ...m, rosterDone: true } : m)) },
  }));

  if (employeeIds === null) {
    addAnswer({ id: newId(), role: 'assistant', text: 'No problem, nobody was rostered.', cards: [] });
    return;
  }
  const names = proposal.options.filter((o) => employeeIds.includes(o.employeeId)).map((o) => o.name);
  if (sampleSnapshotStore.get()) {
    addAnswer({
      id: newId(),
      role: 'assistant',
      text: `Sample preview: ${names.join(', ')} would now be rostered on ${proposal.jobLabel}, ${proposal.when}. Nothing was saved.`,
      cards: [],
    });
    return;
  }
  const result = rosterOnJob(proposal.jobId, employeeIds);
  if (!result.ok) {
    addAnswer({ id: newId(), role: 'assistant', text: result.message, cards: [], failed: false });
    return;
  }
  const who = result.names.length === 1 ? result.names[0] : `${result.names.slice(0, -1).join(', ')} and ${result.names[result.names.length - 1]}`;
  addAnswer({
    id: newId(),
    role: 'assistant',
    text: `Done! ${who} ${result.names.length === 1 ? 'is' : 'are'} now rostered on ${proposal.jobLabel}, ${proposal.when}. ${result.names.length === 1 ? 'They' : 'Each of them'} will get a "New shift assigned" notification, and the job now shows as Assigned.`,
    cards: [],
  });
}

/** Asks the last question again after it failed. */
export function retryLast() {
  const { messages } = aiChatStore.get().current;
  const lastQuestion = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastQuestion) return;
  // Drop the failed question and its error, then ask again.
  aiChatStore.set((s) => ({
    ...s,
    current: { ...s.current, messages: s.current.messages.slice(0, s.current.messages.lastIndexOf(lastQuestion)) },
  }));
  askAssistant(lastQuestion.text);
}

/** Files the open chat under Previous chats (if it has anything in it) and starts a fresh one. */
export function newChat() {
  aiChatStore.set((s) => {
    const keep = s.current.messages.length > 0 && !s.current.sample;
    return { ...s, current: emptyChat(), saved: keep ? [s.current, ...s.saved].slice(0, MAX_SAVED_CHATS) : s.saved };
  });
  persist();
}

/** Deletes the open chat (it isn't kept under Previous chats). */
export function clearChat() {
  aiChatStore.set((s) => ({ ...s, current: emptyChat() }));
  persist();
}

/** Reopens a previous chat to carry on with it. The open chat is filed away first. */
export function openChat(id: string) {
  const { saved } = aiChatStore.get();
  const chosen = saved.find((c) => c.id === id);
  if (!chosen) return;
  aiChatStore.set((s) => {
    const rest = s.saved.filter((c) => c.id !== id);
    const keep = s.current.messages.length > 0 && !s.current.sample;
    return { ...s, current: chosen, saved: keep ? [s.current, ...rest] : rest };
  });
  persist();
}

export function deleteSavedChat(id: string) {
  aiChatStore.set((s) => ({ ...s, saved: s.saved.filter((c) => c.id !== id) }));
  persist();
}

export function deleteAllSavedChats() {
  aiChatStore.set((s) => ({ ...s, saved: [] }));
  persist();
}
