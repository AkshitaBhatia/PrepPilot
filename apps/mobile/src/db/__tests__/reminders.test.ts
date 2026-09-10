import { ReminderRepository } from '../repositories/reminders';
import { reminders as remindersTable } from '../schema';
import { createTestClock, createTestDatabase } from '../test-support/test-database';

let db: ReturnType<typeof createTestDatabase>;
let clock: ReturnType<typeof createTestClock>;
let repo: ReminderRepository;

const USER = 'user-1';
const NOW = new Date(2026, 7, 24, 10).getTime();

const create = (title = 'Revise polynomials', scheduledAt = NOW + 3_600_000) =>
  repo.create({ userId: USER, title, scheduledAt, repeatRule: 'none' });

beforeEach(() => {
  db = createTestDatabase();
  clock = createTestClock(NOW);
  repo = new ReminderRepository(db, clock);
});

afterEach(() => {
  db.$close();
});

describe('create', () => {
  it('starts enabled with no notification attached', async () => {
    const reminder = await create();

    expect(reminder).toMatchObject({ enabled: true, notificationId: null, syncStatus: 'pending' });
  });

  it('trims the title', async () => {
    expect((await create('  Revise  ')).title).toBe('Revise');
  });
});

describe('listByUser', () => {
  it('orders by when the reminder fires, soonest first', async () => {
    const later = await create('Later', NOW + 7_200_000);
    const sooner = await create('Sooner', NOW + 60_000);

    expect((await repo.listByUser(USER)).map((row) => row.id)).toEqual([sooner.id, later.id]);
  });

  it('excludes another user’s reminders', async () => {
    await create();
    await repo.create({
      userId: 'someone-else',
      title: 'Theirs',
      scheduledAt: NOW,
      repeatRule: 'none',
    });

    expect(await repo.listByUser(USER)).toHaveLength(1);
  });

  it('excludes deleted reminders', async () => {
    const reminder = await create();
    await repo.softDelete(reminder.id);

    expect(await repo.listByUser(USER)).toEqual([]);
  });
});

describe('update', () => {
  it('changes the title and marks the row pending', async () => {
    const reminder = await create();
    await repo.setNotificationId(reminder.id, 'n1');

    await repo.update(reminder.id, { title: 'Revise number systems' });

    expect(await repo.findById(reminder.id)).toMatchObject({
      title: 'Revise number systems',
      syncStatus: 'pending',
    });
  });

  it('can change the time and repeat rule', async () => {
    const reminder = await create();

    await repo.update(reminder.id, { scheduledAt: NOW + 86_400_000, repeatRule: 'daily' });

    expect(await repo.findById(reminder.id)).toMatchObject({
      scheduledAt: NOW + 86_400_000,
      repeatRule: 'daily',
    });
  });

  it('leaves untouched fields alone', async () => {
    const reminder = await create();

    await repo.update(reminder.id, { enabled: false });

    expect((await repo.findById(reminder.id))?.title).toBe('Revise polynomials');
  });
});

describe('setNotificationId', () => {
  it('records which notification backs the reminder', async () => {
    const reminder = await create();

    await repo.setNotificationId(reminder.id, 'n1');

    expect((await repo.findById(reminder.id))?.notificationId).toBe('n1');
  });

  /**
   * A notification id is meaningless on another device, so recording one must
   * not queue the row for sync.
   */
  it('does not mark the row pending for sync', async () => {
    const reminder = await create();
    await repo.update(reminder.id, { title: 'Revise' });
    await db.update(remindersTable).set({ syncStatus: 'synced' });

    await repo.setNotificationId(reminder.id, 'n1');

    expect((await repo.findById(reminder.id))?.syncStatus).toBe('synced');
  });

  it('can clear the identifier', async () => {
    const reminder = await create();
    await repo.setNotificationId(reminder.id, 'n1');

    await repo.setNotificationId(reminder.id, null);

    expect((await repo.findById(reminder.id))?.notificationId).toBeNull();
  });
});

describe('listSchedulable', () => {
  it('returns only enabled, undeleted reminders', async () => {
    const active = await create('Active');
    const disabled = await create('Disabled');
    const removed = await create('Removed');
    await repo.update(disabled.id, { enabled: false });
    await repo.softDelete(removed.id);

    expect((await repo.listSchedulable(USER)).map((row) => row.id)).toEqual([active.id]);
  });
});
