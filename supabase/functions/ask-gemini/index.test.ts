import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { extractReply, handler } from './index.ts';

/** A token shaped like Supabase's: only the payload's `sub` is read. */
function bearer(sub: string): string {
  const payload = btoa(JSON.stringify({ sub }))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
  return `Bearer header.${payload}.signature`;
}

function ask(
  body: unknown,
  options: { authorization?: string; method?: string } = {},
): Promise<Response> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const authorization = options.authorization ?? bearer('user-1');
  if (authorization !== '') headers.set('Authorization', authorization);

  return handler(
    new Request('https://example.test/ask-gemini', {
      method: options.method ?? 'POST',
      headers,
      // GET and HEAD may not carry one at all.
      body: options.method === undefined || options.method === 'POST' ? JSON.stringify(body) : null,
    }),
  );
}

/** Replaces global fetch for one call, restoring it afterwards. */
async function withGemini<T>(
  respond: (request: Request) => Response | Promise<Response>,
  run: (calls: Request[]) => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  const calls: Request[] = [];
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push(request);
    return Promise.resolve(respond(request));
  }) as typeof fetch;

  try {
    return await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

function geminiReply(text: string): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const KEY = 'GEMINI_API_KEY';

function withKey(value: string | null, run: () => Promise<void>): Promise<void> {
  const previous = Deno.env.get(KEY);
  if (value === null) Deno.env.delete(KEY);
  else Deno.env.set(KEY, value);

  return run().finally(() => {
    if (previous === undefined) Deno.env.delete(KEY);
    else Deno.env.set(KEY, previous);
  });
}

Deno.test('answers a question and returns only the reply', async () => {
  await withKey('test-key', async () => {
    await withGemini(
      () => geminiReply('Ohm’s law relates voltage, current and resistance.'),
      async (calls) => {
        const response = await ask({ question: 'What is Ohm’s law?', subjectNames: ['Physics'] });

        assertEquals(response.status, 200);
        assertEquals(await response.json(), {
          reply: 'Ohm’s law relates voltage, current and resistance.',
        });

        // The student's actual syllabus reaches the model, so it can refer to it.
        const sent = JSON.parse(await calls[0].text());
        assertStringIncludes(sent.systemInstruction.parts[0].text, 'Physics');
      },
    );
  });
});

Deno.test('never puts the key in a response', async () => {
  await withKey('super-secret-key', async () => {
    await withGemini(
      () =>
        // A Gemini error body can name the key or the quota; none of it may be forwarded.
        new Response(JSON.stringify({ error: { message: 'API key super-secret-key invalid' } }), {
          status: 400,
        }),
      async () => {
        const response = await ask({ question: 'Hello' });
        const text = await response.text();

        assertEquals(response.status, 502);
        assertEquals(text.includes('super-secret-key'), false);
        assertEquals(text.includes('invalid'), false);
      },
    );
  });
});

Deno.test('caps how much the model may think', async () => {
  await withKey('test-key', async () => {
    await withGemini(
      () => geminiReply('Brief.'),
      async (calls) => {
        await ask({ question: 'Explain photosynthesis' });

        const sent = JSON.parse(await calls[0].text());
        assertEquals(sent.generationConfig.thinkingConfig.thinkingBudget, 512);
      },
    );
  });
});

Deno.test('reports an unconfigured deployment without saying what is missing', async () => {
  await withKey(null, async () => {
    const response = await ask({ question: 'Hello' });

    assertEquals(response.status, 503);
    const { error } = await response.json();
    assertEquals(error, 'The assistant is not configured.');
  });
});

Deno.test('refuses a caller with no token rather than sharing one budget', async () => {
  // Falling back to a single anonymous bucket would make twenty questions an
  // hour a global limit, so the first busy student locks out everyone else.
  await withKey('test-key', async () => {
    await withGemini(
      () => geminiReply('Never reached.'),
      async (calls) => {
        const response = await ask({ question: 'Hello' }, { authorization: '' });

        assertEquals(response.status, 401);
        assertEquals(calls.length, 0);
      },
    );
  });
});

Deno.test('rate limits per account, not across all of them', async () => {
  await withKey('test-key', async () => {
    await withGemini(
      () => geminiReply('Fine.'),
      async () => {
        const first = bearer(`busy-${crypto.randomUUID()}`);
        const second = bearer(`quiet-${crypto.randomUUID()}`);

        for (let i = 0; i < 20; i += 1) {
          assertEquals((await ask({ question: 'Q' }, { authorization: first })).status, 200);
        }
        assertEquals((await ask({ question: 'Q' }, { authorization: first })).status, 429);

        // A different student is unaffected by their neighbour's use.
        assertEquals((await ask({ question: 'Q' }, { authorization: second })).status, 200);
      },
    );
  });
});

Deno.test('rejects an empty or oversized question before spending quota', async () => {
  await withKey('test-key', async () => {
    await withGemini(
      () => geminiReply('Never reached.'),
      async (calls) => {
        assertEquals((await ask({ question: '   ' })).status, 400);
        assertEquals((await ask({ question: 'x'.repeat(2001) })).status, 400);
        assertEquals(calls.length, 0);
      },
    );
  });
});

Deno.test('answers the browser preflight, without which the web build cannot call it', async () => {
  const response = await ask(null, { method: 'OPTIONS' });

  assertEquals(response.status, 204);
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), '*');
  assertStringIncludes(response.headers.get('Access-Control-Allow-Headers') ?? '', 'authorization');
});

