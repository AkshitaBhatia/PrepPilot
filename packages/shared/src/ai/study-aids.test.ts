import { describe, expect, it } from 'vitest';
import {
  MAX_SUMMARY_LENGTH,
  QUIZ_LENGTH,
  countCorrect,
  isAnswerCorrect,
  isMultipleAnswer,
  isQuizPassed,
  parseQuiz,
  parseSummary,
  type Quiz,
  type QuizQuestion,
} from './study-aids';

const question = (n: number, answerIndex = 0) => ({
  question: `Question ${n}?`,
  options: [`A${n}`, `B${n}`, `C${n}`, `D${n}`],
  answerIndex,
  explanation: `Because ${n}.`,
});

const wellFormed = (over: Partial<Record<string, unknown>> = {}) =>
  JSON.stringify({ questions: [question(1), question(2), question(3)], ...over });

describe('parseSummary', () => {
  it('takes the prose as it is', () => {
    expect(parseSummary('Ohm’s law relates voltage, current and resistance.')).toBe(
      'Ohm’s law relates voltage, current and resistance.',
    );
  });

  it('unwraps a reply the model fenced', () => {
    // The backticks would otherwise appear on screen as literal characters.
    expect(parseSummary('```\nVoltage equals current times resistance.\n```')).toBe(
      'Voltage equals current times resistance.',
    );
  });

  it('drops a "Summary:" the model prefixed', () => {
    expect(parseSummary('Summary: It relates V, I and R.')).toBe('It relates V, I and R.');
  });

  it('refuses an empty reply rather than showing a blank card', () => {
    expect(parseSummary('')).toBeNull();
    expect(parseSummary('   ')).toBeNull();
    expect(parseSummary('```\n\n```')).toBeNull();
  });

  it('truncates a summary that stopped being one', () => {
    const long = 'a'.repeat(MAX_SUMMARY_LENGTH + 500);

    const summary = parseSummary(long);

    expect(summary?.length).toBeLessThanOrEqual(MAX_SUMMARY_LENGTH + 1);
    expect(summary?.endsWith('…')).toBe(true);
  });
});

describe('parseQuiz', () => {
  it('reads a well-formed quiz', () => {
    const quiz = parseQuiz(wellFormed(), "Ohm's law");

    expect(quiz?.questions).toHaveLength(QUIZ_LENGTH);
    expect(quiz?.topicName).toBe("Ohm's law");
  });

  it('reads one fenced as json, which is how a model usually sends it', () => {
    const quiz = parseQuiz(`Here you go:\n\`\`\`json\n${wellFormed()}\n\`\`\``, 'Topic');

    expect(quiz?.questions).toHaveLength(QUIZ_LENGTH);
  });

  it('reads a bare array as well as an object', () => {
    const quiz = parseQuiz(JSON.stringify([question(1), question(2), question(3)]), 'Topic');

    expect(quiz?.questions).toHaveLength(QUIZ_LENGTH);
  });

  it('ignores prose wrapped around the JSON', () => {
    const quiz = parseQuiz(`Sure! ${wellFormed()} Hope that helps.`, 'Topic');

    expect(quiz).not.toBeNull();
  });
});

/**
 * A quiz that parses half-way is worse than one that fails: a student would be
 * answering questions whose correct answer was never established.
 */
describe('a quiz that cannot be trusted', () => {
  it('is refused when an answer points outside its options', () => {
    const raw = JSON.stringify({
      questions: [{ ...question(1), answerIndex: 9 }, question(2), question(3)],
    });

    expect(parseQuiz(raw, 'Topic')).toBeNull();
  });

  it('is refused when a question has the wrong number of options', () => {
    const raw = JSON.stringify({
      questions: [{ ...question(1), options: ['Only', 'Two'] }, question(2), question(3)],
    });

    expect(parseQuiz(raw, 'Topic')).toBeNull();
  });

  it('is refused when two options are the same', () => {
    // One of them would be wrong for no reason the student can see.
    const raw = JSON.stringify({
      questions: [
        { ...question(1), options: ['Same', 'Same', 'C', 'D'] },
        question(2),
        question(3),
      ],
    });

    expect(parseQuiz(raw, 'Topic')).toBeNull();
  });

  it('is refused when there are too few questions', () => {
    expect(parseQuiz(JSON.stringify({ questions: [question(1)] }), 'Topic')).toBeNull();
  });

  it('is refused when the answer index is not a whole number', () => {
    const raw = JSON.stringify({
      questions: [{ ...question(1), answerIndex: 1.5 }, question(2), question(3)],
    });

    expect(parseQuiz(raw, 'Topic')).toBeNull();
  });

  it('is refused when the reply is not JSON at all', () => {
    expect(parseQuiz('I cannot help with that.', 'Topic')).toBeNull();
    expect(parseQuiz('', 'Topic')).toBeNull();
  });

  it('is refused when the JSON is malformed', () => {
    expect(parseQuiz('{"questions": [', 'Topic')).toBeNull();
  });

  it('is refused for a topic name that could not be stored', () => {
    expect(parseQuiz(wellFormed(), '')).toBeNull();
    expect(parseQuiz(wellFormed(), 'a'.repeat(200))).toBeNull();
  });

  it('takes only the first three when a model sends more', () => {
    const raw = JSON.stringify({
      questions: [question(1), question(2), question(3), question(4), question(5)],
    });

    expect(parseQuiz(raw, 'Topic')?.questions).toHaveLength(QUIZ_LENGTH);
  });
});

