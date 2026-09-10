import { isValidName } from '../domain/types';

/**
 * The two things the assistant can produce about a single topic: a summary to
 * read, and questions to answer.
 *
 * Both are parsed here, away from the network and the UI, because both arrive as
 * free text from a model and neither can be trusted to be well formed. A quiz
 * that parses half-way is worse than one that fails: a student would answer
 * questions whose "correct" answer was never established.
 */

/** How many questions a check is made of. Three is enough to catch a guess. */
export const QUIZ_LENGTH = 3;
/** Four options: enough that guessing is unlikely, few enough to read at a glance. */
export const QUIZ_OPTIONS = 4;

export interface QuizQuestion {
  readonly question: string;
  /** Always exactly `QUIZ_OPTIONS` of them. */
  readonly options: readonly string[];
  /**
   * Every correct option, as indexes into `options`.
   *
   * Usually one. A question may have several, in which case the student has to
   * pick exactly that set — and the question text says so, because a multi-answer
   * question that looks single-answer is a trick rather than a test.
   */
  readonly answerIndexes: readonly number[];
  /** Shown after answering, right or wrong. */
  readonly explanation: string;
}

/** True when a question expects more than one option to be selected. */
export function isMultipleAnswer(question: QuizQuestion): boolean {
  return question.answerIndexes.length > 1;
}

export interface Quiz {
  readonly topicName: string;
  readonly questions: readonly QuizQuestion[];
}

/** The longest a summary may be before it stops being a summary. */
export const MAX_SUMMARY_LENGTH = 2000;

/**
 * Reads a summary out of a reply.
 *
 * Models like to wrap prose in a fenced block or prefix it with "Summary:";
 * neither belongs on screen, and both would show up as literal characters.
 */
export function parseSummary(raw: string): string | null {
  if (typeof raw !== 'string') return null;

  let text = raw.trim();
  if (text.length === 0) return null;

  // A whole reply wrapped in one fence.
  const fenced = /^```(?:[a-z]*)?\n([\s\S]*?)```$/i.exec(text);
  if (fenced?.[1] !== undefined) text = fenced[1].trim();

  text = text.replace(/^(?:summary|answer)\s*:\s*/i, '').trim();

  if (text.length === 0) return null;
  return text.length > MAX_SUMMARY_LENGTH
    ? `${text.slice(0, MAX_SUMMARY_LENGTH).trimEnd()}…`
    : text;
}

/**
 * Reads a quiz out of a reply.
 *
 * Returns null rather than a partial quiz on anything unexpected. A question
 * whose answer index points outside its options, or which offers two identical
 * choices, is not a question a student can be marked against.
 */
export function parseQuiz(raw: string, topicName: string): Quiz | null {
  const json = extractJson(raw);
  if (json === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  const questions = Array.isArray(parsed)
    ? parsed
    : (parsed as { questions?: unknown } | null)?.questions;

  if (!Array.isArray(questions) || questions.length === 0) return null;

  const cleaned: QuizQuestion[] = [];
  for (const entry of questions.slice(0, QUIZ_LENGTH)) {
    const question = readQuestion(entry);
    if (question === null) return null;
    cleaned.push(question);
  }

  if (cleaned.length !== QUIZ_LENGTH) return null;
  if (!isValidName(topicName)) return null;

  return { topicName: topicName.trim(), questions: cleaned };
}

function readQuestion(entry: unknown): QuizQuestion | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const record = entry as Record<string, unknown>;

  const question = typeof record.question === 'string' ? record.question.trim() : '';
  if (question.length === 0 || question.length > 500) return null;

  if (!Array.isArray(record.options)) return null;
  const options = record.options
    .filter((option): option is string => typeof option === 'string')
    .map((option) => option.trim())
    .filter((option) => option.length > 0 && option.length <= 300);

  // Two identical options make one of them wrong for no reason a student can see.
  if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) return null;
  if (options.length < QUIZ_OPTIONS) return null;

  const answers = readAnswerIndexes(record, options.length);
  if (answers === null) return null;

  // Every question shows exactly four options. A model that offers more is
  // trimmed rather than thrown away: the correct ones are kept, and distractors
  // fill the rest.
  const trimmed = trimToFour(options, answers);
  if (trimmed === null) return null;

  const explanation =
    typeof record.explanation === 'string' ? record.explanation.trim().slice(0, 500) : '';

  return {
    question,
    options: trimmed.options,
    answerIndexes: trimmed.answerIndexes,
    explanation,
  };
}