Deno.test('refuses anything but POST', async () => {
  assertEquals((await ask(null, { method: 'GET' })).status, 405);
});

Deno.test('extractReply skips the model’s own reasoning', () => {
  // Taking parts[0] blindly would show a student the working, not the answer.
  const payload = {
    candidates: [
      {
        content: {
          parts: [
            { text: 'Let me consider the definition...', thought: true },
            { text: 'Voltage equals current times resistance.' },
          ],
        },
      },
    ],
  };

  assertEquals(extractReply(payload), 'Voltage equals current times resistance.');
});

Deno.test('extractReply joins a reply split across parts', () => {
  const payload = {
    candidates: [{ content: { parts: [{ text: 'Voltage equals ' }, { text: 'IR.' }] } }],
  };

  assertEquals(extractReply(payload), 'Voltage equals IR.');
});

Deno.test('extractReply survives a shape it does not recognise', () => {
  assertEquals(extractReply(null), '');
  assertEquals(extractReply({}), '');
  assertEquals(extractReply({ candidates: [] }), '');
  assertEquals(extractReply({ candidates: [{ content: {} }] }), '');
});

/**
 * Summaries and quizzes are built from the topic's name and its place in the
 * syllabus, because a template holds nothing else — `TemplateTopic` is a name.
 */
Deno.test('summarize asks about the topic, not the student’s whole syllabus', async () => {
  await withKey('test-key', async () => {
    await withGemini(
      () => geminiReply('A short summary.'),
      async (calls) => {
        const response = await ask({
          mode: 'summarize',
          topicName: "Ohm's law",
          chapterName: 'Electricity',
          subjectName: 'Physics',
        });

        assertEquals(response.status, 200);
        const sent = JSON.parse(await calls[0].text());
        const prompt = sent.contents[0].parts[0].text;
        assertStringIncludes(prompt, "Ohm's law");
        assertStringIncludes(prompt, 'Physics → Electricity');
      },
    );
  });
});

Deno.test('a study aid is never told it may propose tracker changes', async () => {
  // A model told it may propose will sometimes do so mid-summary.
  await withKey('test-key', async () => {
    await withGemini(
      () => geminiReply('A short summary.'),
      async (calls) => {
        await ask({ mode: 'summarize', topicName: 'Entropy' });

        const sent = JSON.parse(await calls[0].text());
        const instruction = sent.systemInstruction.parts[0].text;
        assertEquals(instruction.includes('preppilot-proposal'), false);
      },
    );
  });
});

