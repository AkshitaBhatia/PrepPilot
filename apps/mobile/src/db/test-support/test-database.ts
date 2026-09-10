import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Repositories } from '../client';
import { ChapterRepository } from '../repositories/chapters';
import { PreferenceRepository } from '../repositories/preferences';
import { ReminderRepository } from '../repositories/reminders';
import { StudySessionRepository } from '../repositories/study-sessions';
import { SubjectRepository } from '../repositories/subjects';
import { TrackerRepository } from '../repositories/trackers';
import { FlashcardRepository } from '../repositories/flashcards';
import { NoteRepository } from '../repositories/notes';
import { SubtopicRepository } from '../repositories/subtopics';
import { TopicRepository } from '../repositories/topics';
import * as schema from '../schema';
import type { Clock } from '../types';

/**
 * An in-memory database created from the *generated migration*, not from a
 * hand-written copy of the schema.
 *
 * Applying the same SQL the app ships means these tests fail if a migration is
 * missing or malformed, which a mock or a re-declared schema would never catch.
 */
export function createTestDatabase() {
  const sqlite = new Database(':memory:');

  // The cascade behaviour under test depends on this, as does the app, where
  // getDatabase() enables it explicitly.
  sqlite.pragma('foreign_keys = ON');

  // Verify it actually applied. If the pragma silently fails, the referential
  // integrity tests would pass vacuously — an insert that should be rejected
  // would simply succeed and no assertion would notice. Failing loudly here
  // turns a silent false negative into an obvious error.
  const foreignKeysOn = sqlite.pragma('foreign_keys', { simple: true });
  if (foreignKeysOn !== 1) {
    sqlite.close();
    throw new Error(
      `Test database has foreign_keys=${String(foreignKeysOn)}; referential integrity ` +
        'assertions would pass without enforcing anything.',
    );
  }

  // Every migration, in order — not a fixed filename. Drizzle names them by
  // sequence prefix, so sorting reproduces the order the app applies them, and a
  // newly generated migration is picked up without touching this file.
  const migrationsDir = join(__dirname, '../../../drizzle');
  const migrations = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  if (migrations.length === 0) {
    sqlite.close();
    throw new Error(`No migrations found in ${migrationsDir}. Run \`pnpm drizzle-kit generate\`.`);
  }

  for (const name of migrations) {
    const sql = readFileSync(join(migrationsDir, name), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed.length > 0) sqlite.exec(trimmed);
    }
  }

  const db = drizzle(sqlite, { schema });

  return Object.assign(db, { $close: () => sqlite.close() });
}

/** A clock the tests advance deliberately, rather than sleeping. */
export function createTestClock(start = 1_700_000_000_000) {
  let current = start;

  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
      return current;
    },
    set: (ms: number) => {
      current = ms;
    },
  };
}

/**
 * Runs `action` and returns the error it threw.
 *
 * Preferred over `expect(promise).rejects.toThrow()` for these repositories.
 * The drivers are synchronous, so the promise is already rejected by the time it
 * reaches the matcher; that combination proved intermittently unreliable here,
 * failing roughly one run in six with "Received function did not throw" even
 * though the constraint had fired. Capturing the rejection directly is
 * deterministic and states the intent just as clearly.
 */
export async function captureRejection(action: () => Promise<unknown>): Promise<Error> {
  try {
    await action();
  } catch (error) {
    return error as Error;
  }
  throw new Error('Expected the operation to be rejected, but it succeeded.');
}

/**
 * Builds the full repository set against a test database.
 *
 * Every test that touches storage needs all of them, and hand-assembling the
 * object in each fixture meant a new repository broke five unrelated test files
 * at once. One factory keeps that to a single place.
 */
export function createTestRepositories(
  db: ReturnType<typeof createTestDatabase>,
  clock: Clock = createTestClock(),
): Repositories {
  return {
    trackers: new TrackerRepository(db, clock),
    subjects: new SubjectRepository(db, clock),
    chapters: new ChapterRepository(db, clock),
    topics: new TopicRepository(db, clock),
    subtopics: new SubtopicRepository(db, clock),
    flashcards: new FlashcardRepository(db, clock),
    notes: new NoteRepository(db),
    sessions: new StudySessionRepository(db, clock),
    reminders: new ReminderRepository(db, clock),
    preferences: new PreferenceRepository(db, clock),
  };
}
