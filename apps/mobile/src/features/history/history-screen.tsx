import { formatCompactDuration } from '@preppilot/shared';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import {
  Button,
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
import { SessionRow } from './components/session-row';
import { useHistoryStore } from './history-store';
import { useActiveTrackerId } from '../trackers/trackers-store';

/** Study history — what was studied, when, and for how long (PRD §12). */
export function HistoryScreen() {
  const theme = useTheme();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const state = useHistoryStore();
  const [refreshing, setRefreshing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const activeTracker = useActiveTrackerId();
  const load = useCallback(async () => {
    if (userId === null) return;
    await useHistoryStore.getState().load(userId, getRepositories());
    // Re-reads when the courses finish loading and whenever the student switches
    // between them: a read taken before the active course was known would sit on
    // an empty result forever.
  }, [userId, activeTracker]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  if (state.loading && state.sessions.length === 0) {
    return (
      <Screen>
        <LoadingState label="Loading your study history" />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={state.sessions}
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
            <Text variant="heading">History</Text>

            {state.error !== null && (
              <ErrorState message={state.error} onRetry={() => void load()} retryLabel="Reload" />
            )}

            <View style={styles.stats}>
              <StatChip
                label="Total studied"
                value={formatCompactDuration(state.totalSeconds)}
                testID="history-total"
              />
              <StatChip
                label="Sessions"
                value={String(state.sessions.length)}
                testID="history-count"
              />
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState {...emptyStateCopy.history} testID="history-empty" />}
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
              if (id !== null) void state.deleteSession(id);
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
