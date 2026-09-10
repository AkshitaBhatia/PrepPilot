import {
  QUIZ_LENGTH,
  countCorrect,
  isAnswerCorrect,
  isMultipleAnswer,
  isQuizPassed,
  type Quiz,
} from '@preppilot/shared';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, PressableScale, Sheet, Text } from '../../../components/ui';
import { ariaState } from '../../../components/ui/aria';
import { useTheme } from '../../../theme/theme-context';

export interface TopicQuizProps {
  readonly visible: boolean;
  readonly quiz: Quiz;
  readonly onDismiss: () => void;
  /** Called with whether every answer was right. */
  readonly onFinish: (passed: boolean) => void;
}

/**
 * Three questions about one topic, one at a time.
 *
 * Sequential rather than all at once: three questions with four options each did
 * not fit the sheet, and a wall of twelve choices is not how anyone reads a
 * question. Each is answered, checked and explained before the next appears.
 *
 * A checked question is locked. Going back shows what was answered and why it
 * was right or wrong, but cannot be changed — a score that can be revised after
 * seeing the answer is not a score.
 *
 * Passing offers to mark the topic complete. Failing does not block anything: a
 * student can still tick it themselves (D55). The check is a way to find out
 * whether you understood it, not a gate you have to beat.
 */
export function TopicQuiz({ visible, quiz, onDismiss, onFinish }: TopicQuizProps) {
  const theme = useTheme();
  const total = quiz.questions.length;

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<readonly (readonly number[])[]>(
    quiz.questions.map(() => []),
  );
  const [checked, setChecked] = useState<readonly boolean[]>(quiz.questions.map(() => false));
  const [showingResults, setShowingResults] = useState(false);

  const question = quiz.questions[index];
  const selected = answers[index] ?? [];
  const isChecked = checked[index] === true;
  const multiple = question !== undefined && isMultipleAnswer(question);
  const allChecked = checked.every(Boolean);
  const correct = countCorrect(quiz, answers);
  const passed = isQuizPassed(quiz, answers);

  if (question === undefined) return null;

  const toggle = (option: number) => {
    if (isChecked) return;

    setAnswers((current) =>
      current.map((entry, position) => {
        if (position !== index) return entry;
        // Several correct answers means several selections; one means the tap
        // replaces whatever was chosen before, as a radio button would.
        if (!multiple) return [option];
        return entry.includes(option)
          ? entry.filter((value) => value !== option)
          : [...entry, option];
      }),
    );
  };

  const check = () =>
    setChecked((current) => current.map((was, at) => (at === index ? true : was)));

  const answeredThis = selected.length > 0;
  const thisWasRight = isChecked && isAnswerCorrect(question, selected);

  return (
    <Sheet visible={visible} onDismiss={onDismiss} label={`Questions on ${quiz.topicName}`}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="caption" tone="muted" overline>
            {showingResults ? 'How you did' : `Question ${index + 1} of ${total}`}
          </Text>
          <Text variant="title" numberOfLines={2}>
            {quiz.topicName}
          </Text>
        </View>

        {/* Where you are, at a glance: filled for checked, outlined for the rest. */}
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Questions answered"
          accessibilityValue={{ min: 0, max: total, now: checked.filter(Boolean).length }}
          style={styles.dots}
        >
          {quiz.questions.map((entry, position) => (
            <View
              key={entry.question}
              style={[
                styles.dot,
                {
                  backgroundColor: checked[position] ? theme.colors.accent : 'transparent',
                  borderColor:
                    position === index && !showingResults
                      ? theme.colors.accent
                      : theme.colors.border,
                },
              ]}
            />
          ))}
        </View>
      </View>

      {/*
        Scrollable, and capped by the sheet. A long question with four long
        options is taller than the sheet allows, and without this the end of it
        was simply cut off the bottom of the screen.
      */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={{ gap: theme.spacing.md, paddingBottom: theme.spacing.sm }}
        showsVerticalScrollIndicator={false}
      >
        {showingResults ? (
          <View style={{ gap: theme.spacing.md }}>
            <View
              accessible
              accessibilityRole="alert"
              testID="quiz-outcome"
              style={[
                styles.outcome,
                {
                  backgroundColor: theme.colors.surfaceElevated,
                  borderRadius: theme.radius.md,
                  padding: theme.spacing.md,
                  borderLeftColor: passed ? theme.colors.success : theme.colors.danger,
                },
              ]}
            >
              <Text variant="body" weight="semibold">
                {passed ? 'All three right.' : `${correct} of ${QUIZ_LENGTH} right.`}
              </Text>
              <Text variant="small" tone="secondary" style={{ marginTop: theme.spacing.xxs }}>
                {passed
                  ? 'That is a good sign you have this one.'
                  : 'Worth another look before you tick it off.'}
              </Text>
            </View>

            {quiz.questions.map((entry, position) => (
              <View key={entry.question} style={{ gap: theme.spacing.xxs }}>
                <Text variant="small" weight="semibold">
                  {isAnswerCorrect(entry, answers[position] ?? []) ? '✓' : '✗'} {position + 1}.{' '}
                  {entry.question}
                </Text>
                <Text variant="caption" tone="secondary">
                  {entry.explanation}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <>
            <View style={{ gap: theme.spacing.xxs }}>
              {multiple && (
                <Text variant="caption" tone="accent" testID="multi-answer-hint">
                  More than one answer is correct.
                </Text>
              )}
              <Text variant="body" weight="semibold">
                {question.question}
              </Text>
            </View>

            {question.options.map((option, optionIndex) => {
              const chosen = selected.includes(optionIndex);
              const isAnswer = question.answerIndexes.includes(optionIndex);
              const border = !isChecked
                ? chosen
                  ? theme.colors.accent
                  : theme.colors.border
                : isAnswer
                  ? theme.colors.success
                  : chosen
                    ? theme.colors.danger
                    : theme.colors.border;

              return (
                <PressableScale
                  key={option}
                  accessibilityRole={multiple ? 'checkbox' : 'radio'}
                  accessibilityLabel={option}
                  accessibilityState={{ checked: chosen, disabled: isChecked }}
                  {...ariaState({ checked: chosen, disabled: isChecked })}
                  disabled={isChecked}
                  testID={`q${index}-option${optionIndex}`}
                  onPress={() => toggle(optionIndex)}
                  style={[
                    styles.option,
                    {
                      borderColor: border,
                      borderRadius: theme.radius.md,
                      padding: theme.spacing.md,
                      minHeight: theme.minTouchTarget,
                    },
                  ]}
                >
                  <Text
                    variant="small"
                    tone={isChecked && !isAnswer && !chosen ? 'muted' : 'primary'}
                    style={styles.optionText}
                  >
                    {option}
                  </Text>
                </PressableScale>
              );
            })}

            {isChecked && (
              <View
                accessible
                accessibilityRole="alert"
                testID={`q${index}-feedback`}
                style={[
                  styles.outcome,
                  {
                    backgroundColor: theme.colors.surfaceElevated,
                    borderRadius: theme.radius.md,
                    padding: theme.spacing.md,
                    borderLeftColor: thisWasRight ? theme.colors.success : theme.colors.danger,
                  },
                ]}
              >
                <Text variant="small" weight="semibold">
                  {thisWasRight ? 'Correct.' : 'Not quite.'}
                </Text>
                {question.explanation.length > 0 && (
                  <Text variant="caption" tone="secondary" style={{ marginTop: theme.spacing.xxs }}>
                    {question.explanation}
                  </Text>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <View style={styles.actions}>
        {showingResults ? (
          <>
            <Button
              label="Back"
              variant="ghost"
              testID="quiz-back-to-questions"
              onPress={() => setShowingResults(false)}
            />
            <Button
              label={passed ? 'Mark complete' : 'Review it'}
              variant={passed ? 'primary' : 'secondary'}
              testID="quiz-finish"
              onPress={() => onFinish(passed)}
            />
          </>
        ) : (
          <>
            <Button
              label="Back"
              variant="ghost"
              disabled={index === 0}
              testID="quiz-previous"
              onPress={() => setIndex((current) => Math.max(0, current - 1))}
            />

            {isChecked ? (
              index === total - 1 ? (
                <Button
                  label={allChecked ? 'See how you did' : 'Finish'}
                  testID="quiz-results"
                  onPress={() => setShowingResults(true)}
                />
              ) : (
                <Button
                  label="Next question"
                  testID="quiz-next"
                  onPress={() => setIndex((current) => Math.min(total - 1, current + 1))}
                />
              )
            ) : (
              <Button
                label="Check answer"
                disabled={!answeredThis}
                testID="quiz-check"
                onPress={check}
              />
            )}
          </>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerText: { flex: 1 },
  dots: { flexDirection: 'row', gap: 6, paddingTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1 },
  // Capped so a long question scrolls inside the sheet rather than past it.
  body: { maxHeight: 380 },
  outcome: { borderLeftWidth: 3 },
  option: { borderWidth: 1, justifyContent: 'center' },
  // Wraps rather than running off the edge of its own box.
  optionText: { flexShrink: 1 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
});
