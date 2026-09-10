/**
 * The AI proxy.
 *
 * PRD §15 requires the Gemini key be server-side only. This function is the only
 * place it exists: the app calls here, this calls Gemini. The key is read from a
 * Supabase secret and never returned to the client.
 *
 * Deploy with:
 *   supabase secrets set GEMINI_API_KEY=...
 *   supabase functions deploy ask-gemini
 *
 * Deploy it *with* JWT verification — the default. See `callerId` below: the
 * per-account rate limit is only meaningful because the platform has already
 * rejected anything without a valid token.
 *
 * Until it is deployed the app disables the assistant rather than sending
 * questions into nothing.
 */

// Supabase Edge Functions run on Deno; these globals are provided by that runtime.
declare const Deno: {
  env: { get: (key: string) => string | undefined };
  serve: (
    options: { hostname?: string; port?: number },
    handler: (request: Request) => Promise<Response>,
  ) => unknown;
};

/**
 * Pinned deliberately rather than tracking `gemini-flash-latest`.
 *
 * An alias that moves under a deployed function changes its answers, its cost
 * and its latency without anything in this repository changing. Google retires
 * models — `gemini-2.5-flash`, pinned here previously, now refuses new callers
 * outright — so this needs revisiting, but as an edit someone reviews.
 */
const MODEL = 'gemini-3.6-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/**
 * A cap on reasoning, not a ban.
 *
 * The model thinks before answering, and left uncapped it spent roughly nine
 * times as many tokens thinking as answering on a two-sentence question about
 * Ohm's law. The project owner pays for those tokens and the student waits for
 * them. This leaves room to reason about a genuinely hard question while
 * refusing to deliberate over a simple one.
 */
const THINKING_BUDGET = 512;

/**
 * Per-account request budget.
 *
 * The proxy spends the project owner's Gemini quota, so an unlimited endpoint is
 * a financial liability as much as a security one (D29). This is a coarse
 * in-memory limit — it resets when the instance recycles and is not shared
 * between instances — so it bounds runaway use rather than enforcing a quota. A
 * durable limit belongs in the database when usage justifies it.
 */
const RATE_LIMIT = { requests: 20, windowMs: 60 * 60 * 1000 };
const recentRequests = new Map<string, number[]>();

/**
 * A ceiling across every anonymous caller together.
 *
 * Anonymous access exists so the browser demo can answer without an account
 * (D54). It is off unless `ALLOW_ANONYMOUS_AI` is exactly "true", because the
 * function's URL is public wherever the client runs — "the demo is on localhost"
 * protects the page, not this endpoint. Anyone who finds the URL can call it, so
 * the per-account limit is replaced by one shared budget rather than dropped.
 */
const ANONYMOUS_LIMIT = { requests: 60, windowMs: 60 * 60 * 1000 };
const ANONYMOUS_ID = 'anonymous';

/**
 * True while this file is being run as a local proxy rather than deployed.
 *
 * The local server binds to loopback, so nothing off this machine can reach it
 * and there is no account to attribute a request to anyway. Deployed, the flag
 * stays false and anonymous access remains something that must be switched on
 * deliberately.
 */
let servingLocally = false;

function anonymousAllowed(): boolean {
  return servingLocally || Deno.env.get('ALLOW_ANONYMOUS_AI') === 'true';
}

function withinRateLimit(userId: string, now: number): boolean {
  const limit = userId === ANONYMOUS_ID ? ANONYMOUS_LIMIT : RATE_LIMIT;
  const cutoff = now - limit.windowMs;
  const recent = (recentRequests.get(userId) ?? []).filter((at) => at > cutoff);

  if (recent.length >= limit.requests) return false;

  recent.push(now);
  recentRequests.set(userId, recent);
  return true;
}

/**
 * The account a request belongs to, taken from the bearer token's `sub` claim.
 *
 * Read from the token rather than a header: a header is whatever the caller
 * types, so a limit keyed on one is bypassed by changing it — and a single
 * fallback value would put every student in the world into one shared bucket,
 * where twenty questions an hour is a global limit rather than a personal one.
 *
 * The claim is trusted because Supabase verifies the JWT before this function
 * runs. Deploying with `--no-verify-jwt` removes that guarantee and, with it,
 * the meaning of the limit.
 */
