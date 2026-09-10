import { drizzle, type SQLJsDatabase } from 'drizzle-orm/sql-js';
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import migrations from '../../drizzle/migrations';
import { ChapterRepository } from './repositories/chapters';
import { PreferenceRepository } from './repositories/preferences';
import { ReminderRepository } from './repositories/reminders';
import { FlashcardRepository } from './repositories/flashcards';
import { NoteRepository } from './repositories/notes';
import { StudySessionRepository } from './repositories/study-sessions';
import { SubjectRepository } from './repositories/subjects';
import { TrackerRepository } from './repositories/trackers';
import { SubtopicRepository } from './repositories/subtopics';
import { TopicRepository } from './repositories/topics';
import * as schema from './schema';
import type { Database } from './types';

/**
 * The browser build's database.
 *
 * expo-sqlite's web backend runs wa-sqlite in a worker and needs
 * `SharedArrayBuffer`, OPFS and `Atomics.wait` — which means cross-origin
 * isolation headers and a fragile worker handshake that times out under
 * ordinary hosting. sql.js is plain WebAssembly on the main thread with none of
 * those requirements, so the browser build uses it instead.
 *
 * The repositories, schema and migrations are shared verbatim with native: only
 * the driver differs, so what runs here is the same SQL the Android app runs.
 */

export const DATABASE_NAME = 'preppilot.db';

/** Survives a page reload, which matters when reviewing the app by clicking through. */
const STORAGE_KEY = 'preppilot.sqlite';

let database: SQLJsDatabase<typeof schema> | null = null;
let connection: SqlJsDatabase | null = null;
let repositories: Repositories | null = null;

export interface Repositories {
  readonly trackers: TrackerRepository;
  readonly subjects: SubjectRepository;
  readonly chapters: ChapterRepository;
  readonly topics: TopicRepository;
  readonly subtopics: SubtopicRepository;
  readonly flashcards: FlashcardRepository;
  readonly notes: NoteRepository;
  readonly sessions: StudySessionRepository;
  readonly reminders: ReminderRepository;
  readonly preferences: PreferenceRepository;
}

function readSaved(): Uint8Array | undefined {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (saved === null || saved === undefined) return undefined;
    return Uint8Array.from(atob(saved), (character) => character.charCodeAt(0));
  } catch {
    // A corrupt or oversized entry must not stop the app from starting; the
    // worst case is an empty database, which then re-seeds.
    return undefined;
  }
}

function persist(): void {
  if (connection === null) return;
  try {
    const bytes = connection.export();
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    globalThis.localStorage?.setItem(STORAGE_KEY, btoa(binary));
  } catch {
    // localStorage can be full or blocked. Losing persistence between reloads is
    // acceptable in the browser build; failing to save is not worth a crash.
  }
}

/** How long a burst of writes is allowed to gather before one save covers it. */
const PERSIST_COALESCE_MS = 120;

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Saves once for a burst of calls rather than once per call.
 *
 * Saving means exporting the whole database and base64-encoding it. Doing that
 * after every repository call made importing a 605-topic syllabus roughly two
 * hundred full serialisations of a 700 KB database — several seconds with the
 * main thread blocked, which looked exactly like the Import button doing
 * nothing.
 *
 * Coalescing trades a short window of durability for that. The window is closed
 * by `flushPersist` whenever the page is hidden or unloaded, which is when a
 * browser would otherwise take the data with it.
 */
function schedulePersist(): void {
  if (persistTimer !== null) return;

  persistTimer = setTimeout(() => {
    persistTimer = null;
    persist();
  }, PERSIST_COALESCE_MS);
}

/** Writes immediately, cancelling any pending save. */
export function flushPersist(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  persist();
}

// A hidden tab may never come back, so the pending write happens now. Both
// events are registered: `pagehide` is what fires on iOS Safari, and
// `visibilitychange` is what fires when a tab is merely switched away from.
globalThis.addEventListener?.('pagehide', flushPersist);
globalThis.addEventListener?.('visibilitychange', () => {
  if (globalThis.document?.visibilityState === 'hidden') flushPersist();
});

export async function initialiseDatabase(): Promise<void> {
  if (database !== null) return;

  const SQL = await initSqlJs({
    // Served from the app's own origin by the bundler.
    locateFile: () => '/sql-wasm-browser.wasm',
  });

  connection = new SQL.Database(readSaved());
  connection.run('PRAGMA foreign_keys = ON;');

  applyMigrations(connection);

  database = drizzle(connection, { schema });
  persist();
}

