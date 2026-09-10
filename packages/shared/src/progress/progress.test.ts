import { describe, expect, it } from 'vitest';
import type { SubjectLike } from '../domain/types';
import {
  calculateChapterProgress,
  calculateOverallProgress,
  calculateSubjectProgress,
  calculateSubtopicsProgress,
  calculateSyllabusProgress,
  calculateTopicsProgress,
  isTopicComplete,
  makeProgress,
} from './progress';

/** Builds a chapter whose topics follow the given completion flags. */
const chapter = (id: string, ...completions: boolean[]) => ({
  id,
  topics: completions.map((completed, index) => ({ id: `${id}-t${index}`, completed })),
});

const subject = (id: string, ...chapters: ReturnType<typeof chapter>[]) => ({ id, chapters });

describe('makeProgress', () => {
  it('computes percent from counts', () => {
    expect(makeProgress(1, 4)).toEqual({ completed: 1, total: 4, percent: 25, isEmpty: false });
  });

  it('reports null percent and isEmpty when there is nothing to measure', () => {
    expect(makeProgress(0, 0)).toEqual({
      completed: 0,
      total: 0,
      percent: null,
      isEmpty: true,
    });
  });

  it.each([
    ['negative completed', -1, 5],
    ['negative total', 0, -5],
    ['fractional completed', 1.5, 5],
    ['fractional total', 1, 5.5],
    ['NaN', Number.NaN, 5],
    ['completed exceeding total', 6, 5],
  ])('rejects %s', (_label, completed, total) => {
    expect(() => makeProgress(completed, total)).toThrow(RangeError);
  });
});

describe('calculateChapterProgress', () => {
  // The worked example from PRD §10 and TESTING.md.
  it('reports 50% for 1 of 2 topics', () => {
    expect(calculateChapterProgress(chapter('c', true, false)).percent).toBe(50);
  });

  it('reports 100% for 2 of 2 topics', () => {
    expect(calculateChapterProgress(chapter('c', true, true)).percent).toBe(100);
  });

  it('reports 0% for 0 of 2 topics', () => {
    expect(calculateChapterProgress(chapter('c', false, false)).percent).toBe(0);
  });

  it('treats a chapter with no topics as empty rather than 0%', () => {
    const progress = calculateChapterProgress(chapter('c'));
    expect(progress.isEmpty).toBe(true);
    expect(progress.percent).toBeNull();
  });

  it('handles a repeating decimal without loss', () => {
    expect(calculateChapterProgress(chapter('c', true, false, false)).percent).toBeCloseTo(
      33.3333,
      4,
    );
  });
});

describe('calculateSubjectProgress', () => {
  /**
   * The regression this whole engine exists to prevent. PRD §10 requires subject
   * progress to be topic-weighted; averaging chapter percentages would report 50%
   * for a subject that is genuinely 1% complete.
   */
  it('weights by topic count, not by chapter', () => {
    const lopsided = subject(
      's',
      chapter('c1', true),
      chapter('c2', ...Array.from({ length: 99 }, () => false)),
    );

    const progress = calculateSubjectProgress(lopsided);

    expect(progress).toMatchObject({ completed: 1, total: 100, percent: 1 });
    // The naive average of chapter percentages, explicitly not what we want.
    expect(progress.percent).not.toBe(50);
  });

  it('excludes empty chapters instead of counting them as incomplete', () => {
    const withEmpty = subject('s', chapter('c1', true, true), chapter('c2'));

    // Were the empty chapter counted as 0%, the naive average would be 50%.
    expect(calculateSubjectProgress(withEmpty)).toMatchObject({
      completed: 2,
      total: 2,
      percent: 100,
    });
  });

  it('is empty when every chapter is empty', () => {
    const progress = calculateSubjectProgress(subject('s', chapter('c1'), chapter('c2')));
    expect(progress.isEmpty).toBe(true);
    expect(progress.percent).toBeNull();
  });

  it('is empty when the subject has no chapters at all', () => {
    expect(calculateSubjectProgress(subject('s')).percent).toBeNull();
  });

  it('sums across chapters of differing sizes', () => {
    const mixed = subject(
      's',
      chapter('c1', true, false),
      chapter('c2', true, true, true, false),
      chapter('c3', false),
    );
    expect(calculateSubjectProgress(mixed)).toMatchObject({ completed: 4, total: 7 });
  });
});

