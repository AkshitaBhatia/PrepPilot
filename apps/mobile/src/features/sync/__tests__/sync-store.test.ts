import type { Repositories } from '../../../db/client';
import { LAST_SYNCED_AT } from '../../../db/repositories/preferences';
import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../../../db/test-support/test-database';
import { describeState, formatRelative } from '../components/sync-status';
import { toRemote } from '../mappers';
import { createFakeRemote } from '../test-support/fake-remote';
import { describeSyncFailure, resetSyncStore, useSyncStore } from '../sync-store';

jest.mock('../../../lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('../../../config/env', () => ({
  ...jest.requireActual('../../../config/env'),
  isDemoMode: jest.fn(() => false),
}));

const USER = 'user-1';

let db: ReturnType<typeof createTestDatabase>;
let repositories: Repositories;
let fake: ReturnType<typeof createFakeRemote>;

const sync = () => useSyncStore.getState();

beforeEach(() => {
  db = createTestDatabase();
  repositories = createTestRepositories(db, createTestClock());
  fake = createFakeRemote();
  resetSyncStore();
});

afterEach(() => {
  db.$close();
});

/** A subject as another device would have pushed it, at a given server time. */
const remoteSubject = (id: string, name: string, updatedAt: number) =>
  toRemote({
    id,
    userId: USER,
    name,
    description: null,
    position: 0,
    createdAt: updatedAt,
    updatedAt,
    deletedAt: null,
  });

const run = () => sync().syncNow(USER, { remote: fake.remote, repositories });

describe('syncNow', () => {
  it('reports success and pushes what was pending', async () => {
    await repositories.subjects.create({ userId: USER, name: 'Mathematics' });

    await run();

    expect(sync().status).toBe('idle');
    expect(sync().lastResult?.pushed).toBeGreaterThanOrEqual(1);
  });

  /**
   * The watermark is the newest `updated_at` the *server* returned, not the time
   * this device finished. A pass that saw no rows has nothing to move past, so
   * the previous mark stands rather than jumping to a device clock the server
   * never agreed with.
   */
  it('leaves the watermark alone when the server returned nothing', async () => {
    await repositories.subjects.create({ userId: USER, name: 'Mathematics' });

    await run();

    expect(sync().lastSyncedAt).toBeNull();
  });

  it('takes the watermark from the newest row the server sent', async () => {
    const serverTime = Date.UTC(2026, 7, 20, 9, 30);
    fake.seed(
      'subjects',
      remoteSubject('01a00000-0000-7000-8000-000000000001', 'Physics', serverTime),
    );

    await run();

    expect(sync().lastSyncedAt).toBe(serverTime);
  });

  it('ignores a device clock that disagrees with the server', async () => {
    // A device running fast would otherwise bookmark an instant the server has
    // not reached, and never pull anything written in between — silently.
    const serverTime = Date.UTC(2026, 7, 20, 9, 30);
    const ahead = jest.spyOn(Date, 'now').mockReturnValue(serverTime + 7 * 24 * 60 * 60 * 1000);

    fake.seed(
      'subjects',
      remoteSubject('01a00000-0000-7000-8000-000000000002', 'Chemistry', serverTime),
    );

    await run();

    expect(sync().lastSyncedAt).toBe(serverTime);
    ahead.mockRestore();
  });

  it('persists the watermark so a later launch resumes from it', async () => {
    fake.seed(
      'subjects',
      remoteSubject('01a00000-0000-7000-8000-000000000003', 'Biology', Date.UTC(2026, 7, 21, 8, 0)),
    );

    await run();

    const stored = await repositories.preferences.get(USER, LAST_SYNCED_AT);
    expect(Number.parseInt(stored ?? '', 10)).toBe(sync().lastSyncedAt);
  });

  it('hydrates the watermark from storage', async () => {
    await repositories.preferences.set(USER, LAST_SYNCED_AT, '1700000000000');
    resetSyncStore();

    await sync().hydrate(USER, repositories);

    expect(sync().lastSyncedAt).toBe(1_700_000_000_000);
  });

  it('starts from nothing when no watermark is stored', async () => {
    await sync().hydrate(USER, repositories);

    expect(sync().lastSyncedAt).toBeNull();
  });

  it('ignores a second request while one is running', async () => {
    const first = run();
    await run();
    await first;

    // A concurrent pass would have doubled the pushes.
    expect(fake.rows('subjects')).toHaveLength(0);
  });
});

describe('failures', () => {
  /** Nothing is lost: the work is already on the device. */
  it('says the work is safe locally', async () => {
    fake.failOn('subjects', 'network unreachable');

    await run();

    expect(sync().status).toBe('error');
    expect(sync().error).toMatch(/saved on this device/);
  });

  /**
   * The watermark must not advance past work the failed pass never reached, or
   * the next sync would skip it entirely.
   */
  it('does not advance the watermark', async () => {
    fake.failOn('subjects', 'network unreachable');

    await run();

    expect(sync().lastSyncedAt).toBeNull();
    expect(await repositories.preferences.get(USER, LAST_SYNCED_AT)).toBeNull();
  });

  it('recovers on a retry', async () => {
    await repositories.subjects.create({ userId: USER, name: 'Mathematics' });
    fake.failOn('subjects', 'network unreachable');
    await run();

    fake.clearFailures();
    await run();

    expect(sync().status).toBe('idle');
    expect(fake.rows('subjects')).toHaveLength(1);
  });

  it('clears an error on request', async () => {
    fake.failOn('subjects', 'boom');
    await run();

    sync().clearError();

    expect(sync().status).toBe('idle');
    expect(sync().error).toBeNull();
  });
});

describe('describeSyncFailure', () => {
  it.each([
    ['Network request failed', /back online/],
    ['fetch unreachable', /back online/],
    ['JWT expired', /Sign in again/],
    ['unauthorized', /Sign in again/],
  ])('maps %s to a student-facing message', (message, expected) => {
    expect(describeSyncFailure(new Error(message))).toMatch(expected);
  });

  /** A PostgREST error can name columns and constraints; it must not be shown. */
  it('replaces an unrecognised error rather than passing it through', () => {
    const raw = 'push subjects: duplicate key value violates unique constraint "subjects_pkey"';

    const message = describeSyncFailure(new Error(raw));

    expect(message).not.toContain('subjects_pkey');
    expect(message).toMatch(/saved on this device/);
  });
});

describe('the status card copy', () => {
  it('says work is safe before the first sync', () => {
    expect(describeState('idle', null)).toMatch(/Not synced yet/);
  });

  it('reports progress while syncing', () => {
    expect(describeState('syncing', null)).toMatch(/Syncing/);
  });

  it('reports when it last succeeded', () => {
    expect(describeState('idle', Date.now() - 120_000)).toMatch(/Last synced 2 minutes ago/);
  });
});

describe('formatRelative', () => {
  const now = 1_700_000_000_000;

  it.each([
    [now - 5_000, 'just now'],
    [now - 60_000, '1 minute ago'],
    [now - 300_000, '5 minutes ago'],
    [now - 3_600_000, '1 hour ago'],
    [now - 7_200_000, '2 hours ago'],
    [now - 86_400_000, '1 day ago'],
    [now - 172_800_000, '2 days ago'],
  ])('formats %i as %s', (timestamp, expected) => {
    expect(formatRelative(timestamp, now)).toBe(expected);
  });

  /** A clock that moved backwards must not produce a negative age. */
  it('never reports a time in the future', () => {
    expect(formatRelative(now + 60_000, now)).toBe('just now');
  });
});
