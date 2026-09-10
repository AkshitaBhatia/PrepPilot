import {
  parseQuiz,
  parseReply,
  parseSummary,
  type ParsedReply,
  type Quiz,
} from '@preppilot/shared';
import { getEnv, isDemoMode } from '../../config/env';
import { getSupabase } from '../../lib/supabase';

/**
 * Talks to the AI, through the server and never directly.
 *
 * The Gemini key is server-side only (PRD §15), so requests go to a Supabase
 * Edge Function that holds it. Nothing here knows the key, and putting one in
 * this file would ship it to every device that installs the app.
 *
 * The function is not deployed yet — it needs a Supabase project — so
 * `isConfigured` gates the UI rather than letting a student send a question into
 * nothing.
 */

export const EDGE_FUNCTION = 'ask-gemini';

export interface AskResult {
  readonly ok: true;
  readonly reply: ParsedReply;
}

export interface AskFailure {
  readonly ok: false;
  /** A student-facing message. Never a raw server error. */
  readonly message: string;
}

/**
 * Why the assistant cannot be used, or null when it can.
 *
 * The proxy spends the project owner's Gemini quota, so it answers only a
 * request carrying a real account's token and refuses everything else. Demo mode
 * has no such token by design — it never contacts Supabase — so a question asked
 * there would be typed out in full and then rejected. Saying so first is kinder
 * than a composer that looks ready and is not.
 */
export type UnavailableReason = 'unconfigured' | 'demo' | 'guest';

export interface AvailabilityContext {
  /** Signed in without an account. The assistant needs one; the tracker does not. */
  readonly isGuest?: boolean;
}

export function unavailableReason({
  isGuest = false,
}: AvailabilityContext = {}): UnavailableReason | null {
  // Checked first: a guest has no token to spend, and telling them the server is
  // misconfigured would send them looking for a fault that is not there.
  if (isGuest) return 'guest';

  let env;
  try {
    env = getEnv();
  } catch {
    // Missing configuration is exactly the case this reports.
    return 'unconfigured';
  }

  // A local proxy holds the key itself and needs no Supabase project at all, so
  // once one is configured the assistant works regardless of the rest (D56).
  if (env.aiProxyUrl !== null) return null;

  // Checked before the credentials, because demo mode deliberately blanks them:
  // testing those first reported a demo as "not set up yet", which sounds like
  // something is broken rather than switched off.
  if (env.demoMode && !env.allowAnonymousAi) return 'demo';

  if (env.supabaseUrl.length === 0 || env.supabaseAnonKey.length === 0) return 'unconfigured';

  return null;
}

/** True when a request can actually be made and paid for. */
export function isConfigured(context: AvailabilityContext = {}): boolean {
  return unavailableReason(context) === null;
}

export const UNAVAILABLE_COPY: Record<UnavailableReason, string> = {
  unconfigured:
    'The assistant needs a server to hold the Gemini key, and none is configured. See docs/developer/AI_LOCALLY.md to run one.',
  demo: 'The assistant is off in this demo. Run the local AI proxy to switch it on — see docs/developer/AI_LOCALLY.md.',
  guest:
    'The assistant needs an account. Sign in and it turns on — everything you have tracked so far comes with you.',
};

export interface AskOptions {
  readonly question: string;
  /** Names the student can see, so the model can refer to their actual syllabus. */
  readonly subjectNames: readonly string[];
}

/**
 * Calls the proxy without a Supabase client.
 *
 * Used when there is no account: creating the client constructs its auth layer,
 * which on web reads `expo-secure-store` — a module with no web implementation —
 * and throws. A plain request needs none of that, and an anonymous call has no
 * session for the client to manage anyway.
 */