describe('calculateOverallProgress', () => {
  it('aggregates every topic across every subject', () => {
    const subjects = [
      subject('s1', chapter('c1', true, true)),
      subject('s2', chapter('c2', true, false, false)),
    ];
    expect(calculateOverallProgress(subjects)).toMatchObject({
      completed: 3,
      total: 5,
      percent: 60,
    });
  });

  it('weights larger subjects more heavily than smaller ones', () => {
    const subjects = [
      subject('small', chapter('c1', true)),
      subject('large', chapter('c2', ...Array.from({ length: 9 }, () => false))),
    ];
    // Averaging subject percentages would give 50%; the truth is 10%.
    expect(calculateOverallProgress(subjects).percent).toBe(10);
  });

  it('is empty for an empty syllabus', () => {
    expect(calculateOverallProgress([])).toMatchObject({ percent: null, isEmpty: true });
  });

  it('is empty when subjects exist but contain no topics', () => {
    expect(calculateOverallProgress([subject('s', chapter('c'))]).percent).toBeNull();
  });
});

describe('calculateSyllabusProgress', () => {
  const subjects: SubjectLike[] = [
    subject('math', chapter('numbers', true, false), chapter('polynomials', true, true)),
    subject('science', chapter('motion', false, false), chapter('empty')),
  ];

  it('returns progress for every chapter', () => {
    const { byChapter } = calculateSyllabusProgress(subjects);

    expect(byChapter.get('numbers')).toMatchObject({ percent: 50 });
    expect(byChapter.get('polynomials')).toMatchObject({ percent: 100 });
    expect(byChapter.get('motion')).toMatchObject({ percent: 0 });
    expect(byChapter.get('empty')).toMatchObject({ percent: null, isEmpty: true });
  });

  it('returns progress for every subject', () => {
    const { bySubject } = calculateSyllabusProgress(subjects);

    expect(bySubject.get('math')).toMatchObject({ completed: 3, total: 4, percent: 75 });
    expect(bySubject.get('science')).toMatchObject({ completed: 0, total: 2, percent: 0 });
  });

  it('returns overall progress consistent with the per-node results', () => {
    const { overall } = calculateSyllabusProgress(subjects);
    expect(overall).toMatchObject({ completed: 3, total: 6, percent: 50 });
  });

  /**
   * Guards PRD §10's requirement that checking one topic updates chapter, subject
   * and overall together: the single-pass result must never disagree with the
   * standalone calculators.
   */
  it('agrees with the standalone calculators for every node', () => {
    const single = calculateSyllabusProgress(subjects);

    expect(single.overall).toEqual(calculateOverallProgress(subjects));
    for (const s of subjects) {
      expect(single.bySubject.get(s.id)).toEqual(calculateSubjectProgress(s));
      for (const c of s.chapters) {
        expect(single.byChapter.get(c.id)).toEqual(calculateChapterProgress(c));
      }
    }
  });

  it('handles an empty syllabus', () => {
    const result = calculateSyllabusProgress([]);
    expect(result.overall.isEmpty).toBe(true);
    expect(result.bySubject.size).toBe(0);
    expect(result.byChapter.size).toBe(0);
  });

  it('stays linear over a large syllabus', () => {
    const large = Array.from({ length: 20 }, (_, s) =>
      subject(
        `s${s}`,
        ...Array.from({ length: 25 }, (_, c) =>
          chapter(`s${s}-c${c}`, ...Array.from({ length: 20 }, (_, t) => t % 2 === 0)),
        ),
      ),
    );

    const { overall, bySubject, byChapter } = calculateSyllabusProgress(large);

    expect(overall).toMatchObject({ completed: 5000, total: 10_000, percent: 50 });
    expect(bySubject.size).toBe(20);
    expect(byChapter.size).toBe(500);
  });
});

describe('calculateTopicsProgress', () => {
  it('counts a flat topic list', () => {
    expect(
      calculateTopicsProgress([
        { id: 'a', completed: true },
        { id: 'b', completed: false },
        { id: 'c', completed: true },
      ]),
    ).toMatchObject({ completed: 2, total: 3 });
  });

  it('is empty for an empty list', () => {
    expect(calculateTopicsProgress([]).isEmpty).toBe(true);
  });
});

/**
 * Sub-topics are an optional fourth level a student adds themselves. When a
 * topic has them they become the countable unit; when it has none the topic is
 * the unit. Counting a four-part topic as one would make finishing it look
 * identical to ticking something trivial.
 */
