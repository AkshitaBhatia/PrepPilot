import { newSchedule, reviewCard } from '@preppilot/shared';
import { FlashcardRepository } from '../repositories/flashcards';
import { createTestClock, createTestDatabase } from '../test-support/test-database';

const USER = 'user-1';
const OTHER = 'user-2';
const NOW = Date.UTC(2026, 7, 26, 9, 0);
const DAY = 24 * 60 * 60 * 1000;

let db: ReturnType<typeof createTestDatabase>;
let clock: ReturnType<typeof createTestClock>;
let cards: FlashcardRepository;

beforeEach(() => {
  db = createTestDatabase();
  clock = createTestClock(NOW);
  cards = new FlashcardRepository(db, clock);
});

afterEach(() => {
  db.$close();
});

describe('creating a card', () => {
  it('is due immediately, so a new card is studied now', async () => {
    const card = await cards.create({ userId: USER, front: 'Ohm', back: 'V = IR' });

    expect(card.dueAt).toBe(NOW);
    expect(card.repetitions).toBe(0);
    expect(card.lastReviewedAt).toBeNull();
  });

  it('trims what was typed', async () => {
    const card = await cards.create({ userId: USER, front: '  Ohm  ', back: '  V = IR  ' });

    expect(card.front).toBe('Ohm');
    expect(card.back).toBe('V = IR');
  });

  /**
   * The topic reference is soft on purpose (D16): deleting a topic must not
   * destroy the cards written for it, so the name is snapshotted alongside.
   */
  it('remembers the topic name, not just its id', async () => {
    const card = await cards.create({
      userId: USER,
      front: 'Ohm',
      back: 'V = IR',
      topicId: 'topic-1',
      topicName: "Ohm's law",
    });

    expect(card.topicName).toBe("Ohm's law");
  });

  it('survives the topic it came from being deleted', async () => {
    // No foreign key, so nothing cascades the card away with the topic.
    await cards.create({
      userId: USER,
      front: 'Ohm',
      back: 'V = IR',
      topicId: 'gone',
      topicName: 'Deleted topic',
    });

    expect(await cards.listByUser(USER)).toHaveLength(1);
  });
});

describe('the review queue', () => {
  it('holds only what is due', async () => {
    const due = await cards.create({ userId: USER, front: 'Due', back: 'x' });
    const later = await cards.create({ userId: USER, front: 'Later', back: 'y' });
    await cards.applySchedule(later.id, { ...newSchedule(NOW), dueAt: NOW + DAY });

    const queue = await cards.listDue(USER, NOW);

    expect(queue.map((card) => card.id)).toEqual([due.id]);
  });

  it('belongs to one account only', async () => {
    await cards.create({ userId: USER, front: 'Mine', back: 'x' });
    await cards.create({ userId: OTHER, front: 'Theirs', back: 'y' });

    expect((await cards.listDue(USER, NOW)).map((card) => card.front)).toEqual(['Mine']);
  });

  it('leaves out a deleted card', async () => {
    const card = await cards.create({ userId: USER, front: 'Gone', back: 'x' });
    await cards.softDelete(card.id);

    expect(await cards.listDue(USER, NOW)).toEqual([]);
  });
});

describe('recording a review', () => {
  it('stores exactly what the algorithm decided', async () => {
    const card = await cards.create({ userId: USER, front: 'Ohm', back: 'V = IR' });
    const schedule = reviewCard(newSchedule(NOW), 'good', NOW);

    await cards.applySchedule(card.id, schedule);

    const stored = await cards.findById(card.id);
    expect(stored).toMatchObject({
      easeFactor: schedule.easeFactor,
      intervalDays: schedule.intervalDays,
      repetitions: schedule.repetitions,
      dueAt: schedule.dueAt,
      lapses: schedule.lapses,
    });
  });

  it('records when it happened', async () => {
    const card = await cards.create({ userId: USER, front: 'Ohm', back: 'V = IR' });
    clock.advance(5_000);

    await cards.applySchedule(card.id, reviewCard(newSchedule(NOW), 'good', NOW));

    expect((await cards.findById(card.id))?.lastReviewedAt).toBe(NOW + 5_000);
  });

  it('keeps a fractional ease factor intact', async () => {
    // Stored as REAL: rounding it to an integer would break the whole ladder.
    const card = await cards.create({ userId: USER, front: 'Ohm', back: 'V = IR' });
    const schedule = reviewCard(newSchedule(NOW), 'hard', NOW);

    await cards.applySchedule(card.id, schedule);

    expect((await cards.findById(card.id))?.easeFactor).toBeCloseTo(schedule.easeFactor, 5);
    expect(schedule.easeFactor % 1).not.toBe(0);
  });

  it('marks the card as needing to be sent again', async () => {
    const card = await cards.create({ userId: USER, front: 'Ohm', back: 'V = IR' });
    await cards.markSynced([card.id]);

    await cards.applySchedule(card.id, reviewCard(newSchedule(NOW), 'good', NOW));

    expect((await cards.findById(card.id))?.syncStatus).toBe('pending');
  });
});

describe('editing and deleting', () => {
  it('changes both sides', async () => {
    const card = await cards.create({ userId: USER, front: 'Wrong', back: 'Also wrong' });

    await cards.edit(card.id, 'Right', 'Also right');

    expect(await cards.findById(card.id)).toMatchObject({ front: 'Right', back: 'Also right' });
  });

  it('tombstones rather than removing, so the deletion can travel', async () => {
    const card = await cards.create({ userId: USER, front: 'Gone', back: 'x' });

    await cards.softDelete(card.id);

    expect(await cards.findById(card.id)).toBeNull();
    expect(await cards.listAllForSync(USER)).toHaveLength(1);
  });
});

describe('synchronisation', () => {
  it('accepts a card that arrived from the server', async () => {
    const incoming = {
      id: '01a00000-0000-7000-8000-000000000001',
      userId: USER,
      topicId: null,
      topicName: null,
      front: 'From another device',
      back: 'x',
      easeFactor: 2.36,
      intervalDays: 3,
      repetitions: 2,
      lapses: 1,
      dueAt: NOW + DAY,
      lastReviewedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      syncStatus: 'synced' as const,
    };

    await cards.upsertFromSync(incoming);

    expect(await cards.findById(incoming.id)).toMatchObject({ front: 'From another device' });
  });

  it('does not bump updatedAt when marking a row sent', async () => {
    // That records what the server saw, not a change the student made.
    const card = await cards.create({ userId: USER, front: 'Ohm', back: 'V = IR' });
    clock.advance(10_000);

    await cards.markSynced([card.id]);

    expect((await cards.findById(card.id))?.updatedAt).toBe(NOW);
  });
});

describe('cards attached to a topic', () => {
  it('lists only that topic’s cards', async () => {
    await cards.create({ userId: USER, front: 'For Ohm', back: 'x', topicId: 'topic-1' });
    await cards.create({
      userId: USER,
      front: 'For something else',
      back: 'y',
      topicId: 'topic-2',
    });

    expect((await cards.listByTopic('topic-1')).map((card) => card.front)).toEqual(['For Ohm']);
  });

  it('finds none for a topic that has none', async () => {
    expect(await cards.listByTopic('topic-with-nothing')).toEqual([]);
  });

  it('does nothing when asked to mark an empty list as synced', async () => {
    await expect(cards.markSynced([])).resolves.toBeUndefined();
  });
});