describe('marking', () => {
  const quiz = parseQuiz(
    JSON.stringify({ questions: [question(1, 0), question(2, 1), question(3, 2)] }),
    'Topic',
  ) as Quiz;

  it('passes only when every answer is right', () => {
    expect(isQuizPassed(quiz, [[0], [1], [2]])).toBe(true);
    expect(isQuizPassed(quiz, [[0], [1], [3]])).toBe(false);
  });

  it('does not pass a partly answered quiz', () => {
    expect(isQuizPassed(quiz, [[0], [1]])).toBe(false);
  });

  it('counts how many were right, so the student knows where they stand', () => {
    expect(countCorrect(quiz, [[0], [1], [3]])).toBe(2);
    expect(countCorrect(quiz, [[3], [3], [3]])).toBe(0);
    expect(countCorrect(quiz, [[0], [1], [2]])).toBe(3);
  });
});

/**
 * A reply captured verbatim from gemini-3.6-flash through the proxy.
 *
 * The constructed cases above all use short, tidy strings. A real reply has
 * multi-sentence questions, apostrophes, ohm signs and LaTeX in the explanation
 * — none of which the hand-written cases exercise.
 */
describe('a quiz as the model actually sends it', () => {
  const REAL = JSON.stringify({
    questions: [
      {
        question:
          'A circuit contains a component connected to a power supply. If the voltage across the component is doubled while its resistance remains constant, what happens to the current passing through it?',
        options: [
          'The current is halved.',
          'The current remains unchanged.',
          'The current doubles.',
          'The current quadruples.',
        ],
        answerIndex: 2,
        explanation:
          "According to Ohm's law, current is directly proportional to voltage when resistance remains constant, so doubling the voltage doubles the current.",
      },
      {
        question:
          'A student plots a Voltage versus Current (V-I) graph for two unknown electrical components. Component X produces a straight line passing through the origin, while Component Y produces a curved line. What does this indicate?',
        options: [
          "Component X obeys Ohm's law because its resistance is constant, whereas Component Y does not.",
          "Component Y obeys Ohm's law because its resistance increases with current, whereas Component X does not.",
          "Both components obey Ohm's law because current increases with voltage in both cases.",
          "Neither component obeys Ohm's law because resistance cannot be determined from a V-I graph.",
        ],
        answerIndex: 0,
        explanation:
          'A constant resistance produces a linear V-I relationship passing through the origin, which is the defining characteristic of an ohmic component.',
      },
      {
        question:
          'A constant 12 V power source is connected across a variable resistor. If the resistance is adjusted from 4 Ω to 12 Ω, how does the current in the circuit change?',
        options: [
          'The current increases from 1 A to 3 A.',
          'The current decreases from 3 A to 1 A.',
          'The current remains constant at 3 A.',
          'The current decreases from 48 A to 1 A.',
        ],
        answerIndex: 1,
        explanation:
          'Using $I = V/R$, increasing the resistance from 4 Ω to 12 Ω reduces the current inversely from 3 A to 1 A.',
      },
    ],
  });

  it('parses', () => {
    const quiz = parseQuiz(REAL, "Ohm's law");

    expect(quiz?.questions).toHaveLength(3);
    expect(quiz?.questions[0]?.options).toHaveLength(4);
  });

  it('keeps the ohm sign and the apostrophes intact', () => {
    const quiz = parseQuiz(REAL, "Ohm's law");

    expect(quiz?.questions[2]?.question).toContain('Ω');
    expect(quiz?.questions[1]?.options[0]).toContain("Ohm's law");
  });

  it('marks it the way a student answering it would be marked', () => {
    const quiz = parseQuiz(REAL, "Ohm's law");
    if (quiz === null) throw new Error('the captured reply should parse');

    expect(isQuizPassed(quiz, [[2], [0], [1]])).toBe(true);
    expect(countCorrect(quiz, [[2], [0], [0]])).toBe(2);
  });
});

/**
 * Every question shows exactly four options, always. A model that offers more is
 * trimmed rather than thrown away — failing the whole quiz over a fifth option
 * loses the other two questions with it.
 */
