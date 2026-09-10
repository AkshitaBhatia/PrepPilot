import { getEnv, isDemoMode } from '../../../config/env';
import { getSupabase } from '../../../lib/supabase';
import {
  EDGE_FUNCTION,
  UNAVAILABLE_COPY,
  ask,
  isConfigured,
  quizTopic,
  summariseTopic,
  unavailableReason,
} from '../ai-client';

jest.mock('../../../config/env');
jest.mock('../../../lib/supabase');

const mockedEnv = getEnv as jest.MockedFunction<typeof getEnv>;
const mockedDemoMode = isDemoMode as jest.MockedFunction<typeof isDemoMode>;
const mockedSupabase = getSupabase as jest.MockedFunction<typeof getSupabase>;
const invoke = jest.fn();

const configured = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon',
  googleWebClientId: null,
  enablePhoneOtp: false,
  demoMode: false,
  allowAnonymousAi: false,
  aiProxyUrl: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedEnv.mockReturnValue(configured);
  mockedDemoMode.mockReturnValue(false);
  mockedSupabase.mockReturnValue({ functions: { invoke } } as never);
});

describe('isConfigured', () => {
  it('is true when a Supabase project exists', () => {
    expect(isConfigured()).toBe(true);
  });

  it('is false in demo mode, where the URL is blank', () => {
    mockedEnv.mockReturnValue({ ...configured, supabaseUrl: '', supabaseAnonKey: '' });

    expect(isConfigured()).toBe(false);
  });

  /** Missing configuration is exactly the case this reports, not a crash. */
  it('is false when configuration throws', () => {
    mockedEnv.mockImplementation(() => {
      throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL');
    });

    expect(isConfigured()).toBe(false);
  });
});

