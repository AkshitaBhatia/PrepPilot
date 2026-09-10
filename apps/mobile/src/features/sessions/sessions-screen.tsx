import { formatCompactDuration } from '@preppilot/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import {
  AppHeader,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  Sheet,
  StatChip,
  Text,
} from '../../components/ui';
import { getRepositories } from '../../db/client';
import { emptyStateCopy } from '../../constants/copy';
import { useAuthStore } from '../auth/auth-store';
import { useTheme } from '../../theme/theme-context';
import { SubjectProgressList } from '../dashboard/components/subject-progress-list';
import { WeekChart } from '../dashboard/components/week-chart';
import { useDashboardStore } from '../dashboard/dashboard-store';
import { SessionRow } from '../history/components/session-row';
import { useHistoryStore } from '../history/history-store';

/**
 * Study sessions, and what they add up to.
 *
 * This is the fourth tab, replacing separate Dashboard and History destinations.
 * They were answering one question between them — "how much have I actually
 * done" — and splitting it meant the totals lived on one screen and the sessions
 * behind them on another.
 */
export function SessionsScreen() {
  const theme = useTheme();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const dashboard = useDashboardStore();
  const history = useHistoryStore();
  const [refreshing, setRefreshing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (userId === null) return;
    const repositories = getRepositories();
    await Promise.all([
      useDashboardStore.getState().load(userId, repositories),
      useHistoryStore.getState().load(userId, repositories),
    ]);
  }, [userId]);

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

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  // A session that was interrupted still counts as time studied, but it is not
  // a session the student finished — so the two are reported separately rather
  // than one number standing for both.
  const finished = history.sessions.filter((session) => session.status === 'completed').length;
  const unfinished = history.sessions.length - finished;

  if (dashboard.loading && history.sessions.length === 0) {
    return (
      <Screen>
        <LoadingState label="Loading your study sessions" />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={history.sessions}
        keyExtractor={(session) => session.id}
        renderItem={({ item }) => (
          <SessionRow session={item} onDelete={(id) => setPendingDelete(id)} />
        )}
        contentContainerStyle={{ padding: theme.spacing.base, gap: theme.spacing.sm }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
        }
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.base, marginBottom: theme.spacing.sm }}>
            <AppHeader overline="Your study time" title="Sessions" />

            {(dashboard.error ?? history.error) !== null && (
              <ErrorState
                message={dashboard.error ?? history.error ?? ''}
                onRetry={() => void load()}
                retryLabel="Reload"
              />
            )}

            <View style={styles.stats}>
              <StatChip label="Finished" value={String(finished)} testID="sessions-finished" />
              <StatChip
                label="Unfinished"
                value={String(unfinished)}
                testID="sessions-unfinished"
              />
              <StatChip
                label="Total studied"
                value={formatCompactDuration(dashboard.totalSeconds)}
                testID="sessions-total"
              />
            </View>

            <View style={styles.stats}>
              <StatChip
                label="Today"
                value={formatCompactDuration(dashboard.todaySeconds)}
                testID="sessions-today"
              />
              <StatChip
                label="Streak"
                value={`${dashboard.streakDays} ${dashboard.streakDays === 1 ? 'day' : 'days'}`}
                testID="sessions-streak"
              />
            </View>

            <WeekChart days={dashboard.lastSevenDays} />
            <SubjectProgressList subjects={dashboard.subjectProgress} />

            {/*
              Focus Mode had a route and a screen but nothing anywhere linked to
              it, so it existed only for anyone who guessed the URL.
            */}
            <Card>
              <Text variant="caption" tone="muted" overline>
                Focus Mode
              </Text>
              <Text variant="small" tone="secondary" style={{ marginTop: theme.spacing.xs }}>
                A countdown with the screen kept awake and everything else out of the way.
              </Text>
              <View style={{ marginTop: theme.spacing.md }}>
                <Button
                  label="Start a focus session"
                  variant="secondary"
                  testID="open-focus"
                  onPress={() => router.push('/focus')}
                />
              </View>
            </Card>

            <Card>
              <Text variant="caption" tone="muted" overline>
                Reminders
              </Text>
              <Text variant="small" tone="secondary" style={{ marginTop: theme.spacing.xs }}>
                Nudge yourself to sit down at a time you choose.
              </Text>
              <View style={{ marginTop: theme.spacing.md }}>
                <Button
                  label="Open reminders"
                  variant="secondary"
                  testID="open-reminders"
                  onPress={() => router.push('/reminders')}
                />
              </View>
            </Card>

            {history.sessions.length > 0 && (
              <Text variant="caption" tone="muted" overline>
                Every Session
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={<EmptyState {...emptyStateCopy.history} testID="sessions-empty" />}
        showsVerticalScrollIndicator={false}
      />

      {/*
        Confirmed rather than immediate: deleting a session reduces total study
        time, a figure a student has watched grow, and there is no undo.
      */}
      <Sheet
        visible={pendingDelete !== null}
        onDismiss={() => setPendingDelete(null)}
        label="Delete this session"
      >
        <Text variant="title">Delete this session?</Text>
        <Text variant="small" tone="secondary">
          It will be removed from your history and its time taken off your total. This cannot be
          undone.
        </Text>

        <View style={styles.actions}>
          <Button label="Cancel" variant="ghost" onPress={() => setPendingDelete(null)} />
          <Button
            label="Delete"
            variant="danger"
            onPress={() => {
              const id = pendingDelete;
              setPendingDelete(null);
              if (id !== null) void history.deleteSession(id);
            }}
          />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 24 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