describe('always exactly four options', () => {
  const withOptions = (options: string[], answerIndex: number | number[]) =>
    JSON.stringify({
      questions: [1, 2, 3].map(() => ({
        question: 'Which one?',
        options,
        ...(Array.isArray(answerIndex) ? { answerIndexes: answerIndex } : { answerIndex }),
        explanation: 'Because.',
      })),
    });

  it('trims a five-option question down to four', () => {
    const quiz = parseQuiz(withOptions(['A', 'B', 'C', 'D', 'E'], 0), 'Topic');

    expect(quiz?.questions[0]?.options).toHaveLength(4);
  });

  it('keeps the correct option when trimming', () => {
    // The fifth option is the correct one, so it cannot simply be dropped.
    const quiz = parseQuiz(withOptions(['A', 'B', 'C', 'D', 'E'], 4), 'Topic');
    const question = quiz?.questions[0];

    expect(question?.options).toHaveLength(4);
    expect(question?.options[question.answerIndexes[0] ?? -1]).toBe('E');
  });

  it('keeps every correct option when several are right', () => {
    const quiz = parseQuiz(withOptions(['A', 'B', 'C', 'D', 'E', 'F'], [1, 5]), 'Topic');
    const question = quiz?.questions[0];

    expect(question?.options).toHaveLength(4);
    const chosen = question?.answerIndexes.map((index) => question.options[index]);
    expect(chosen).toEqual(['B', 'F']);
  });

  it('refuses a question with too few options to trim from', () => {
    expect(parseQuiz(withOptions(['A', 'B', 'C'], 0), 'Topic')).toBeNull();
  });

  it('refuses when there are more correct answers than a question can show', () => {
    expect(parseQuiz(withOptions(['A', 'B', 'C', 'D', 'E'], [0, 1, 2, 3]), 'Topic')).toBeNull();
  });
});

/**
 * A question may have several correct options. The student has to pick exactly
 * that set — partial credit would let them pass by selecting everything.
 */
describe('questions with more than one correct answer', () => {
  const multi = JSON.stringify({
    questions: [
      {
        question: 'Select all that apply. Which are ohmic?',
        options: ['Copper wire', 'Filament lamp', 'Nichrome at constant T', 'Diode'],
        answerIndexes: [0, 2],
        explanation: 'Both keep a constant resistance.',
      },
      {
        question: 'Single answer?',
        options: ['A', 'B', 'C', 'D'],
        answerIndex: 1,
        explanation: 'Because.',
      },
      {
        question: 'Another single?',
        options: ['A', 'B', 'C', 'D'],
        answerIndex: 2,
        explanation: 'Because.',
      },
    ],
  });

  it('reads several correct answers', () => {
    const quiz = parseQuiz(multi, 'Topic');

    expect(quiz?.questions[0]?.answerIndexes).toEqual([0, 2]);
  });

  it('reports which questions expect more than one', () => {
    const quiz = parseQuiz(multi, 'Topic');
    if (quiz === null) throw new Error('expected a quiz');

    expect(isMultipleAnswer(quiz.questions[0] as QuizQuestion)).toBe(true);
    expect(isMultipleAnswer(quiz.questions[1] as QuizQuestion)).toBe(false);
  });

  it('still normalises a single answerIndex to an array', () => {
    const quiz = parseQuiz(multi, 'Topic');

    expect(quiz?.questions[1]?.answerIndexes).toEqual([1]);
  });

  it('marks it right only for the exact set', () => {
    const quiz = parseQuiz(multi, 'Topic');
    if (quiz === null) throw new Error('expected a quiz');
    const question = quiz.questions[0] as QuizQuestion;

    expect(isAnswerCorrect(question, [0, 2])).toBe(true);
    expect(isAnswerCorrect(question, [2, 0])).toBe(true);
  });

  it('counts a missing correct option as wrong', () => {
    const quiz = parseQuiz(multi, 'Topic');
    const question = quiz?.questions[0] as QuizQuestion;

    expect(isAnswerCorrect(question, [0])).toBe(false);
  });

  it('counts selecting everything as wrong', () => {
    // Otherwise a student passes every multi-answer question by ticking all four.
    const quiz = parseQuiz(multi, 'Topic');
    const question = quiz?.questions[0] as QuizQuestion;

    expect(isAnswerCorrect(question, [0, 1, 2, 3])).toBe(false);
  });

  it('counts an unanswered question as wrong rather than crashing', () => {
    const quiz = parseQuiz(multi, 'Topic');
    if (quiz === null) throw new Error('expected a quiz');

    expect(isQuizPassed(quiz, [[], [1], [2]])).toBe(false);
    expect(countCorrect(quiz, [[], [1], [2]])).toBe(2);
  });

  it('refuses a question where every option is correct', () => {
    const raw = JSON.stringify({
      questions: [1, 2, 3].map(() => ({
        question: 'All of them?',
        options: ['A', 'B', 'C', 'D'],
        answerIndexes: [0, 1, 2, 3],
        explanation: 'Because.',
      })),
    });

    expect(parseQuiz(raw, 'Topic')).toBeNull();
  });

  it('refuses an answer list containing something that is not an index', () => {
    const raw = JSON.stringify({
      questions: [1, 2, 3].map(() => ({
        question: 'Which?',
        options: ['A', 'B', 'C', 'D'],
        answerIndexes: [0, 'two'],
        explanation: 'Because.',
      })),
    });

    expect(parseQuiz(raw, 'Topic')).toBeNull();
  });
});
