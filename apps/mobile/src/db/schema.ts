import type { RepeatRule, TimerMode } from '@preppilot/shared';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * The local, offline-first database. This is the source of truth: every read and
 * write the tracker performs goes here, and Supabase is a sync target rather
 * than a dependency (PRD §6).
 *
 * Conventions shared by every synchronised table:
 *
 * - `id` is a client-generated UUIDv7 (D13), so a record created with no network
 *   has its final identifier immediately.
 * - `userId` is denormalised onto every table rather than reached through a join,
 *   so a query can be scoped to the signed-in student in one predicate and the
 *   Supabase RLS policies can mirror it exactly.
 * - Timestamps are epoch milliseconds in an INTEGER column. SQLite has no date
 *   type, and storing text would make ordering depend on formatting.
 * - `deletedAt` is a tombstone (D12). Rows are never hard-deleted, because a row
 *   deleted offline and then removed outright would be resurrected by the next
 *   sync pull, which cannot tell "deleted here" from "not yet seen".
 * - `syncStatus` tracks whether local changes have reached the server yet.
 */

/** `pending` means the row has local changes the server has not seen. */
export const SYNC_STATUS = ['pending', 'synced'] as const;
export type SyncStatus = (typeof SYNC_STATUS)[number];

/**
 * `abandoned` covers a session interrupted by the app being killed. It keeps
 * whatever duration the last heartbeat recorded, so a crash costs a student at
 * most one heartbeat interval rather than the whole sitting (D17).
 */
export const SESSION_STATUSES = ['running', 'paused', 'completed', 'abandoned'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/**
 * A tracker: one exam or course a student is preparing for.
 *
 * Everything a student does belongs to exactly one of these — the syllabus, the
 * notes, the cards, the sessions. Someone sitting UPSC and GATE keeps two, and
 * switching between them switches all of it, because an hour of GATE revision is
 * not progress towards UPSC and showing it as such would be a lie.
 *
 * `templateId` records which course a tracker was created from, where it was.
 * It is a label, not a link: the syllabus is copied on import and is the
 * student's from that moment, free to diverge.
 */
export const trackers = sqliteTable(
  'trackers',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    /** The bundled template this came from, if any. */
    templateId: text('template_id'),
    position: integer('position').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
    syncStatus: text('sync_status').$type<SyncStatus>().notNull().default('pending'),
  },
  (table) => [
    index('trackers_user_position_idx').on(table.userId, table.deletedAt, table.position),
    index('trackers_sync_idx').on(table.syncStatus),
  ],
);

export const subjects = sqliteTable(
  'subjects',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    /** Which tracker this belongs to. Null only in rows written before trackers existed. */
    trackerId: text('tracker_id'),
    name: text('name').notNull(),
    description: text('description'),
    /** Explicit ordering; a syllabus has a meaningful sequence (D15). */
    position: integer('position').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
    syncStatus: text('sync_status').$type<SyncStatus>().notNull().default('pending'),
  },
  (table) => [
    // Every list query filters by user and excludes tombstones, then orders by
    // position; this index serves that access path directly.
    index('subjects_user_position_idx').on(table.userId, table.deletedAt, table.position),
    index('subjects_tracker_idx').on(table.trackerId, table.deletedAt, table.position),
    index('subjects_sync_idx').on(table.syncStatus),
  ],
);

export const chapters = sqliteTable(
  'chapters',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
    syncStatus: text('sync_status').$type<SyncStatus>().notNull().default('pending'),
  },
  (table) => [
    index('chapters_subject_position_idx').on(table.subjectId, table.deletedAt, table.position),
    index('chapters_sync_idx').on(table.syncStatus),
  ],
);