async function invokeAnonymously(body: Record<string, unknown>): Promise<{ reply?: string }> {
  const env = getEnv();

  // A local proxy is the same function, run directly. It holds the key itself,
  // so it needs no Supabase credentials — and in a demo there are none to send.
  const url = env.aiProxyUrl ?? `${env.supabaseUrl}/functions/v1/${EDGE_FUNCTION}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env.aiProxyUrl === null) {
    headers.apikey = env.supabaseAnonKey;
    headers.Authorization = `Bearer ${env.supabaseAnonKey}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Edge Function returned ${response.status}`);
  }

  return (await response.json()) as { reply?: string };
}

/** Sends one request, signed in or not. */
async function invoke(body: Record<string, unknown>): Promise<{ reply?: string }> {
  // A proxy or a demo both mean there is no session to attach, so neither needs
  // — nor can build — a Supabase client.
  if (getEnv().aiProxyUrl !== null || isDemoMode()) return invokeAnonymously(body);

  const { data, error } = await getSupabase().functions.invoke<{ reply?: string }>(EDGE_FUNCTION, {
    body,
  });
  if (error !== null) throw error;

  return data ?? {};
}

export async function ask({ question, subjectNames }: AskOptions): Promise<AskResult | AskFailure> {
  const unavailable = unavailableReason();
  if (unavailable !== null) {
    return { ok: false, message: UNAVAILABLE_COPY[unavailable] };
  }

  try {
    const data = await invoke({ question, subjectNames, mode: 'ask' });

    const reply = data.reply;
    if (typeof reply !== 'string' || reply.trim().length === 0) {
      return { ok: false, message: 'The assistant did not reply. Try asking again.' };
    }

    return { ok: true, reply: parseReply(reply) };
  } catch (error) {
    return { ok: false, message: describeFailure(error) };
  }
}

export interface TopicContext {
  readonly topicName: string;
  readonly chapterName?: string;
  readonly subjectName?: string;
}

export type SummaryResult =
  | { readonly ok: true; readonly summary: string }
  | { readonly ok: false; readonly message: string };

/**
 * Summarises one topic.
 *
 * The topic's *name* and its place in the syllabus are all there is to work
 * from: a template stores names and nothing else, so there is no prose to
 * condense. The proxy tells the model to say when a name is too vague rather
 * than invent detail for it.
 */
export async function summariseTopic(topic: TopicContext): Promise<SummaryResult> {
  const unavailable = unavailableReason();
  if (unavailable !== null) return { ok: false, message: UNAVAILABLE_COPY[unavailable] };

  try {
    const data = await invoke({ ...topic, mode: 'summarize' });
    const summary = parseSummary(data.reply ?? '');

    if (summary === null) {
      return {
        ok: false,
        message: 'The assistant did not have anything useful to say about that.',
      };
    }
    return { ok: true, summary };
  } catch (error) {
    return { ok: false, message: describeFailure(error) };
  }
}

export type QuizResult =
  { readonly ok: true; readonly quiz: Quiz } | { readonly ok: false; readonly message: string };

/** Three questions checking whether a topic is actually understood. */
export async function quizTopic(topic: TopicContext): Promise<QuizResult> {
  const unavailable = unavailableReason();
  if (unavailable !== null) return { ok: false, message: UNAVAILABLE_COPY[unavailable] };

  try {
    const data = await invoke({ ...topic, mode: 'quiz' });
    const quiz = parseQuiz(data.reply ?? '', topic.topicName);

    // A quiz that parsed half-way would mark a student against answers that were
    // never established, so a malformed one is refused outright.
    if (quiz === null) {
      return {
        ok: false,
        message: 'The assistant could not put together a fair set of questions.',
      };
    }
    return { ok: true, quiz };
  } catch (error) {
    return { ok: false, message: describeFailure(error) };
  }
}

/** Maps a transport failure to something a student can act on. */
function describeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/network|fetch|offline/i.test(message)) {
    // PRD §14 makes AI online-only, so this is the expected offline case.
    return 'PrepPilot needs an internet connection to answer this.';
  }
  if (/rate|429|quota/i.test(message)) {
    return 'The assistant is busy right now. Try again in a moment.';
  }
  if (/401|403|unauthor/i.test(message)) {
    // The proxy refuses a request with no account behind it.
    return 'Sign in again to ask the assistant a question.';
  }

  return 'The assistant could not answer that. Try again.';
}
