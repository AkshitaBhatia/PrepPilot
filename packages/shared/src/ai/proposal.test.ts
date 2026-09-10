import { describe, expect, it } from 'vitest';
import { MAX_NAME_LENGTH } from '../domain/types';
import {
  MAX_REVIEWABLE_TOPICS,
  isReviewable,
  parseReply,
  summariseProposal,
  type AiProposal,
} from './proposal';

const block = (json: string) => `Here is a plan.\n\n\`\`\`preppilot-proposal\n${json}\n\`\`\``;

const valid = JSON.stringify({
  kind: 'addChapters',
  subjectName: 'Mathematics',
  chapters: [
    { name: 'Number Systems', topics: ['Decimal', 'Real Number'] },
    { name: 'Polynomials', topics: ['Degree'] },
  ],
});

describe('parseReply', () => {
  it('returns prose alone when there is no proposal', () => {
    expect(parseReply('A polynomial is an expression.')).toEqual({
      message: 'A polynomial is an expression.',
      proposal: null,
    });
  });

  it('separates the prose from the proposal', () => {
    const parsed = parseReply(block(valid));

    expect(parsed.message).toBe('Here is a plan.');
    expect(parsed.proposal).toMatchObject({ kind: 'addChapters', subjectName: 'Mathematics' });
  });

  it('parses the chapters and topics', () => {
    expect(parseReply(block(valid)).proposal?.chapters).toEqual([
      { name: 'Number Systems', topics: ['Decimal', 'Real Number'] },
      { name: 'Polynomials', topics: ['Degree'] },
    ]);
  });

  it('trims whitespace from names', () => {
    const padded = JSON.stringify({
      kind: 'addTopics',
      subjectName: '  Mathematics  ',
      chapters: [{ name: '  Light  ', topics: ['  Reflection  '] }],
    });

    const proposal = parseReply(block(padded)).proposal;
    expect(proposal?.subjectName).toBe('Mathematics');
    expect(proposal?.chapters[0]).toEqual({ name: 'Light', topics: ['Reflection'] });
  });

  it('accepts a chapter with no topics', () => {
    const noTopics = JSON.stringify({
      kind: 'addChapters',
      subjectName: 'Mathematics',
      chapters: [{ name: 'Light', topics: [] }],
    });

    expect(parseReply(block(noTopics)).proposal?.chapters[0]?.topics).toEqual([]);
  });

  /**
   * A malformed block must not become a silent no-op that looks like it applied,
   * nor an error a student has to decode. It degrades to prose.
   */
  describe('rejecting malformed proposals', () => {
    it.each([
      ['invalid JSON', '{not json'],
      ['not an object', '"a string"'],
      [
        'unknown kind',
        JSON.stringify({
          kind: 'deleteEverything',
          subjectName: 'M',
          chapters: [{ name: 'c', topics: [] }],
        }),
      ],
      [
        'missing subject',
        JSON.stringify({ kind: 'addChapters', chapters: [{ name: 'c', topics: [] }] }),
      ],
      [
        'blank subject',
        JSON.stringify({
          kind: 'addChapters',
          subjectName: '  ',
          chapters: [{ name: 'c', topics: [] }],
        }),
      ],
      ['no chapters', JSON.stringify({ kind: 'addChapters', subjectName: 'M', chapters: [] })],
      [
        'chapter without a name',
        JSON.stringify({ kind: 'addChapters', subjectName: 'M', chapters: [{ topics: [] }] }),
      ],
      [
        'a non-string topic',
        JSON.stringify({
          kind: 'addChapters',
          subjectName: 'M',
          chapters: [{ name: 'c', topics: [1] }],
        }),
      ],
      [
        'a blank topic',
        JSON.stringify({
          kind: 'addChapters',
          subjectName: 'M',
          chapters: [{ name: 'c', topics: ['  '] }],
        }),
      ],
    ])('treats %s as prose only', (_label, json) => {
      const parsed = parseReply(block(json));

      expect(parsed.proposal).toBeNull();
      expect(parsed.message.length).toBeGreaterThan(0);
    });

    /**
     * The whole point of the proposal model: a reply cannot express deleting or
     * completing anything, so the assistant has no vocabulary for it (PRD §14).
     */
    it('has no way to express deleting or completing', () => {
      const destructive = JSON.stringify({
        kind: 'deleteTopics',
        subjectName: 'Mathematics',
        chapters: [{ name: 'Number Systems', topics: ['Decimal'] }],
      });

      expect(parseReply(block(destructive)).proposal).toBeNull();
    });
  });
});

describe('summariseProposal', () => {
  const proposal: AiProposal = {
    kind: 'addChapters',
    subjectName: 'Mathematics',
    chapters: [
      { name: 'A', topics: ['1', '2'] },
      { name: 'B', topics: ['3'] },
    ],
  };

  it('counts what would be added', () => {
    expect(summariseProposal(proposal)).toEqual({ chapters: 2, topics: 3 });
  });

  it('counts a proposal of empty chapters', () => {
    expect(summariseProposal({ ...proposal, chapters: [{ name: 'A', topics: [] }] })).toEqual({
      chapters: 1,
      topics: 0,
    });
  });
});

