/**
 * Structural (duck-typed) shapes for the PrepPilot syllabus hierarchy.
 *
 * The progress engine is deliberately decoupled from persistence: it accepts
 * anything that satisfies these interfaces, so the same pure functions serve
 * the SQLite-backed mobile app and the fixture-backed web demo alike.
 *
 * Hierarchy: Subject -> Chapter -> Topic -> Sub-topic.
 *
 * PRD §9 defines the first three. Sub-topics are an optional fourth level a
 * student adds themselves, the same way they add the other three; nothing
 * creates them automatically.
 */

/** The smallest unit a student can tick. */
export interface SubtopicLike {
  readonly id: string;
  readonly completed: boolean;
}

/**
 * A topic, which may be ticked directly or broken into sub-topics.
 *
 * When a topic has sub-topics they become the countable unit and the topic's own
 * `completed` is derived from them — a topic cannot be done while part of it is
 * not. When it has none, the topic is the unit and `completed` is what the
 * student set. `subtopics` is optional so every existing caller, and every row
 * written before the level existed, still satisfies this shape.
 */
export interface TopicLike<TSubtopic extends SubtopicLike = SubtopicLike> {
  readonly id: string;
  readonly completed: boolean;
  readonly subtopics?: readonly TSubtopic[];
}

/** A chapter groups topics. A chapter with zero topics is legal and must not report progress (PRD §10). */
export interface ChapterLike<TTopic extends TopicLike = TopicLike> {
  readonly id: string;
  readonly topics: readonly TTopic[];
}

/** A subject groups chapters. Subject progress is topic-weighted, never an average of chapters (PRD §10). */
export interface SubjectLike<
  TTopic extends TopicLike = TopicLike,
  TChapter extends ChapterLike<TTopic> = ChapterLike<TTopic>,
> {
  readonly id: string;
  readonly chapters: readonly TChapter[];
}

/**
 * The longest a subject, chapter or topic name may be.
 *
 * Enforced wherever a name enters the database, not only in the sheet a student
 * types into. Names also arrive from a model's proposal and from a generated
 * template, and neither passes through that sheet — an unbounded name from
 * either would break every row it appears in, bloat the row, and then sync
 * upstream to every other device.
 */
export const MAX_NAME_LENGTH = 120;

/** True when a name is present and within the limit, after trimming. */
export function isValidName(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH;
}