describe('ask', () => {
  const question = { question: 'Explain polynomials', subjectNames: ['Mathematics'] };

  it('routes through the Edge Function, never Gemini directly', async () => {
    invoke.mockResolvedValue({ data: { reply: 'A polynomial is…' }, error: null });

    await ask(question);

    expect(invoke).toHaveBeenCalledWith(EDGE_FUNCTION, {
      body: { question: 'Explain polynomials', subjectNames: ['Mathematics'], mode: 'ask' },
    });
  });

  it('parses the reply', async () => {
    invoke.mockResolvedValue({ data: { reply: 'A polynomial is an expression.' }, error: null });

    const result = await ask(question);

    expect(result).toMatchObject({
      ok: true,
      reply: { message: 'A polynomial is an expression.', proposal: null },
    });
  });

  it('parses an attached proposal', async () => {
    const reply =
      'Here is a plan.\n\n```preppilot-proposal\n{"kind":"addChapters","subjectName":"Mathematics","chapters":[{"name":"Light","topics":["Reflection"]}]}\n```';
    invoke.mockResolvedValue({ data: { reply }, error: null });

    const result = await ask(question);

    expect(result.ok && result.reply.proposal?.subjectName).toBe('Mathematics');
  });

  it('refuses to ask when nothing is configured', async () => {
    mockedEnv.mockReturnValue({ ...configured, supabaseUrl: '' });

    const result = await ask(question);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/needs a server to hold the Gemini key/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('treats an empty reply as a failure', async () => {
    invoke.mockResolvedValue({ data: { reply: '   ' }, error: null });

    expect(await ask(question)).toEqual({
      ok: false,
      message: 'The assistant did not reply. Try asking again.',
    });
  });

  describe('failures never leak server detail', () => {
    it('recognises being offline', async () => {
      invoke.mockResolvedValue({ data: null, error: new Error('Network request failed') });

      expect(await ask(question)).toEqual({
        ok: false,
        message: 'PrepPilot needs an internet connection to answer this.',
      });
    });

    it('recognises rate limiting', async () => {
      invoke.mockResolvedValue({ data: null, error: new Error('429 quota exceeded') });

      expect(await ask(question)).toMatchObject({
        message: 'The assistant is busy right now. Try again in a moment.',
      });
    });

    /** An upstream body can carry key or quota detail; it must not be forwarded. */
    it('replaces an unrecognised error rather than passing it through', async () => {
      invoke.mockResolvedValue({
        data: null,
        error: new Error('GEMINI_API_KEY=sk-live-abc123 is invalid'),
      });

      const result = await ask(question);

      expect(result).toEqual({
        ok: false,
        message: 'The assistant could not answer that. Try again.',
      });
      expect(JSON.stringify(result)).not.toContain('sk-live');
    });

    it('handles a thrown error as well as a returned one', async () => {
      invoke.mockRejectedValue(new Error('boom'));

      expect(await ask(question)).toMatchObject({ ok: false });
    });
  });
});

/**
 * The proxy spends the project owner's Gemini quota, so it answers only a
 * request carrying a real account's token. Anything without one must be refused
 * here, before a student types a question that was never going to be answered.
 */
describe('when there is no account to bill a reply to', () => {
  it('reports the demo as unavailable rather than trying', async () => {
    // Real demo mode blanks the credentials, which is why the demo check has to
    // come before the credential check: the other order reported a demo as
    // "not set up yet", which reads as broken rather than switched off.
    mockedDemoMode.mockReturnValue(true);
    mockedEnv.mockReturnValue({
      ...configured,
      supabaseUrl: '',
      supabaseAnonKey: '',
      demoMode: true,
    });

    expect(unavailableReason()).toBe('demo');
    expect(isConfigured()).toBe(false);

    const result = await ask({ question: 'What is a polynomial?', subjectNames: [] });

    expect(result.ok).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('says the demo has it switched off, not that something broke', async () => {
    mockedDemoMode.mockReturnValue(true);
    mockedEnv.mockReturnValue({
      ...configured,
      supabaseUrl: '',
      supabaseAnonKey: '',
      demoMode: true,
    });

    const result = await ask({ question: 'Hello', subjectNames: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/off in this demo/);
  });

  it('distinguishes an unconfigured project from a demo', () => {
    mockedEnv.mockReturnValue({ ...configured, supabaseUrl: '' });

    expect(unavailableReason()).toBe('unconfigured');
  });

  it('turns the proxy refusing an unauthenticated call into a sign-in prompt', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('Edge Function returned 401') });

    const result = await ask({ question: 'Hello', subjectNames: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/[Ss]ign in again/);
  });
});

/**
 * A summary and a quiz are built from the topic's name and its place in the
 * syllabus, because a template stores names and nothing else — there is no
 * stored prose to condense.
 */
describe('summarising a topic', () => {
  const topic = { topicName: "Ohm's law", chapterName: 'Electricity', subjectName: 'Physics' };

  it('sends the topic and its place, and returns the prose', async () => {
    invoke.mockResolvedValue({ data: { reply: 'V = IR, for ohmic conductors.' }, error: null });

    const result = await summariseTopic(topic);

    expect(result).toEqual({ ok: true, summary: 'V = IR, for ohmic conductors.' });
    expect(invoke).toHaveBeenCalledWith(EDGE_FUNCTION, {
      body: { ...topic, mode: 'summarize' },
    });
  });

  it('strips a fence the model wrapped it in', async () => {
    invoke.mockResolvedValue({ data: { reply: '```\nA summary.\n```' }, error: null });

    const result = await summariseTopic(topic);

    if (result.ok) expect(result.summary).toBe('A summary.');
    else throw new Error('expected a summary');
  });

  it('reports an empty reply rather than showing a blank card', async () => {
    invoke.mockResolvedValue({ data: { reply: '   ' }, error: null });

    const result = await summariseTopic(topic);

    expect(result.ok).toBe(false);
  });

  it('does not try when the assistant is unavailable', async () => {
    mockedDemoMode.mockReturnValue(true);

    const result = await summariseTopic(topic);

    expect(result.ok).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('quizzing a topic', () => {
  const topic = { topicName: "Ohm's law" };
  const quizJson = JSON.stringify({
    questions: [0, 1, 2].map((answerIndex, n) => ({
      question: `Q${n}?`,
      options: ['A', 'B', 'C', 'D'],
      answerIndex,
      explanation: 'Because.',
    })),
  });

  it('returns three questions', async () => {
    invoke.mockResolvedValue({ data: { reply: quizJson }, error: null });

    const result = await quizTopic(topic);

    if (!result.ok) throw new Error('expected a quiz');
    expect(result.quiz.questions).toHaveLength(3);
    expect(result.quiz.topicName).toBe("Ohm's law");
  });

  /**
   * A quiz that parsed half-way would mark a student against answers that were
   * never established, so a malformed one is refused outright.
   */
  it('refuses a malformed quiz rather than showing part of one', async () => {
    invoke.mockResolvedValue({
      data: { reply: JSON.stringify({ questions: [{ question: 'Only one' }] }) },
      error: null,
    });

    const result = await quizTopic(topic);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/fair set of questions/);
  });

  it('turns a transport failure into something a student can act on', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('Network request failed') });

    const result = await quizTopic(topic);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/internet connection/);
  });
});

/**
 * With no account there is no session, and creating the Supabase client
 * constructs an auth layer that reads expo-secure-store — a module with no web
 * implementation. A plain request avoids all of it (D54).
 */
describe('asking without an account', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    mockedDemoMode.mockReturnValue(true);
    mockedEnv.mockReturnValue({
      ...configured,
      demoMode: true,
      allowAnonymousAi: true,
      aiProxyUrl: null,
    });
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: 'Answered anonymously.' }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('posts straight to the function instead of building a client', async () => {
    const result = await ask({ question: 'Explain entropy', subjectNames: [] });

    expect(result.ok).toBe(true);
    expect(invoke).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${configured.supabaseUrl}/functions/v1/${EDGE_FUNCTION}`,
    );
  });

  it('sends the publishable key, which is what the function checks', async () => {
    await ask({ question: 'Explain entropy', subjectNames: [] });

    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.apikey).toBe(configured.supabaseAnonKey);
  });

  it('reports a refusal from the function', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });

    const result = await ask({ question: 'Explain entropy', subjectNames: [] });

    expect(result.ok).toBe(false);
  });

  it('stays unavailable when anonymous asking is switched off', async () => {
    mockedEnv.mockReturnValue({
      ...configured,
      demoMode: true,
      allowAnonymousAi: false,
      aiProxyUrl: null,
    });

    expect(unavailableReason()).toBe('demo');
  });
});

describe('study aids when the assistant is unavailable', () => {
  it('does not try to quiz', async () => {
    mockedDemoMode.mockReturnValue(true);
    mockedEnv.mockReturnValue({
      ...configured,
      supabaseUrl: '',
      supabaseAnonKey: '',
      demoMode: true,
    });

    const result = await quizTopic({ topicName: 'Anything' });

    expect(result.ok).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('survives the summary call throwing outright', async () => {
    invoke.mockRejectedValue(new Error('boom'));

    await expect(summariseTopic({ topicName: 'Anything' })).resolves.toMatchObject({ ok: false });
  });

  it('survives the quiz call throwing outright', async () => {
    invoke.mockRejectedValue(new Error('boom'));

    await expect(quizTopic({ topicName: 'Anything' })).resolves.toMatchObject({ ok: false });
  });
});

/**
 * A local proxy holds the key itself, so the assistant works with no Supabase
 * project at all — including in a demo, which has no credentials to send.
 */
describe('with a local AI proxy', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    mockedDemoMode.mockReturnValue(true);
    mockedEnv.mockReturnValue({
      ...configured,
      supabaseUrl: '',
      supabaseAnonKey: '',
      demoMode: true,
      aiProxyUrl: 'http://127.0.0.1:8787',
    });
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: 'Answered locally.' }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('is available even with no Supabase credentials', () => {
    expect(unavailableReason()).toBeNull();
  });

  it('posts to the proxy rather than to Supabase', async () => {
    await ask({ question: 'Explain entropy', subjectNames: [] });

    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8787');
  });

  it('sends no Supabase key, because the proxy does not want one', async () => {
    await ask({ question: 'Explain entropy', subjectNames: [] });

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.apikey).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
  });
});

/**
 * The assistant costs money to answer and there is nobody to attribute a
 * guest's call to. Saying so before the request is kinder than a failure after
 * the student has typed a question out.
 */
describe('the assistant and a guest', () => {
  it('is unavailable without an account', () => {
    expect(unavailableReason({ isGuest: true })).toBe('guest');
  });

  it('says so in a way that offers the way in', () => {
    expect(UNAVAILABLE_COPY.guest).toMatch(/Sign in/);
  });

  /** They keep everything; that is the point of saying it here. */
  it('promises their work comes with them', () => {
    expect(UNAVAILABLE_COPY.guest).toMatch(/comes with you/);
  });

  it('is reported ahead of any configuration problem', () => {
    // A guest told "no server is configured" would go looking for a fault that
    // is not there.
    expect(unavailableReason({ isGuest: true })).toBe('guest');
  });

  it('reports nothing unusual for a signed-in student', () => {
    expect(unavailableReason({ isGuest: false })).toBe(unavailableReason());
  });

  it('treats an absent context as signed in', () => {
    expect(isConfigured({ isGuest: false })).toBe(isConfigured());
  });
});
