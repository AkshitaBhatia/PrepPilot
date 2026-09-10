import { claimGuestData } from '../claim-guest-data';
import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../test-support/test-database';

const GUEST = 'guest-local-user';
const OWNER = 'user-1';
const STRANGER = 'user-2';

let db: ReturnType<typeof createTestDatabase>;
let repositories: ReturnType<typeof createTestRepositories>;

beforeEach(() => {
  db = createTestDatabase();
  repositories = createTestRepositories(db, createTestClock());
});

afterEach(() => {
  db.$close();
});

/** A syllabus ticked off over a fortnight is not a trial run. */
async function seedGuestWork(userId = GUEST) {
  const tracker = await repositories.trackers.create({ userId, name: 'My studies' });
  const subject = await repositories.subjects.create({
    userId,
    name: 'Physics',
    trackerId: tracker.id,
  });
  const chapter = await repositories.chapters.create({
    userId,
    subjectId: subject.id,
    name: 'Electricity',
  });
  const topic = await repositories.topics.create({
    userId,
    chapterId: chapter.id,
    name: "Ohm's law",
  });
  await repositories.subtopics.create({ userId, topicId: topic.id, name: 'Resistors' });
  await repositories.flashcards.create({ userId, front: 'Q', back: 'A', trackerId: tracker.id });
  await repositories.reminders.create({
    userId,
    title: 'Revise',
    scheduledAt: Date.now(),
    repeatRule: 'none',
    trackerId: tracker.id,
  });
  const session = await repositories.sessions.start({
    userId,
    timerMode: 'stopwatch',
    trackerId: tracker.id,
  });
  await repositories.sessions.complete(session.id, 900);
  return { tracker, subject, topic };
}

describe('adopting a guest’s work on sign-in', () => {
  it('moves the syllabus into the account', async () => {
    const { tracker } = await seedGuestWork();

    await claimGuestData(db, GUEST, OWNER);

    expect(await repositories.subjects.listByUser(OWNER, tracker.id)).toHaveLength(1);
    expect(await repositories.subjects.listByUser(GUEST, tracker.id)).toEqual([]);
  });

  it('moves the course itself', async () => {
    await seedGuestWork();

    await claimGuestData(db, GUEST, OWNER);

    expect((await repositories.trackers.listByUser(OWNER)).map((t) => t.name)).toEqual([
      'My studies',
    ]);
    expect(await repositories.trackers.listByUser(GUEST)).toEqual([]);
  });

  it('moves the cards, reminders and study time', async () => {
    await seedGuestWork();

    await claimGuestData(db, GUEST, OWNER);

    expect(await repositories.flashcards.listByUser(OWNER)).toHaveLength(1);
    expect(await repositories.reminders.listByUser(OWNER)).toHaveLength(1);
    expect(await repositories.sessions.totalSecondsForUser(OWNER)).toBe(900);
  });

  it('moves what hangs below a subject too', async () => {
    const { subject, topic } = await seedGuestWork();

    await claimGuestData(db, GUEST, OWNER);

    expect(await repositories.chapters.listBySubject(subject.id)).toHaveLength(1);
    expect(await repositories.subtopics.listByTopic(topic.id)).toHaveLength(1);
  });

  it('reports how much it moved', async () => {
    await seedGuestWork();

    expect((await claimGuestData(db, GUEST, OWNER)).rows).toBeGreaterThan(0);
  });

  /**
   * The server has never seen these rows under the new owner. Left `synced`,
   * a guest's whole syllabus would be stranded on the one device.
   */
  it('marks everything to be sent to the server', async () => {
    await seedGuestWork();

    await claimGuestData(db, GUEST, OWNER);

    const pending = await repositories.subjects.listAllForSync(OWNER);
    expect(pending.every((row) => row.syncStatus === 'pending')).toBe(true);
  });

  /** Guest work is added to what the account already has, not swapped for it. */
  it('leaves the account’s own work alone', async () => {
    await seedGuestWork();
    const own = await repositories.trackers.create({ userId: OWNER, name: 'Already mine' });
    await repositories.subjects.create({ userId: OWNER, name: 'Chemistry', trackerId: own.id });

    await claimGuestData(db, GUEST, OWNER);

    expect(await repositories.trackers.listByUser(OWNER)).toHaveLength(2);
    expect(await repositories.subjects.listByUser(OWNER)).toHaveLength(2);
  });

  it('never touches another account’s rows', async () => {
    await seedGuestWork();
    await seedGuestWork(STRANGER);

    await claimGuestData(db, GUEST, OWNER);

    expect(await repositories.trackers.listByUser(STRANGER)).toHaveLength(1);
    expect(await repositories.subjects.listByUser(STRANGER)).toHaveLength(1);
  });

  it('does nothing when the guest made nothing', async () => {
    expect((await claimGuestData(db, GUEST, OWNER)).rows).toBe(0);
  });

  /** Signing in twice must not undo the first adoption. */
  it('is safe to run again', async () => {
    await seedGuestWork();

    await claimGuestData(db, GUEST, OWNER);
    await claimGuestData(db, GUEST, OWNER);

    expect(await repositories.trackers.listByUser(OWNER)).toHaveLength(1);
  });

  it('refuses to move an account onto itself', async () => {
    await seedGuestWork(OWNER);

    expect((await claimGuestData(db, OWNER, OWNER)).rows).toBe(0);
    expect(await repositories.trackers.listByUser(OWNER)).toHaveLength(1);
  });
});
