// Supabase Edge Function: the AI Assistant chat. The app never talks to the AI
// provider directly; the API key stays here on the server.
//
// POST { history: MessageParam[], message: string }
//   history = everything this function returned as `newMessages` earlier in the
//             same chat, sent back unchanged (the Claude API needs the chat
//             to grow only by adding to the end).
//   -> 200 { reply, cards, newMessages }
//   -> 401 { error: "not_owner" }        only business owners can use it
//   -> 503 { error: "not_configured" }   ANTHROPIC_API_KEY isn't set yet
//   -> 4xx/5xx { error, message }
//
// Setup: deploy as "ai-assistant" with "Verify JWT" ON, and set the secret
// ANTHROPIC_API_KEY (your key from console.anthropic.com).
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

import { CORS, env, reply } from '../_shared/connections.ts';
import { todayKey } from '../_shared/ai/dates.ts';
import { SYSTEM_PROMPT, withToday } from '../_shared/ai/prompt.ts';
import { loadSnapshot } from '../_shared/ai/snapshot.ts';
import { runTool, TOOL_DEFINITIONS } from '../_shared/ai/tools.ts';
import type { ResultCard } from '../_shared/ai/types.ts';

const MODEL = 'claude-opus-5-5';
/** Tool rounds per question (each round can look several things up at once). */
const MAX_ROUNDS = 8;
/** A very long chat: ask the owner to start a new one. */
const MAX_HISTORY_CHARS = 1_500_000;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type Block = { type: string; [key: string]: unknown };
type MessageParam = { role: 'user' | 'assistant'; content: string | Block[] };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed.' });

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return reply(503, { error: 'not_configured', message: "The AI Assistant isn't set up yet (no AI key on the server)." });
  }

  // The owner's own login, so database security (RLS) applies to every lookup.
  const authorization = req.headers.get('Authorization') ?? '';
  const jwt = authorization.replace(/^Bearer\s+/i, '');
  if (!jwt) return reply(401, { error: 'not_owner', message: 'Please log in again.' });
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: auth } = await db.auth.getUser(jwt);
  if (!auth.user) return reply(401, { error: 'not_owner', message: 'Please log in again.' });
  const { data: business } = await db.from('businesses').select('id').eq('owner_id', auth.user.id).limit(1).maybeSingle();
  if (!business?.id) return reply(401, { error: 'not_owner', message: 'Only business owners can use the AI Assistant.' });

  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : '';
  if (!message) return reply(400, { error: 'bad_request', message: 'Type a question first.' });
  const history: MessageParam[] = Array.isArray(body.history) ? body.history : [];
  if (JSON.stringify(history).length > MAX_HISTORY_CHARS) {
    return reply(413, { error: 'too_long', message: 'This chat is getting long. Tap "New chat" to start a fresh one.' });
  }

  const snapshot = await loadSnapshot(db, business.id as string);
  if (!snapshot) return reply(500, { error: 'no_data', message: "Couldn't load your business data. Please try again." });

  const now = new Date();
  const messages: MessageParam[] = [
    ...history,
    { role: 'user', content: withToday(message, todayKey(now), WEEKDAYS[new Date(now.getTime() + 10 * 3600_000).getUTCDay()]) },
  ];
  const cards: ResultCard[] = [];
  const client = new Anthropic({ apiKey });
  let text = '';

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      // Request fields that newer API features use are passed as-is.
      const params = {
        model: MODEL,
        max_tokens: 16000,
        // A declined request is retried on a suitable fallback model automatically.
        betas: ['server-side-fallback-2026-07-01', 'thinking-binding-controls-2026-08-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
        output_config: { effort: 'medium' },
        // The instructions and tools never change, so they're cached between messages.
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: TOOL_DEFINITIONS,
        messages,
      };
      const response = await client.beta.messages.create(params as unknown as Parameters<typeof client.beta.messages.create>[0]);
      const content = response.content as unknown as Block[];
      // Keep the whole reply (including thinking blocks) exactly as it came.
      messages.push({ role: 'assistant', content });

      if (response.stop_reason === 'refusal') {
        text = "Sorry, I can't help with that one. Try asking about your jobs, invoices, team or spending.";
        break;
      }
      if (response.stop_reason === 'pause_turn') continue;

      const toolUses = content.filter((b) => b.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        text = content
          .filter((b) => b.type === 'text')
          .map((b) => String(b.text ?? ''))
          .join('\n')
          .trim();
        if (response.stop_reason === 'max_tokens' && !text) text = 'Sorry, that answer got cut off. Please ask again a bit more specifically.';
        break;
      }

      // Run every lookup Claude asked for, then send all the results back together.
      const results = toolUses.map((use) => {
        const outcome = runTool(snapshot, String(use.name), (use.input ?? {}) as Record<string, unknown>, now);
        if (outcome.cards) cards.push(...outcome.cards);
        return { type: 'tool_result', tool_use_id: String(use.id), content: JSON.stringify(outcome.result) };
      });
      messages.push({ role: 'user', content: results });
    }
    // Ran out of lookups before answering. Every tool call has its result, so the chat can carry on.
    if (!text && messages[messages.length - 1].role === 'user') {
      text = 'That needed a lot of looking up and I ran out of steps. Could you ask about one thing at a time?';
    }
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return reply(503, { error: 'not_configured', message: 'The AI key on the server is not valid. Check ANTHROPIC_API_KEY.' });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return reply(429, { error: 'busy', message: 'The AI is busy right now. Please try again in a minute.' });
    }
    if (error instanceof Anthropic.BadRequestError) {
      console.warn('AI request rejected:', error.message);
      return reply(400, { error: 'bad_request', message: 'Something went wrong with this chat. Tap "New chat" and try again.' });
    }
    if (error instanceof Anthropic.APIError) {
      console.warn(`AI error ${error.status}:`, error.message);
      return reply(502, { error: 'ai_error', message: "The AI couldn't answer right now. Please try again." });
    }
    console.warn('AI Assistant failed:', error instanceof Error ? error.message : error);
    return reply(500, { error: 'failed', message: "The AI couldn't answer right now. Please try again." });
  }

  // Unique cards, in the order they were shown.
  const seen = new Set<string>();
  const uniqueCards = cards.filter((c) => {
    const k = `${c.type}:${c.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return reply(200, {
    reply: text || "I couldn't find an answer to that. Could you ask it another way?",
    cards: uniqueCards,
    newMessages: messages.slice(history.length),
  });
});