export const topics = sqliteTable(
  'topics',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    chapterId: text('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** SQLite has no boolean type; 0 or 1 in an INTEGER column. */
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    /**
     * When `completed` last changed, tracked separately from `updatedAt`.
     *
     * Conflict resolution treats completion independently of the rest of the row
     * (D14): renaming a topic on one device must not revert a tick made on
     * another. Without a per-field timestamp the two changes are
     * indistinguishable and one silently wins.
     */
    completedChangedAt: integer('completed_changed_at'),
    /**
     * A student's own note against this topic.
     *
     * Null and empty mean the same thing — no note — but null is what a row
     * written before the column existed carries, so both are treated as absent
     * rather than one of them rendering an empty note card.
     */
    note: text('note'),
    position: integer('position').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
    syncStatus: text('sync_status').$type<SyncStatus>().notNull().default('pending'),
  },
  (table) => [
    index('topics_chapter_position_idx').on(table.chapterId, table.deletedAt, table.position),
    index('topics_sync_idx').on(table.syncStatus),
    // Progress counts every live topic for a user; this covers that scan.
    index('topics_user_completed_idx').on(table.userId, table.deletedAt, table.completed),
  ],
);

/**
 * The optional fourth level of the syllabus.
 *
 * A student adds sub-topics themselves, exactly as they add subjects, chapters
 * and topics — nothing creates them automatically, and a topic without any stays
 * a perfectly ordinary checkable topic.
 *
 * Where they exist they become the counted unit and the parent topic's
 * completion is derived from them (see `topicUnits` in @preppilot/shared), so a
 * topic broken into four parts weighs four times one that is not.
 */
export const subtopics = sqliteTable(
  'subtopics',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    topicId: text('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    /** Completion resolves independently of a rename, as it does for topics (D14). */
    completedChangedAt: integer('completed_changed_at'),
    /** A student's own note, exactly as a topic carries one. */
    note: text('note'),
    position: integer('position').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
    syncStatus: text('sync_status').$type<SyncStatus>().notNull().default('pending'),
  },
  (table) => [
    index('subtopics_topic_position_idx').on(table.topicId, table.deletedAt, table.position),
    index('subtopics_sync_idx').on(table.syncStatus),
    index('subtopics_user_completed_idx').on(table.userId, table.deletedAt, table.completed),
  ],
);

/**
 * A flashcard, reviewed on an SM-2 schedule.
 *
 * Cards hang off a topic so a student revises what they are actually tracking,
 * but the reference is deliberately soft: `topicId` has no foreign key and the
 * topic's name is snapshotted, exactly as study sessions do (D16). Deleting a
 * topic must not silently destroy the cards written for it or the review history
 * behind them.
 *
 * The scheduling fields mirror `CardSchedule` in @preppilot/shared, which owns
 * the algorithm; nothing here decides when a card is next due.
 */
export const flashcards = sqliteTable(
  'flashcards',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    /** Which tracker this belongs to. Null only in rows written before trackers existed. */
    trackerId: text('tracker_id'),
    topicId: text('topic_id'),
    topicName: text('topic_name'),
    front: text('front').notNull(),
    back: text('back').notNull(),
    /** SM-2 ease factor, stored as REAL. */
    easeFactor: real('ease_factor').notNull().default(2.5),
    intervalDays: integer('interval_days').notNull().default(0),
    repetitions: integer('repetitions').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    /** When the card is next due, epoch milliseconds. A new card is due at once. */
    dueAt: integer('due_at').notNull(),
    lastReviewedAt: integer('last_reviewed_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
    syncStatus: text('sync_status').$type<SyncStatus>().notNull().default('pending'),
  },
  (table) => [
    // The review queue is "my live cards, due soonest first" — this covers it.
    index('flashcards_user_due_idx').on(table.userId, table.deletedAt, table.dueAt),
    index('flashcards_topic_idx').on(table.topicId, table.deletedAt),
    index('flashcards_sync_idx').on(table.syncStatus),
  ],
);

/**
 * A recorded period of study.
 *
 * Sessions deliberately do **not** carry foreign keys to subjects, chapters or
 * topics. Deleting a subject must not shrink "total time studied using PrepPilot"
 * (PRD §12, DECISIONS.md D16) — the student really did spend that time. Instead
 * the ids are kept as plain references for filtering, alongside a snapshot of the
 * names so history stays readable after the syllabus moves on.
 */
