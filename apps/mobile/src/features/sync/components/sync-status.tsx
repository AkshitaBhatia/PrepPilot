import { StyleSheet, View } from 'react-native';
import { Button, Card, Text } from '../../../components/ui';
import { isDemoMode } from '../../../config/env';
import { useTheme } from '../../../theme/theme-context';
import { useSyncStore } from '../sync-store';

export interface SyncStatusProps {
  readonly userId: string | null;
}

/**
 * Sync state, shown in Settings.
 *
 * Says plainly what is true: work is saved locally regardless, and syncing is
 * what makes it survive a lost phone. A failure is therefore information, not an
 * alarm — nothing has been lost.
 */
export function SyncStatusCard({ userId }: SyncStatusProps) {
  const theme = useTheme();
  const state = useSyncStore();

  if (isDemoMode()) {
    return (
      <Card testID="sync-status">
        <Text variant="caption" tone="muted" overline>
          Sync
        </Text>
        <Text variant="small" tone="secondary" style={{ marginTop: theme.spacing.sm }}>
          Demo sessions are stored on this device only and never sync.
        </Text>
      </Card>
    );
  }

  return (
    <Card testID="sync-status">
      <Text variant="caption" tone="muted" overline>
        Sync
      </Text>

      <Text variant="small" tone="secondary" style={{ marginTop: theme.spacing.sm }}>
        {describeState(state.status, state.lastSyncedAt)}
      </Text>

      {state.error !== null && (
        <Text
          variant="small"
          tone="danger"
          accessibilityRole="alert"
          style={{ marginTop: theme.spacing.sm }}
        >
          {state.error}
        </Text>
      )}

      <View style={[styles.actions, { marginTop: theme.spacing.md }]}>
        <Button
          label={state.status === 'syncing' ? 'Syncing' : 'Sync now'}
          size="small"
          variant="secondary"
          loading={state.status === 'syncing'}
          disabled={userId === null}
          onPress={() => {
            if (userId !== null) void useSyncStore.getState().syncNow(userId);
          }}
        />
      </View>
    </Card>
  );
}

export function describeState(status: string, lastSyncedAt: number | null): string {
  if (status === 'syncing') return 'Syncing your work with the server…';
  if (lastSyncedAt === null) return 'Not synced yet. Your work is saved on this device.';

  return `Last synced ${formatRelative(lastSyncedAt)}. Your work is saved on this device either way.`;
}

/** Relative time, because "3 minutes ago" answers the question a timestamp does not. */
export function formatRelative(timestampMs: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - timestampMs) / 1000));

  if (seconds < 60) return 'just now';
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  }
  if (seconds < 86_400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }

  const days = Math.floor(seconds / 86_400);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row' },
});
