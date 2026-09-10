import { REVIEW_DELAYS, dueCards, formatCountdown, nextDueAt } from '@preppilot/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppHeader,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Screen,
  Sheet,
  StatChip,
  Text,
  TextField,
} from '../../components/ui';
import { getRepositories } from '../../db/client';
import { useAuthStore } from '../auth/auth-store';
import { useTheme } from '../../theme/theme-context';
import { useFlashcardsStore } from './flashcards-store';
import { useActiveTrackerId } from '../trackers/trackers-store';

/**
 * Flashcards, reviewed on a spaced-repetition schedule.
 *
 * The review loop is deliberately three-step — start studying, see the question
 * and decide, then reveal — because grading yourself after the answer is
 * already visible is not recall, and the schedule is only as good as the
 * honesty of the answer.
 *
 * Studying is something a student starts, not something the screen does to
 * them. Landing straight on a card made the first thing on the deck screen a
 * review nobody had asked to begin.
 */
export function FlashcardsScreen() {
  const theme = useTheme();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const state = useFlashcardsStore();
  const [composing, setComposing] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const activeTracker = useActiveTrackerId();
  const load = useCallback(async () => {
    if (userId === null) return;
    await useFlashcardsStore.getState().load(userId, getRepositories());
    // Re-reads when the courses finish loading and whenever the student switches
    // between them: a read taken before the active course was known would sit on
    // an empty result forever.
  }, [userId, activeTracker]);

  /**
   * Re-reads whenever this screen comes back into view.
   *
   * A plain effect runs once, and tab screens stay mounted — so importing a
   * template from the library and returning here left the old, empty tracker on
   * screen. The import had written to the database; nothing had looked again,
   * which read exactly like the button doing nothing.
   */
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const current = state.queue[0];
  const now = Date.now();
  const due = dueCards(state.cards, now);

  /*
   * "Nothing due right now" read as "there is nothing here", which is the
   * opposite of what a deck on a schedule means. Saying when the next card
   * arrives tells the student the work is waiting, and how long for.
   */
  const soonest = nextDueAt(state.cards);
  const countdown =
    soonest === null
      ? 'Add a card and it will appear here.'
      : `Next card available in ${formatCountdown(soonest - now)}.`;

  const submit = async () => {
    if (front.trim().length === 0 || back.trim().length === 0) {
      setFieldError('A card needs both a question and an answer.');
      return;
    }

    setFieldError(null);
    await state.addCard(front, back);
    setFront('');
    setBack('');
    setComposing(false);
  };

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.base, gap: theme.spacing.base }}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          overline="Spaced repetition"
          title="Flashcards"
          action={<Button label="New card" onPress={() => setComposing(true)} testID="new-card" />}
        />

        {state.error !== null && (
          <ErrorState message={state.error} onRetry={() => void load()} retryLabel="Reload" />
        )}

        <View style={styles.stats}>
          <StatChip label="Due now" value={String(state.queue.length)} testID="cards-due" />
          <StatChip label="Reviewed" value={String(state.reviewedCount)} testID="cards-reviewed" />
          <StatChip label="Total" value={String(state.cards.length)} testID="cards-total" />
        </View>

        {!state.studying ? (
          state.cards.length === 0 ? (
            <EmptyState
              title="No flashcards yet"
              description="Make a card for something worth remembering, and PrepPilot will bring it back before you forget it."
              testID="flashcards-empty"
            />
          ) : (
            <Card testID="study-prompt">
              <Text variant="title">
                {due.length > 0
                  ? `${due.length} ${due.length === 1 ? 'card' : 'cards'} ready`
                  : 'All caught up'}
              </Text>

              <Text variant="small" tone="secondary" style={{ marginTop: theme.spacing.xs }}>
                {due.length > 0
                  ? 'Work through them one at a time, and say how soon you want each one back.'
                  : countdown}
              </Text>

              <View style={{ marginTop: theme.spacing.base }}>
                <Button
                  label="Study cards"
                  fullWidth
                  disabled={due.length === 0}
                  testID="study-cards"
                  onPress={() => state.startStudying()}
                />
              </View>
            </Card>
          )
        ) : current === undefined ? (
          <Card testID="study-finished">
            <Text variant="title">Done for now</Text>
            <Text variant="small" tone="secondary" style={{ marginTop: theme.spacing.xs }}>
              {countdown}
            </Text>
            <View style={{ marginTop: theme.spacing.base }}>
              <Button
                label="Finish"
                fullWidth
                variant="secondary"
                testID="finish-studying"
                onPress={() => state.stopStudying()}
              />
            </View>
          </Card>
        ) : (
          <Card testID="review-card">
            <View style={styles.cardHead}>
              <Text variant="caption" tone="muted" overline style={styles.cardTopic}>
                {current.topicName ?? 'Flashcard'}
              </Text>
              <Text variant="caption" tone="muted" testID="card-position">
                {state.reviewedCount + 1} of {state.reviewedCount + state.queue.length}
              </Text>
            </View>

            {/*
              The question is given room and centred: this is the only thing on
              screen the student is meant to be thinking about.
            */}
            <View style={styles.face}>
              <Text variant="title" style={styles.faceText}>
                {current.front}
              </Text>
            </View>

            {state.revealed ? (
              <View style={{ gap: theme.spacing.base }}>
                <View
                  style={{
                    height: StyleSheet.hairlineWidth,
                    backgroundColor: theme.colors.border,
                  }}
                />

                <View style={styles.face}>
                  <Text variant="body" tone="secondary" testID="card-back" style={styles.faceText}>
                    {current.back}
                  </Text>
                </View>

                <Text variant="caption" tone="muted">
                  When should this come back?
                </Text>

                <View style={styles.ratings}>
                  {REVIEW_DELAYS.map((option) => (
                    <Pressable
                      key={option.key}
                      accessibilityRole="button"
                      accessibilityLabel={`Review ${option.description}`}
                      testID={`review-${option.key}`}
                      onPress={() => void state.rate(option.key)}
                      style={[
                        styles.rating,
                        {
                          borderColor: theme.colors.border,
                          borderRadius: theme.radius.md,
                          paddingVertical: theme.spacing.sm,
                          minHeight: theme.minTouchTarget,
                          backgroundColor:
                            option.key === '5m'
                              ? theme.colors.surfaceElevated
                              : theme.colors.surface,
                        },
                      ]}
                    >
                      <Text variant="body" weight="semibold">
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <View style={{ gap: theme.spacing.sm }}>
                <Button
                  label="Show answer"
                  fullWidth
                  onPress={() => state.reveal()}
                  testID="show-answer"
                />
                <Button
                  label="Finish studying"
                  variant="ghost"
                  fullWidth
                  testID="stop-studying"
                  onPress={() => state.stopStudying()}
                />
              </View>
            )}
          </Card>
        )}

        {state.cards.length > 0 && (
          <Card>
            <Text variant="caption" tone="muted" overline>
              All Cards
            </Text>
            <View style={{ marginTop: theme.spacing.sm, gap: theme.spacing.sm }}>
              {state.cards.map((card) => (
                <View key={card.id} style={styles.listRow}>
                  <View style={styles.listText}>
                    <Text variant="small" numberOfLines={1}>
                      {card.front}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {card.dueAt <= now ? 'Due now' : `In ${formatCountdown(card.dueAt - now)}`}
                      {card.lapses > 0
                        ? ` · ${card.lapses} lapse${card.lapses === 1 ? '' : 's'}`
                        : ''}
                    </Text>
                  </View>
                  <Button
                    label="Delete"
                    variant="ghost"
                    size="small"
                    onPress={() => void state.deleteCard(card.id)}
                  />
                </View>
              ))}
            </View>
          </Card>
        )}
      </ScrollView>

      <Sheet visible={composing} onDismiss={() => setComposing(false)} label="New flashcard">
        <Text variant="title">New flashcard</Text>

        <TextField
          label="Question"
          value={front}
          onChangeText={setFront}
          placeholder="e.g. State Ohm's law"
          {...(fieldError !== null ? { error: fieldError } : {})}
        />
        <TextField
          label="Answer"
          value={back}
          onChangeText={setBack}
          placeholder="e.g. V = IR"
          multiline
        />

        <View style={styles.actions}>
          <Button label="Cancel" variant="ghost" onPress={() => setComposing(false)} />
          <Button label="Add card" onPress={() => void submit()} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 24 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTopic: { flex: 1 },
  face: { minHeight: 96, justifyContent: 'center', paddingVertical: 12 },
  faceText: { textAlign: 'center' },
  ratings: { flexDirection: 'row', gap: 8 },
  rating: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listText: { flex: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
