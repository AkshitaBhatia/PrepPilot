import { ACTIVE_TRACKER } from '../../../db/repositories/preferences';
import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../../../db/test-support/test-database';
import { activeTrackerId, resetTrackersStore, useTrackersStore } from '../trackers-store';

const USER = 'user-1';

let db: ReturnType<typeof createTestDatabase>;
let repositories: ReturnType<typeof createTestRepositories>;

beforeEach(() => {
  db = createTestDatabase();
  repositories = createTestRepositories(db, createTestClock());
  resetTrackersStore();
});

afterEach(() => {
  db.$close();
});

const store = () => useTrackersStore.getState();
const load = () => store().load(USER, repositories);

describe('opening the app', () => {
  it('shows the only course there is', async () => {
    const tracker = await repositories.trackers.create({ userId: USER, name: 'UPSC CSE' });

    await load();

    expect(store().activeId).toBe(tracker.id);
    expect(store().trackers.map((row) => row.name)).toEqual(['UPSC CSE']);
  });

  it('reopens on the course the student was last using', async () => {
    await repositories.trackers.create({ userId: USER, name: 'First' });
    const second = await repositories.trackers.create({ userId: USER, name: 'Second' });
    await repositories.preferences.set(USER, ACTIVE_TRACKER, second.id);

    await load();

    expect(store().activeId).toBe(second.id);
  });

  /** A remembered course that has since been removed must not leave the app blank. */
  it('falls back to a real course when the remembered one is gone', async () => {
    const first = await repositories.trackers.create({ userId: USER, name: 'First' });
    await repositories.preferences.set(USER, ACTIVE_TRACKER, 'deleted-tracker');

    await load();

    expect(store().activeId).toBe(first.id);
  });

  it('gives a first-time student a course to start from', async () => {
    await load();

    expect(store().trackers).toHaveLength(1);
    expect(store().activeId).not.toBeNull();
  });

  it('says so plainly when the database will not open', async () => {
    jest.spyOn(repositories.trackers, 'adoptOrphans').mockRejectedValueOnce(new Error('disk'));

    await load();

    expect(store().error).toBe('We could not open your courses. Try again.');
    expect(store().loading).toBe(false);
  });
});

describe('switching between courses', () => {
  it('remembers the switch for next launch', async () => {
    await repositories.trackers.create({ userId: USER, name: 'First' });
    const second = await repositories.trackers.create({ userId: USER, name: 'Second' });
    await load();

    await store().select(second.id);

    expect(await repositories.preferences.get(USER, ACTIVE_TRACKER)).toBe(second.id);
  });

  it('still switches when the preference cannot be written', async () => {
    const first = await repositories.trackers.create({ userId: USER, name: 'First' });
    const second = await repositories.trackers.create({ userId: USER, name: 'Second' });
    await load();
    expect(store().activeId).toBe(first.id);
    jest.spyOn(repositories.preferences, 'set').mockRejectedValueOnce(new Error('disk'));

    await store().select(second.id);

    expect(store().activeId).toBe(second.id);
    expect(store().error).toBeNull();
  });
});

describe('adding a course', () => {
  it('shows the new one straight away', async () => {
    await load();

    const added = await store().add('NEET PG', 'neet-pg');

    expect(added?.templateId).toBe('neet-pg');
    expect(store().activeId).toBe(added?.id);
  });

  it('leaves the earlier ones alone', async () => {
    const first = await repositories.trackers.create({ userId: USER, name: 'First' });
    await load();

    await store().add('Second');

    expect(store().trackers.map((row) => row.id)).toContain(first.id);
    expect(store().trackers).toHaveLength(2);
  });

  it('reports a failure rather than pretending it worked', async () => {
    await load();
    jest.spyOn(repositories.trackers, 'create').mockRejectedValueOnce(new Error('disk'));

    expect(await store().add('Doomed')).toBeNull();
    expect(store().error).toBe('We could not add that course. Try again.');
  });
});

describe('renaming a course', () => {
  it('shows the new name', async () => {
    const tracker = await repositories.trackers.create({ userId: USER, name: 'Typo' });
    await load();

    await store().rename(tracker.id, 'Fixed');

    expect(store().trackers[0]?.name).toBe('Fixed');
  });
});

describe('removing a course', () => {
  it('moves to another one when the current one goes', async () => {
    const first = await repositories.trackers.create({ userId: USER, name: 'First' });
    const second = await repositories.trackers.create({ userId: USER, name: 'Second' });
    await load();
    await store().select(second.id);

    await store().remove(second.id);

    expect(store().activeId).toBe(first.id);
    expect(store().trackers).toHaveLength(1);
  });

  it('leaves the showing course alone when a different one goes', async () => {
    const first = await repositories.trackers.create({ userId: USER, name: 'First' });
    const second = await repositories.trackers.create({ userId: USER, name: 'Second' });
    await load();

    await store().remove(second.id);

    expect(store().activeId).toBe(first.id);
  });

  /** With no course there is nowhere to put a subject, so the last one stays. */
  it('refuses to remove the last one', async () => {
    const only = await repositories.trackers.create({ userId: USER, name: 'Only' });
    await load();

    await store().remove(only.id);

    expect(store().trackers).toHaveLength(1);
    expect(store().error).toBe('This is your only course. Add another before removing this one.');
  });
});

describe('reading the showing course from outside React', () => {
  it('is null before anything is loaded', () => {
    expect(activeTrackerId()).toBeNull();
  });

  it('matches the store once loaded', async () => {
    await load();

    expect(activeTrackerId()).toBe(store().activeId);
  });
});

describe('using it before it is ready', () => {
  it('fails loudly rather than writing to the wrong account', async () => {
    await expect(store().add('Too early')).rejects.toThrow(/before load/);
  });
});

describe('clearing an error', () => {
  it('lets the student get on with it', async () => {
    const only = await repositories.trackers.create({ userId: USER, name: 'Only' });
    await load();
    await store().remove(only.id);

    store().clearError();

    expect(store().error).toBeNull();
  });
});

describe('when the database refuses a write', () => {
  it('says so rather than showing a stale name', async () => {
    const tracker = await repositories.trackers.create({ userId: USER, name: 'Typo' });
    await load();
    jest.spyOn(repositories.trackers, 'rename').mockRejectedValueOnce(new Error('disk'));

    await store().rename(tracker.id, 'Fixed');

    expect(store().error).toBe('We could not rename that course. Try again.');
    expect(store().trackers[0]?.name).toBe('Typo');
  });

  it('says so rather than leaving the course looking removed', async () => {
    await repositories.trackers.create({ userId: USER, name: 'First' });
    const second = await repositories.trackers.create({ userId: USER, name: 'Second' });
    await load();
    jest.spyOn(repositories.trackers, 'softDelete').mockRejectedValueOnce(new Error('disk'));

    await store().remove(second.id);

    expect(store().error).toBe('We could not remove that course. Try again.');
    expect(store().trackers).toHaveLength(2);
  });
});

describe('after removing the course that was showing', () => {
  /** Otherwise every launch resolves a course that no longer exists. */
  it('remembers the one it fell back to', async () => {
    const first = await repositories.trackers.create({ userId: USER, name: 'First' });
    const second = await repositories.trackers.create({ userId: USER, name: 'Second' });
    await load();
    await store().select(second.id);

    await store().remove(second.id);

    expect(await repositories.preferences.get(USER, ACTIVE_TRACKER)).toBe(first.id);
  });
});