function callerId(request: Request): string | null {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  const payload = token.split('.')[1];
  if (payload === undefined || payload.length === 0) return null;

  try {
    // base64url, and atob wants padded base64.
    const normalised = payload.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalised.padEnd(normalised.length + ((4 - (normalised.length % 4)) % 4), '=');
    const claims = JSON.parse(atob(padded)) as { sub?: unknown };
    return typeof claims.sub === 'string' && claims.sub.length > 0 ? claims.sub : null;
  } catch {
    return null;
  }
}

/**
 * The system instruction.
 *
 * PRD §14 forbids the assistant changing the tracker on its own. The client
 * enforces that structurally — a reply can only ever *propose*, and the proposal
 * grammar has no verb for deleting or completing — but stating it here too means
 * the model is not fighting the format.
 */
const SYSTEM_INSTRUCTION = `You are PrepPilot's study assistant. Help students understand topics they are studying.

Rules:
- Answer clearly and briefly. Students are revising, not reading an essay.
- Never claim to have changed anything in their tracker. You cannot.
- If you want to suggest additions to their syllabus, end your reply with a fenced block:

\`\`\`preppilot-proposal
{"kind":"addChapters","subjectName":"<an existing subject>","chapters":[{"name":"...","topics":["..."]}]}
\`\`\`

- Only ever propose adding chapters or topics. You cannot delete, complete, or reorder anything.
- Keep a proposal small enough to read: at most a handful of chapters.`;

/** The longest question a student may type. Generated prompts are not bound by this. */
const MAX_QUESTION_LENGTH = 2000;

/** What the caller is asking for. */
const MODES = ['ask', 'summarize', 'quiz'] as const;
type Mode = (typeof MODES)[number];

/**
 * For summaries and quizzes.
 *
 * Deliberately silent about proposals: neither of these adds anything to a
 * tracker, and a model told it may propose will sometimes do so mid-summary.
 */
const STUDY_AID_INSTRUCTION = `You are PrepPilot's study assistant, helping a student revise a single topic.

Rules:
- Follow the requested format exactly. Nothing before it, nothing after it.
- Be accurate. Where a topic name is ambiguous, say so rather than inventing detail.
- Never claim to have changed anything in the student's tracker. You cannot.`;

interface RequestBody {
  readonly question?: unknown;
  readonly subjectNames?: unknown;
  readonly mode?: unknown;
  /** For summarize and quiz: where the topic sits in the syllabus. */
  readonly topicName?: unknown;
  readonly chapterName?: unknown;
  readonly subjectName?: unknown;
}

/**
 * Summaries and quizzes are built from the topic's *name* and its place in the
 * syllabus, because that is all a template holds — `TemplateTopic` is a name and
 * nothing else. There is no stored prose to summarise, so the model is told to
 * work from the syllabus position and to say when a name is too vague to work
 * from, rather than inventing content for it.
 */
function studyPrompt(mode: Mode, body: RequestBody): string {
  const topic = typeof body.topicName === 'string' ? body.topicName.trim() : '';
  const chapter = typeof body.chapterName === 'string' ? body.chapterName.trim() : '';
  const subject = typeof body.subjectName === 'string' ? body.subjectName.trim() : '';

  const place = [subject, chapter].filter((part) => part.length > 0).join(' → ');
  const context = place.length > 0 ? `It sits under ${place}.` : '';

  if (mode === 'summarize') {
    return `Summarise the study topic "${topic}" for a student revising it. ${context}

Rules:
- Six sentences at most. A student is revising, not reading a chapter.
- Cover what it is, why it matters, and the one thing most often got wrong.
- Plain prose. No headings, no bullet list, no markdown fence.
- If the name is too vague to summarise honestly, say so in one sentence instead of guessing.`;
  }

  return `Write exactly 3 multiple-choice questions checking whether a student understands "${topic}". ${context}

Reply with JSON and nothing else, in this shape:
{"questions":[{"question":"...","options":["...","...","...","..."],"answerIndexes":[0],"explanation":"..."}]}

Rules:
- Exactly 3 questions, each with exactly 4 options. Never 3, never 5.
- answerIndexes lists every correct option by position, counting from 0.
- Most questions have one correct answer. Where more than one is correct, list
  them all and begin the question text with "Select all that apply." — a student
  must never have to guess that several answers are wanted.
- Never mark all four options correct; at least one must be wrong.
- No two options within a question may be the same.
- Test understanding, not recall of wording.
- explanation says why those options are correct, in one sentence.`;
}