/** Accepts a single `answerIndex` or an `answerIndexes` array; normalises to the array. */
function readAnswerIndexes(record: Record<string, unknown>, optionCount: number): number[] | null {
  const raw = Array.isArray(record.answerIndexes)
    ? record.answerIndexes
    : [record.answerIndex ?? record.answerIndexes];

  const indexes = [...new Set(raw)].filter(
    (value): value is number =>
      typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < optionCount,
  );

  if (indexes.length !== new Set(raw).size) return null;
  if (indexes.length === 0) return null;

  // A question where everything is correct tests nothing.
  if (indexes.length >= optionCount) return null;

  return indexes.sort((a, b) => a - b);
}

/**
 * Reduces a question to exactly four options, keeping every correct one.
 *
 * Order is preserved so the correct answers are not all bunched at the top,
 * which would be a giveaway across three questions.
 */
function trimToFour(
  options: readonly string[],
  answerIndexes: readonly number[],
): { options: string[]; answerIndexes: number[] } | null {
  if (options.length === QUIZ_OPTIONS) {
    return { options: [...options], answerIndexes: [...answerIndexes] };
  }

  const correct = new Set(answerIndexes);
  // More correct answers than slots cannot be shown honestly.
  if (correct.size > QUIZ_OPTIONS - 1) return null;

  const keep = new Set(answerIndexes);
  for (let index = 0; index < options.length && keep.size < QUIZ_OPTIONS; index += 1) {
    keep.add(index);
  }

  const ordered = [...keep].sort((a, b) => a - b);
  const kept = ordered.map((index) => options[index] as string);
  const nextAnswers = ordered
    .map((index, position) => (correct.has(index) ? position : -1))
    .filter((position) => position !== -1);

  return { options: kept, answerIndexes: nextAnswers };
}

/** Pulls the JSON out of a reply that may have prose or a fence around it. */
function extractJson(raw: string): string | null {
  if (typeof raw !== 'string') return null;

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const candidate = (fenced?.[1] ?? raw).trim();

  const start = candidate.search(/[[{]/);
  if (start === -1) return null;

  const opening = candidate[start];
  const closing = opening === '[' ? ']' : '}';
  const end = candidate.lastIndexOf(closing);
  if (end <= start) return null;

  return candidate.slice(start, end + 1);
}

/**
 * Whether one question was answered correctly.
 *
 * Exact set equality: on a multi-answer question, missing a correct option is as
 * wrong as choosing an incorrect one. Partial credit would let a student pass by
 * selecting everything.
 */
export function isAnswerCorrect(question: QuizQuestion, selected: readonly number[]): boolean {
  const chosen = new Set(selected);
  if (chosen.size !== question.answerIndexes.length) return false;
  return question.answerIndexes.every((index) => chosen.has(index));
}

/** Whether every question was answered correctly. */
export function isQuizPassed(quiz: Quiz, answers: readonly (readonly number[])[]): boolean {
  if (answers.length !== quiz.questions.length) return false;
  return quiz.questions.every((question, index) => isAnswerCorrect(question, answers[index] ?? []));
}

/** How many were right, for telling a student where they stand. */
export function countCorrect(quiz: Quiz, answers: readonly (readonly number[])[]): number {
  let correct = 0;
  quiz.questions.forEach((question, index) => {
    if (isAnswerCorrect(question, answers[index] ?? [])) correct += 1;
  });
  return correct;
}
