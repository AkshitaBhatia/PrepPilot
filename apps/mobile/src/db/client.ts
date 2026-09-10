import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import * as SQLite from 'expo-sqlite';
import migrations from '../../drizzle/migrations';
import * as schema from './schema';
import { ChapterRepository } from './repositories/chapters';
import { PreferenceRepository } from './repositories/preferences';
import { ReminderRepository } from './repositories/reminders';
import { StudySessionRepository } from './repositories/study-sessions';
import { SubjectRepository } from './repositories/subjects';
import { TrackerRepository } from './repositories/trackers';
import { FlashcardRepository } from './repositories/flashcards';
import { NoteRepository } from './repositories/notes';
import { SubtopicRepository } from './repositories/subtopics';
import { TopicRepository } from './repositories/topics';
import type { Database } from './types';

export const DATABASE_NAME = 'preppilot.db';

let database: Database | null = null;
let connection: SQLite.SQLiteDatabase | null = null;
/**
 * The in-flight or finished migration.
 *
 * Held so that opening the database twice does not run the migrations twice,
 * and so every caller waits on the same one.
 */
let migrated: Promise<void> | null = null;

/**
 * Opens the local database.
 *
 * `foreign_keys` is off by default in SQLite. Without it the cascade declared on
 * chapters and topics is inert, and a bug could leave rows pointing at a subject
 * that no longer exists.
 *
 * WAL journalling lets a read proceed while a write is in flight, which matters
 * because ticking a topic writes while the tracker is still reading the tree.
 */
export function getDatabase(): Database {
  if (database !== null) return database;

  connection = SQLite.openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });
  connection.execSync('PRAGMA foreign_keys = ON;');
  connection.execSync('PRAGMA journal_mode = WAL;');

  database = drizzle(connection, { schema });

  // Started here so a synchronous caller still ends up with a migrating
  // database, but deliberately not awaited in this function — `getDatabase` has
  // to stay synchronous for the repositories. Callers that need the tables to
  // exist go through `initialiseDatabase`, which waits.
  migrated ??= runMigrations(database);

  return database;
}

/**
 * Applies the migrations, and says so if it cannot.
 *
 * `migrate` is asynchronous. It used to be called without awaiting, which meant
 * the app began querying tables that were still being created — a race that
 * only showed on a device, because the browser build has its own client and the
 * tests run against better-sqlite3. When it lost, the first query threw and the
 * app sat on the splash screen for ever.
 */
async function runMigrations(target: Database): Promise<void> {
  await migrate(target, migrations);
}

/**
 * Prepares the database before the first screen renders.
 *
 * Waits for the migrations. Returning before they finish is what left the app
 * querying tables that did not exist yet; the web build overrides this with its
 * own implementation, which is why the signature is a promise on both.
 */
export async function initialiseDatabase(): Promise<void> {
  getDatabase();
  await migrated;
}

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

let repositories: Repositories | null = null;

export function getRepositories(): Repositories {
  if (repositories !== null) return repositories;

  const db = getDatabase();
  repositories = {
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
  };

  return repositories;
}

/** Test seam: drops the memoised handles. */
export function resetDatabase(): void {
  connection?.closeSync();
  connection = null;
  database = null;
  repositories = null;
  migrated = null;
}