describe('topics broken into sub-topics', () => {
  const topic = (id: string, completed: boolean, subtopics?: { completed: boolean }[]) => ({
    id,
    completed,
    ...(subtopics === undefined
      ? {}
      : { subtopics: subtopics.map((s, i) => ({ id: `${id}-${i}`, completed: s.completed })) }),
  });

  it('counts sub-topics in place of the topic that holds them', () => {
    const progress = calculateTopicsProgress([
      topic('ohms-law', false, [
        { completed: true },
        { completed: false },
        { completed: false },
        { completed: false },
      ]),
      topic('circuits', false),
    ]);

    // Four sub-topics plus one plain topic, one of the five done.
    expect(progress).toMatchObject({ completed: 1, total: 5 });
    expect(progress.percent).toBeCloseTo(20);
  });

  it('still counts a topic with no sub-topics as one unit', () => {
    expect(calculateTopicsProgress([topic('a', true), topic('b', false)])).toMatchObject({
      completed: 1,
      total: 2,
    });
  });

  it('treats an empty sub-topic list as no sub-topics at all', () => {
    // Adding then deleting every sub-topic must not make the topic unmeasurable.
    expect(calculateTopicsProgress([topic('a', true, [])])).toMatchObject({
      completed: 1,
      total: 1,
    });
  });

  it('ignores the topic flag when sub-topics decide it', () => {
    // A stale `completed` on the parent must not inflate the count.
    const progress = calculateTopicsProgress([
      topic('stale', true, [{ completed: false }, { completed: false }]),
    ]);

    expect(progress).toMatchObject({ completed: 0, total: 2 });
  });

  it('weights a large topic above a small one within a subject', () => {
    const subject = {
      id: 'physics',
      chapters: [
        {
          id: 'c1',
          topics: [
            topic('big', false, [
              { completed: true },
              { completed: true },
              { completed: true },
              { completed: false },
            ]),
            topic('small', false),
          ],
        },
      ],
    };

    expect(calculateSubjectProgress(subject)).toMatchObject({ completed: 3, total: 5 });
  });

  it('rolls sub-topics all the way up to overall', () => {
    const subjects = [
      {
        id: 's1',
        chapters: [
          { id: 'c1', topics: [topic('t1', false, [{ completed: true }, { completed: false }])] },
        ],
      },
      { id: 's2', chapters: [{ id: 'c2', topics: [topic('t2', true)] }] },
    ];

    const { overall, bySubject, byChapter } = calculateSyllabusProgress(subjects);

    expect(byChapter.get('c1')).toMatchObject({ completed: 1, total: 2 });
    expect(bySubject.get('s2')).toMatchObject({ completed: 1, total: 1 });
    expect(overall).toMatchObject({ completed: 2, total: 3 });
  });
});

describe('isTopicComplete', () => {
  const withSubs = (completed: boolean[]) => ({
    id: 't',
    completed: false,
    subtopics: completed.map((c, i) => ({ id: `s${i}`, completed: c })),
  });

  it('is true only when every sub-topic is done', () => {
    expect(isTopicComplete(withSubs([true, true]))).toBe(true);
    expect(isTopicComplete(withSubs([true, false]))).toBe(false);
  });

  it('falls back to the topic flag when there are no sub-topics', () => {
    expect(isTopicComplete({ id: 't', completed: true })).toBe(true);
    expect(isTopicComplete({ id: 't', completed: false, subtopics: [] })).toBe(false);
  });

  /** Two answers on screen at once is worse than either answer. */
  it('overrides a stale flag that disagrees with its own sub-topics', () => {
    expect(isTopicComplete({ ...withSubs([false, false]), completed: true })).toBe(false);
  });
});

describe('calculateSubtopicsProgress', () => {
  it('measures within one topic', () => {
    expect(
      calculateSubtopicsProgress({
        id: 't',
        completed: false,
        subtopics: [
          { id: 'a', completed: true },
          { id: 'b', completed: false },
        ],
      }),
    ).toMatchObject({ completed: 1, total: 2 });
  });

  it('is empty for a topic with none, rather than zero per cent', () => {
    const progress = calculateSubtopicsProgress({ id: 't', completed: true });

    expect(progress.isEmpty).toBe(true);
    expect(progress.percent).toBeNull();
  });
});