/**
 * The web build runs in a browser and calls this cross-origin, so without these
 * the request never arrives — the browser refuses it before it is sent.
 */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/**
 * The answer text, ignoring any part the model marks as its own reasoning.
 *
 * A thinking model can return several parts, and the first is not necessarily
 * the answer. Taking `parts[0]` blindly risks showing a student the model's
 * working in place of its reply.
 */
export function extractReply(payload: unknown): string {
  const candidate = (payload as { candidates?: unknown[] } | null)?.candidates?.[0];
  const parts = (candidate as { content?: { parts?: unknown[] } } | undefined)?.content?.parts;
  if (!Array.isArray(parts)) return '';

  return parts
    .filter((part): part is { text: string } => {
      const typed = part as { text?: unknown; thought?: unknown };
      return typeof typed.text === 'string' && typed.thought !== true;
    })
    .map((part) => part.text)
    .join('')
    .trim();
}

export async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (apiKey === undefined || apiKey.length === 0) {
    // Never echo configuration detail back to a client.
    return jsonResponse({ error: 'The assistant is not configured.' }, 503);
  }

  const userId = callerId(request) ?? (anonymousAllowed() ? ANONYMOUS_ID : null);
  if (userId === null) {
    return jsonResponse({ error: 'Sign in to ask a question.' }, 401);
  }
  if (!withinRateLimit(userId, Date.now())) {
    return jsonResponse({ error: 'Too many questions right now. Try again later.' }, 429);
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: 'Invalid request.' }, 400);
  }

  const mode: Mode = MODES.includes(body.mode as Mode) ? (body.mode as Mode) : 'ask';

  if (mode !== 'ask') {
    const topic = typeof body.topicName === 'string' ? body.topicName.trim() : '';
    if (topic.length === 0 || topic.length > 200) {
      return jsonResponse({ error: 'That topic could not be read.' }, 400);
    }
  }

  if (mode === 'ask') {
    // The cap bounds what a student types. It is checked before the prompt is
    // built so that raising the room a generated prompt needs cannot quietly
    // raise the room a person has.
    const typed = typeof body.question === 'string' ? body.question.trim() : '';
    if (typed.length === 0 || typed.length > MAX_QUESTION_LENGTH) {
      return jsonResponse({ error: 'Ask a shorter question.' }, 400);
    }
  }

  const question = mode === 'ask' ? (body.question as string).trim() : studyPrompt(mode, body);

  const subjectNames = Array.isArray(body.subjectNames)
    ? body.subjectNames.filter((name): name is string => typeof name === 'string').slice(0, 50)
    : [];

  const context =
    subjectNames.length > 0
      ? `The student is studying: ${subjectNames.join(', ')}.`
      : 'The student has not added any subjects yet.';

  try {
    const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Chat is told about the proposal grammar because it may offer to add
        // to the tracker. A summary or a quiz never does, and giving those the
        // same instruction invites a stray proposal block in the middle of them.
        systemInstruction: {
          parts: [
            {
              text:
                mode === 'ask'
                  ? `${SYSTEM_INSTRUCTION}\n\n${context}`
                  : `${STUDY_AID_INSTRUCTION}\n\n${context}`,
            },
          ],
        },
        contents: [{ role: 'user', parts: [{ text: question }] }],
        generationConfig: { thinkingConfig: { thinkingBudget: THINKING_BUDGET } },
      }),
    });

    if (!response.ok) {
      // The upstream body can contain key or quota detail; do not forward it.
      return jsonResponse({ error: 'The assistant could not answer that.' }, 502);
    }

    const reply = extractReply(await response.json());

    if (reply.length === 0) {
      return jsonResponse({ error: 'The assistant did not reply.' }, 502);
    }

    return jsonResponse({ reply }, 200);
  } catch {
    return jsonResponse({ error: 'The assistant could not be reached.' }, 502);
  }
}

/**
 * Run directly, this becomes a local AI proxy.
 *
 * The Gemini key must never reach a device (PRD §15), so something server-side
 * has to hold it — normally the deployed Edge Function. Running the very same
 * file here gives the app a server to talk to before any Supabase project
 * exists, with no second implementation to drift out of step (D56).
 *
 * Bound to loopback deliberately: only this machine can reach it.
 */
if (import.meta.main) {
  servingLocally = true;
  const port = Number(Deno.env.get('AI_PROXY_PORT') ?? '8787');

  Deno.serve({ hostname: '127.0.0.1', port }, handler);
}