export const studySessions = sqliteTable(
  'study_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    /** Which tracker this belongs to. Null only in rows written before trackers existed. */
    trackerId: text('tracker_id'),

    subjectId: text('subject_id'),
    chapterId: text('chapter_id'),
    topicId: text('topic_id'),
    /** What the student saw when they studied, preserved against later renames. */
    subjectName: text('subject_name'),
    chapterName: text('chapter_name'),
    topicName: text('topic_name'),

    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    /** Seconds of study time. Excludes Pomodoro breaks and paused stretches. */
    durationSeconds: integer('duration_seconds').notNull().default(0),
    timerMode: text('timer_mode').$type<TimerMode>().notNull(),
    status: text('status').$type<SessionStatus>().notNull(),

    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
    syncStatus: text('sync_status').$type<SyncStatus>().notNull().default('pending'),
  },
  (table) => [
    // History lists a user's sessions newest first.
    index('study_sessions_user_started_idx').on(table.userId, table.deletedAt, table.startedAt),
    index('study_sessions_subject_idx').on(table.subjectId),
    index('study_sessions_sync_idx').on(table.syncStatus),
    // Recovering an interrupted session on launch looks up by status.
    index('study_sessions_status_idx').on(table.userId, table.status),
  ],
);

/**
 * A student-created reminder (PRD §16).
 *
 * PrepPilot never invents schedules of its own — the specification is explicit
 * that it "should not create intrusive automatic schedules" — so every row here
 * exists because a student asked for it.
 *
 * The syllabus references are plain ids rather than foreign keys, for the same
 * reason study sessions are: deleting a subject should not silently cancel a
 * reminder the student set, and the name snapshot keeps the list readable.
 */
export const reminders = sqliteTable(
  'reminders',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    /** Which tracker this belongs to. Null only in rows written before trackers existed. */
    trackerId: text('tracker_id'),
    title: text('title').notNull(),
    /** Epoch milliseconds of the first or only occurrence. */
    scheduledAt: integer('scheduled_at').notNull(),
    repeatRule: text('repeat_rule').$type<RepeatRule>().notNull().default('none'),

    subjectId: text('subject_id'),
    chapterId: text('chapter_id'),
    topicId: text('topic_id'),
    relatedName: text('related_name'),

    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    /**
     * The platform notification this reminder currently holds.
     *
     * Kept so an edit or a disable can cancel exactly the right notification
     * rather than clearing everything the app has scheduled.
     */
    notificationId: text('notification_id'),

    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
    syncStatus: text('sync_status').$type<SyncStatus>().notNull().default('pending'),
  },
  (table) => [
    index('reminders_user_time_idx').on(table.userId, table.deletedAt, table.scheduledAt),
    index('reminders_sync_idx').on(table.syncStatus),
  ],
);

/**
 * Key/value settings scoped to a user, such as the chosen theme.
 * Kept generic so a new preference needs no migration.
 */
export const preferences = sqliteTable(
  'preferences',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
    updatedAt: integer('updated_at').notNull(),
    syncStatus: text('sync_status').$type<SyncStatus>().notNull().default('pending'),
  },
  (table) => [uniqueIndex('preferences_user_key_idx').on(table.userId, table.key)],
);

export type TrackerRow = typeof trackers.$inferSelect;
export type SubjectRow = typeof subjects.$inferSelect;
export type ChapterRow = typeof chapters.$inferSelect;
export type TopicRow = typeof topics.$inferSelect;
export type SubtopicRow = typeof subtopics.$inferSelect;
export type FlashcardRow = typeof flashcards.$inferSelect;
export type PreferenceRow = typeof preferences.$inferSelect;
export type StudySessionRow = typeof studySessions.$inferSelect;
export type ReminderRow = typeof reminders.$inferSelect;

export type NewSubjectRow = typeof subjects.$inferInsert;
export type NewChapterRow = typeof chapters.$inferInsert;
export type NewTopicRow = typeof topics.$inferInsert;
export type NewSubtopicRow = typeof subtopics.$inferInsert;
