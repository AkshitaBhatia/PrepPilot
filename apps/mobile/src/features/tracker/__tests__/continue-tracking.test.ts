import { makeProgress } from '@preppilot/shared';
import type { StudySessionRow } from '../../../db/schema';
import { continuePoint } from '../continue-tracking';
import type { TrackerState } from '../tracker-store';

const session = (overrides: Partial<StudySessionRow> = {}): StudySessionRow =>
  ({
    id: 's1',
    subjectId: 'subject-1',
    subjectName: 'Biology',
    chapterName: null,
    topicName: null,
    startedAt: 1_000,
    ...overrides,
  }) as StudySessionRow;

const state = (
  subjects: readonly { id: string; name: string }[],
  progress: Record<string, { done: number; total: number }> = {},
): TrackerState =>
  ({
    subjects: subjects.map((s) => ({ ...s, chapters: [] })),
    progress: {
      overall: makeProgress(0, 0),
      bySubject: new Map(
        Object.entries(progress).map(([id, p]) => [id, makeProgress(p.done, p.total)]),
      ),
      byChapter: new Map(),
    },
  }) as unknown as TrackerState;

/**
 * Built on the sessions the app already records rather than a second history:
 * a session is its existing record of sitting down to study something.
 */
describe('working out where the student left off', () => {
  it('offers the most recent subject studied', () => {
    const point = continuePoint(
      [
        session({ id: 'old', startedAt: 1_000, subjectId: 'a', subjectName: 'Biology' }),
        session({ id: 'new', startedAt: 5_000, subjectId: 'b', subjectName: 'Physics' }),
      ],
      state([
        { id: 'a', name: 'Biology' },
        { id: 'b', name: 'Physics' },
      ]),
    );

    expect(point?.subjectName).toBe('Physics');
  });

  it('names the chapter when the session recorded one', () => {
    const point = continuePoint(
      [session({ subjectId: 'a', chapterName: 'Chapter 4' })],
      state([{ id: 'a', name: 'Biology' }]),
    );

    expect(point?.detail).toBe('Chapter 4');
  });

  it('prefers the topic, which is more specific than the chapter', () => {
    const point = continuePoint(
      [session({ subjectId: 'a', chapterName: 'Chapter 4', topicName: 'Photosynthesis' })],
      state([{ id: 'a', name: 'Biology' }]),
    );

    expect(point?.detail).toBe('Photosynthesis');
  });

  it('reports the subject’s real progress', () => {
    const point = continuePoint(
      [session({ subjectId: 'a' })],
      state([{ id: 'a', name: 'Biology' }], { a: { done: 13, total: 20 } }),
    );

    expect(point?.progress.completed).toBe(13);
    expect(point?.progress.total).toBe(20);
  });

  /** A first run has nothing to continue, and an empty card is worse than none. */
  it('offers nothing when there are no sessions', () => {
    expect(continuePoint([], state([{ id: 'a', name: 'Biology' }]))).toBeNull();
  });

  it('offers nothing when no session was attached to a subject', () => {
    expect(
      continuePoint([session({ subjectId: null })], state([{ id: 'a', name: 'B' }])),
    ).toBeNull();
  });

  /** Continuing a deleted subject would send them nowhere. */
  it('skips a subject that is no longer in the syllabus', () => {
    const point = continuePoint(
      [
        session({ id: 'gone', startedAt: 9_000, subjectId: 'deleted' }),
        session({ id: 'here', startedAt: 1_000, subjectId: 'a', subjectName: 'Biology' }),
      ],
      state([{ id: 'a', name: 'Biology' }]),
    );

    expect(point?.subjectId).toBe('a');
  });

  /** Nothing left to do there; offering it sends them somewhere finished. */
  it('skips a subject that is already complete', () => {
    const point = continuePoint(
      [
        session({ id: 'done', startedAt: 9_000, subjectId: 'a' }),
        session({ id: 'todo', startedAt: 1_000, subjectId: 'b', subjectName: 'Physics' }),
      ],
      state(
        [
          { id: 'a', name: 'Biology' },
          { id: 'b', name: 'Physics' },
        ],
        { a: { done: 20, total: 20 }, b: { done: 2, total: 10 } },
      ),
    );

    expect(point?.subjectName).toBe('Physics');
  });

  it('offers a subject that has not been started at all', () => {
    const point = continuePoint(
      [session({ subjectId: 'a' })],
      state([{ id: 'a', name: 'Biology' }], { a: { done: 0, total: 10 } }),
    );

    expect(point?.subjectName).toBe('Biology');
  });

  it('uses the name from the syllabus, not the one frozen into the session', () => {
    const point = continuePoint(
      [session({ subjectId: 'a', subjectName: 'Old name' })],
      state([{ id: 'a', name: 'Renamed' }]),
    );

    expect(point?.subjectName).toBe('Renamed');
  });
});