describe('isReviewable', () => {
  const withTopics = (count: number): AiProposal => ({
    kind: 'addChapters',
    subjectName: 'Mathematics',
    chapters: [{ name: 'A', topics: Array.from({ length: count }, (_, i) => `t${i}`) }],
  });

  it('accepts a proposal a student could actually read', () => {
    expect(isReviewable(withTopics(20))).toBe(true);
  });

  it('accepts one exactly at the limit', () => {
    expect(isReviewable(withTopics(MAX_REVIEWABLE_TOPICS))).toBe(true);
  });

  /** Confirming 500 topics is not review, it is a rubber stamp. */
  it('rejects one too large to review meaningfully', () => {
    expect(isReviewable(withTopics(MAX_REVIEWABLE_TOPICS + 1))).toBe(false);
  });
});

/**
 * A reply captured verbatim from gemini-3.6-flash, the model the proxy pins.
 *
 * The hand-written cases above all use compact JSON on one line. A real model
 * pretty-prints it, wraps it in prose, and uses characters like `&` inside topic
 * names — none of which the constructed cases exercise. Keeping one real sample
 * means a change to the parser is measured against what the model actually
 * sends, not against what is convenient to write.
 */
describe('a reply as the model actually sends it', () => {
  const REAL_REPLY = [
    'Entropy is a measure of the degree of randomness, disorder, or unavailable thermal energy within a system.',
    '',
    'Here are two proposed chapters you can add to your Physics syllabus:',
    '',
    '```preppilot-proposal',
    '{',
    '  "kind": "addChapters",',
    '  "subjectName": "Physics",',
    '  "chapters": [',
    '    {',
    '      "name": "Laws of Thermodynamics",',
    '      "topics": ["Zeroth & First Laws", "Second Law & Heat Engines", "Third Law"]',
    '    },',
    '    {',
    '      "name": "Thermodynamic Processes & Entropy",',
    '      "topics": ["Isothermal & Adiabatic Processes", "Entropy Change", "Carnot Cycle"]',
    '    }',
    '  ]',
    '}',
    '```',
  ].join('\n');

  it('separates the answer from the proposal', () => {
    const { message, proposal } = parseReply(REAL_REPLY);

    // The student reads prose; the fenced block never appears in it.
    expect(message).toContain('Entropy is a measure');
    expect(message).not.toContain('preppilot-proposal');
    expect(message).not.toContain('{');
    expect(proposal).not.toBeNull();
  });

  it('reads pretty-printed JSON spread over many lines', () => {
    const { proposal } = parseReply(REAL_REPLY);

    expect(proposal?.kind).toBe('addChapters');
    expect(proposal?.subjectName).toBe('Physics');
    expect(proposal?.chapters.map((chapter) => chapter.name)).toEqual([
      'Laws of Thermodynamics',
      'Thermodynamic Processes & Entropy',
    ]);
    expect(proposal?.chapters[0]?.topics).toEqual([
      'Zeroth & First Laws',
      'Second Law & Heat Engines',
      'Third Law',
    ]);
  });
});

/**
 * A proposal comes from a model, so its names are untrusted input. They never
 * pass through the sheet that bounds what a student can type, and an unbounded
 * name would break every row it appears in and then sync to every device.
 */
describe('names in a proposal', () => {
  const withName = (name: string) =>
    `\`\`\`preppilot-proposal\n${JSON.stringify({
      kind: 'addChapters',
      subjectName: 'Physics',
      chapters: [{ name, topics: ['Fine'] }],
    })}\n\`\`\``;

  it('rejects a chapter name past the limit', () => {
    expect(parseReply(withName('a'.repeat(MAX_NAME_LENGTH + 1))).proposal).toBeNull();
  });

  it('accepts one exactly at the limit', () => {
    expect(parseReply(withName('a'.repeat(MAX_NAME_LENGTH))).proposal).not.toBeNull();
  });

  it('rejects an over-long subject name', () => {
    const raw = `\`\`\`preppilot-proposal\n${JSON.stringify({
      kind: 'addChapters',
      subjectName: 'a'.repeat(MAX_NAME_LENGTH + 1),
      chapters: [{ name: 'Fine', topics: ['Fine'] }],
    })}\n\`\`\``;

    expect(parseReply(raw).proposal).toBeNull();
  });

  it('rejects an over-long topic name', () => {
    const raw = `\`\`\`preppilot-proposal\n${JSON.stringify({
      kind: 'addChapters',
      subjectName: 'Physics',
      chapters: [{ name: 'Fine', topics: ['a'.repeat(MAX_NAME_LENGTH + 1)] }],
    })}\n\`\`\``;

    expect(parseReply(raw).proposal).toBeNull();
  });
});
