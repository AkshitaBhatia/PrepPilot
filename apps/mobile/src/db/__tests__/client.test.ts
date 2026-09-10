import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import * as SQLite from 'expo-sqlite';
import migrations from '../../../drizzle/migrations';
import {
  DATABASE_NAME,
  getDatabase,
  getRepositories,
  initialiseDatabase,
  resetDatabase,
} from '../client';
import { ChapterRepository } from '../repositories/chapters';
import { SubjectRepository } from '../repositories/subjects';
import { TopicRepository } from '../repositories/topics';

jest.mock('expo-sqlite');

// Reimplementing enough of the expo-sqlite statement API to satisfy the real
// migrator would be a brittle mock of a driver this test is not about. What
// matters here is that the client applies its migrations at all.
jest.mock('drizzle-orm/expo-sqlite/migrator', () => ({ migrate: jest.fn() }));

const execSync = jest.fn();
const closeSync = jest.fn();

const mockedOpen = SQLite.openDatabaseSync as jest.MockedFunction<typeof SQLite.openDatabaseSync>;

beforeEach(() => {
  jest.clearAllMocks();
  resetDatabase();
  mockedOpen.mockReturnValue({ execSync, closeSync } as unknown as SQLite.SQLiteDatabase);
});

afterEach(() => {
  resetDatabase();
});

describe('getDatabase', () => {
  it('opens the named database file', () => {
    getDatabase();

    expect(mockedOpen).toHaveBeenCalledWith(DATABASE_NAME, expect.anything());
  });

  /**
   * SQLite disables foreign keys by default. Without this the cascades declared
   * on chapters and topics are inert, and a bug could leave rows pointing at a
   * subject that no longer exists — silently, with no error to notice.
   */
  it('enables foreign key enforcement', () => {
    getDatabase();

    expect(execSync).toHaveBeenCalledWith('PRAGMA foreign_keys = ON;');
  });

  /** WAL lets the tracker keep reading the tree while a tick is being written. */
  it('enables write-ahead logging', () => {
    getDatabase();

    expect(execSync).toHaveBeenCalledWith('PRAGMA journal_mode = WAL;');
  });

  /**
   * The app previously opened the database without ever applying its migrations,
   * so the tables did not exist and the first query would have failed on device.
   * The test harness creates its own tables, so no test noticed.
   */
  it('applies the migrations', () => {
    getDatabase();

    expect(migrate).toHaveBeenCalledWith(expect.anything(), migrations);
  });

  it('applies them once, not on every access', () => {
    getDatabase();
    getDatabase();

    expect(migrate).toHaveBeenCalledTimes(1);
  });

  it('opens the database only once', () => {
    expect(getDatabase()).toBe(getDatabase());
    expect(mockedOpen).toHaveBeenCalledTimes(1);
  });

  it('reopens after a reset', () => {
    getDatabase();
    resetDatabase();
    getDatabase();

    expect(closeSync).toHaveBeenCalledTimes(1);
    expect(mockedOpen).toHaveBeenCalledTimes(2);
  });
});

describe('getRepositories', () => {
  it('provides a repository for each level of the hierarchy', () => {
    const repositories = getRepositories();

    expect(repositories.subjects).toBeInstanceOf(SubjectRepository);
    expect(repositories.chapters).toBeInstanceOf(ChapterRepository);
    expect(repositories.topics).toBeInstanceOf(TopicRepository);
  });

  it('returns the same instances on repeat calls', () => {
    expect(getRepositories()).toBe(getRepositories());
  });
});

describe('resetDatabase', () => {
  it('is safe to call when nothing was ever opened', () => {
    expect(() => resetDatabase()).not.toThrow();
  });
});

/**
 * `migrate` returns a promise. It used to be called without awaiting, so the
 * app started querying tables that were still being created — a race that only
 * lost on a real device, where it left the app on the splash screen for ever.
 */
describe('waiting for the migrations', () => {
  it('does not finish opening until they have run', async () => {
    let finishMigrating = (): void => {};
    (migrate as jest.Mock).mockReturnValue(
      new Promise<void>((resolve) => {
        finishMigrating = resolve;
      }),
    );

    let opened = false;
    const opening = initialiseDatabase().then(() => {
      opened = true;
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(opened).toBe(false);

    finishMigrating();
    await opening;

    expect(opened).toBe(true);
  });

  it('runs them once however many times the database is opened', async () => {
    (migrate as jest.Mock).mockResolvedValue(undefined);

    await initialiseDatabase();
    await initialiseDatabase();
    getDatabase();

    expect(migrate).toHaveBeenCalledTimes(1);
  });

  /** A failure has to reach the caller, or start-up cannot report it. */
  it('surfaces a migration failure rather than swallowing it', async () => {
    (migrate as jest.Mock).mockRejectedValue(new Error('no such table'));

    await expect(initialiseDatabase()).rejects.toThrow('no such table');
  });

  it('runs them again after a reset', async () => {
    (migrate as jest.Mock).mockResolvedValue(undefined);
    await initialiseDatabase();

    resetDatabase();
    await initialiseDatabase();

    expect(migrate).toHaveBeenCalledTimes(2);
  });
});
