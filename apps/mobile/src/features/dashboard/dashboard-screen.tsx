import {
  accentForIndex,
  formatCompactDuration,
  formatHoursMinutes,
  formatPercent,
} from '@preppilot/shared';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Card, EmptyState, ErrorState, FadeIn, Screen, Text } from '../../components/ui';
import { getRepositories } from '../../db/client';
import { useAuthStore } from '../auth/auth-store';
import { useTheme } from '../../theme/theme-context';
import { SessionRow } from '../history/components/session-row';
import { StatGrid } from './components/stat-grid';
import { SubjectProgressList } from './components/subject-progress-list';
import { WeekChart } from './components/week-chart';
import { useDashboardStore } from './dashboard-store';
import { useActiveTrackerId } from '../trackers/trackers-store';

/** Dashboard — the figures PRD §12 requires, all derived from one read. */
export function DashboardScreen() {
  const theme = useTheme();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const state = useDashboardStore();
  const [refreshing, setRefreshing] = useState(false);

  const activeTracker = useActiveTrackerId();
  const load = useCallback(async () => {
    if (userId === null) return;
    await useDashboardStore.getState().load(userId, getRepositories());
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

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.base, gap: theme.spacing.base }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text variant="caption" tone="muted" overline>
            Your progress
          </Text>
          <Text variant="heading" style={{ marginTop: theme.spacing.xxs }}>
            Dashboard
          </Text>
        </View>

        {state.error !== null && (
          <ErrorState message={state.error} onRetry={() => void load()} retryLabel="Reload" />
        )}

        <StatGrid
          stats={[
            {
              label: 'Completed',
              value: formatPercent(state.overall, { precision: 2 }),
              testID: 'dashboard-overall',
              tone: 'accent',
            },
            {
              label: 'Today',
              value: formatHoursMinutes(state.todaySeconds),
              testID: 'dashboard-today',
            },
            {
              label: 'Total studied',
              value: formatCompactDuration(state.totalSeconds),
              testID: 'dashboard-total',
            },
            {
              label: 'Streak',
              value: state.streakDays === 1 ? '1 day' : `${state.streakDays} days`,
              testID: 'dashboard-streak',
            },
          ]}
        />

        <SubjectProgressList subjects={state.subjectProgress} />

        <WeekChart days={state.lastSevenDays} />

        {state.bySubject.length > 0 && (
          <Card>
            <Text variant="caption" tone="muted" overline>
              Time By Subject
            </Text>
            <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
              {state.bySubject.slice(0, 5).map((subject, index) => (
                <View key={subject.subjectId} style={styles.subjectRow}>
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: accentForIndex(index),
                    }}
                  />
                  <Text variant="body" style={styles.subjectName} numberOfLines={1}>
                    {subject.subjectName}
                  </Text>
                  <Text variant="small" tone="secondary">
                    {formatHoursMinutes(subject.seconds)}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="caption" tone="muted" overline>
            Recent Sessions
          </Text>
          {state.recentSessions.length === 0 ? (
            <Card padded={false}>
              <EmptyState
                title="No study sessions yet"
                description="Start a timer to begin building your study history."
                testID="dashboard-no-sessions"
              />
            </Card>
          ) : (
            state.recentSessions.map((session) => <SessionRow key={session.id} session={session} />)
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  subjectRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subjectName: { flex: 1 },
});