Deno.test('chat still carries the proposal grammar', async () => {
  await withKey('test-key', async () => {
    await withGemini(
      () => geminiReply('Sure.'),
      async (calls) => {
        await ask({ question: 'What should I add?' });

        const sent = JSON.parse(await calls[0].text());
        assertStringIncludes(sent.systemInstruction.parts[0].text, 'preppilot-proposal');
      },
    );
  });
});

Deno.test('quiz asks for exactly three questions in a fixed shape', async () => {
  await withKey('test-key', async () => {
    await withGemini(
      () => geminiReply('{"questions":[]}'),
      async (calls) => {
        await ask({ mode: 'quiz', topicName: "Ohm's law" });

        const prompt = JSON.parse(await calls[0].text()).contents[0].parts[0].text;
        assertStringIncludes(prompt, 'exactly 3 multiple-choice questions');
        assertStringIncludes(prompt, 'answerIndex');
      },
    );
  });
});

Deno.test('a study aid with no topic is refused before spending quota', async () => {
  await withKey('test-key', async () => {
    await withGemini(
      () => geminiReply('never reached'),
      async (calls) => {
        assertEquals((await ask({ mode: 'summarize', topicName: '   ' })).status, 400);
        assertEquals((await ask({ mode: 'quiz' })).status, 400);
        assertEquals(calls.length, 0);
      },
    );
  });
});

Deno.test('an unknown mode falls back to a plain question', async () => {
  await withKey('test-key', async () => {
    await withGemini(
      () => geminiReply('Answered.'),
      async () => {
        const response = await ask({ mode: 'nonsense', question: 'Explain entropy' });

        assertEquals(response.status, 200);
      },
    );
  });
});

/**
 * Anonymous access exists so the browser demo can answer without an account. The
 * function's URL is public wherever the client runs, so it is off unless
 * explicitly enabled and capped as one shared budget rather than per account.
 */
Deno.test('anonymous callers are refused unless explicitly allowed', async () => {
  await withKey('test-key', async () => {
    await withGemini(
      () => geminiReply('never reached'),
      async (calls) => {
        const response = await ask({ question: 'Hello' }, { authorization: '' });

        assertEquals(response.status, 401);
        assertEquals(calls.length, 0);
      },
    );
  });
});

Deno.test('anonymous callers are answered once switched on', async () => {
  const previous = Deno.env.get('ALLOW_ANONYMOUS_AI');
  Deno.env.set('ALLOW_ANONYMOUS_AI', 'true');

  try {
    await withKey('test-key', async () => {
      await withGemini(
        () => geminiReply('Answered anonymously.'),
        async () => {
          const response = await ask({ question: 'Hello' }, { authorization: '' });

          assertEquals(response.status, 200);
        },
      );
    });
  } finally {
    if (previous === undefined) Deno.env.delete('ALLOW_ANONYMOUS_AI');
    else Deno.env.set('ALLOW_ANONYMOUS_AI', previous);
  }
});

Deno.test('every anonymous caller shares one budget', async () => {
  // There is no account to key a limit on, so the ceiling is global — otherwise
  // anyone who finds the URL could spend the owner's quota without bound.
  const previous = Deno.env.get('ALLOW_ANONYMOUS_AI');
  Deno.env.set('ALLOW_ANONYMOUS_AI', 'true');

  try {
    await withKey('test-key', async () => {
      await withGemini(
        () => geminiReply('Fine.'),
        async () => {
          let refused = false;
          for (let i = 0; i < 61; i += 1) {
            const response = await ask({ question: 'Q' }, { authorization: '' });
            if (response.status === 429) {
              refused = true;
              break;
            }
          }
          assertEquals(refused, true);
        },
      );
    });
  } finally {
    if (previous === undefined) Deno.env.delete('ALLOW_ANONYMOUS_AI');
    else Deno.env.set('ALLOW_ANONYMOUS_AI', previous);
  }
});