/**
 * Applies each generated migration once, recording which have run.
 *
 * Previously every migration was re-run on each launch and errors matching
 * "already exists" were swallowed. That worked only while migrations were all
 * `CREATE TABLE`. The first `ALTER TABLE ... ADD COLUMN` broke it: re-adding a
 * column raises "duplicate column name", which the pattern did not match, so the
 * database failed to open and the app hung on its splash from the second launch
 * onward — permanently, because the saved database kept triggering it.
 *
 * A journal removes the guessing: a migration that has run is not run again, and
 * any error from one that has not is a real failure worth surfacing.
 */
function applyMigrations(target: SqlJsDatabase): void {
  const hadJournal = tableExists(target, '__preppilot_migrations');
  target.run(
    'create table if not exists __preppilot_migrations (tag text primary key, applied_at integer not null)',
  );

  // A database saved before the journal existed already has some migrations in
  // it, and no record of which. That single reconciling pass re-runs them and
  // forgives the errors that says so; afterwards the journal is authoritative and
  // every error is a real one.
  const reconciling = !hadJournal && tableExists(target, 'subjects');

  const applied = new Set<string>();
  for (const result of target.exec('select tag from __preppilot_migrations')) {
    for (const row of result.values) {
      if (typeof row[0] === 'string') applied.add(row[0]);
    }
  }

  for (const tag of Object.keys(migrations.migrations).sort()) {
    if (applied.has(tag)) continue;

    const sql = (migrations.migrations as Record<string, string>)[tag];
    if (sql === undefined) continue;

    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed.length === 0) continue;

      try {
        target.run(trimmed);
      } catch (error) {
        if (!reconciling || !isAlreadyApplied(error)) throw error;
      }
    }

    target.run('insert into __preppilot_migrations (tag, applied_at) values (?, ?)', [
      tag,
      Date.now(),
    ]);
  }
}

function tableExists(target: SqlJsDatabase, name: string): boolean {
  const result = target.exec("select 1 from sqlite_master where type = 'table' and name = ?", [
    name,
  ]);
  return result.length > 0 && result[0] !== undefined && result[0].values.length > 0;
}

/**
 * Whether an error means the statement's effect is already in the database.
 *
 * Both forms matter: `CREATE TABLE` says "already exists" and
 * `ALTER TABLE ... ADD COLUMN` says "duplicate column name". Matching only the
 * first is what broke the browser build on its second launch.
 */
function isAlreadyApplied(error: unknown): boolean {
  return /already exists|duplicate column name/i.test(String(error));
}

export function getDatabase(): Database {
  if (database === null) {
    throw new Error('Database used before initialiseDatabase() completed.');
  }
  return database as unknown as Database;
}

export function getRepositories(): Repositories {
  if (repositories !== null) return repositories;

  const db = getDatabase();

  // sql.js holds everything in memory, so each write is mirrored to
  // localStorage. The wrapped set is what gets cached — caching the raw one and
  // wrapping on return would persist only the very first call's writes.
  repositories = wrapWithPersistence({
    trackers: new TrackerRepository(db),
    subjects: new SubjectRepository(db),
    chapters: new ChapterRepository(db),
    topics: new TopicRepository(db),
    subtopics: new SubtopicRepository(db),
    flashcards: new FlashcardRepository(db),
    notes: new NoteRepository(db),
    sessions: new StudySessionRepository(db),
    reminders: new ReminderRepository(db),
    preferences: new PreferenceRepository(db),
  });

  return repositories;
}

/** Saves after any repository call that can change data. */
function wrapWithPersistence(source: Repositories): Repositories {
  const wrap = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(object, property, receiver) {
        const value = Reflect.get(object, property, receiver);
        if (typeof value !== 'function') return value;

        return (...args: unknown[]) => {
          const result = (value as (...a: unknown[]) => unknown).apply(object, args);
          if (result instanceof Promise) {
            return result.then((resolved) => (schedulePersist(), resolved));
          }
          schedulePersist();
          return result;
        };
      },
    });

  return {
    trackers: wrap(source.trackers),
    subjects: wrap(source.subjects),
    chapters: wrap(source.chapters),
    topics: wrap(source.topics),
    subtopics: wrap(source.subtopics),
    flashcards: wrap(source.flashcards),
    notes: wrap(source.notes),
    sessions: wrap(source.sessions),
    reminders: wrap(source.reminders),
    preferences: wrap(source.preferences),
  };
}

export function resetDatabase(): void {
  connection?.close();
  connection = null;
  database = null;
  repositories = null;
}
