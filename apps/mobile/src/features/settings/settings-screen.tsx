import { formatCompactDuration } from '@preppilot/shared';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Screen, Sheet, StatChip, Text, TextField } from '../../components/ui';
import { isDemoMode } from '../../config/env';
import { getRepositories } from '../../db/client';
import { deleteRemoteAccount } from './delete-account';
import { useAuthStore } from '../auth/auth-store';
import { SyncStatusCard } from '../sync/components/sync-status';
import { useTheme, useThemeContext } from '../../theme/theme-context';

/** The word a student must type to confirm deletion. */
const DELETE_CONFIRMATION = 'DELETE';

/**
 * Profile and settings (PRD §20, screens 22 and 23).
 *
 * Account deletion is the consequential part. PRD §8 requires a student be able
 * to delete their account and its data. The device copy is tombstoned here; the
 * account itself is removed by the `delete-account` Edge Function, which holds
 * the service-role key the client must never have (D28).
 *
 * The device is cleared first. If the server call then fails, the student is
 * told plainly that the account still exists — reporting a success that did not
 * happen would leave them believing their data was gone when it was not.
 */
/** Dark and Light pin a mode; null follows whatever the device is set to. */
const THEME_CHOICES = [
  { label: 'Dark', mode: 'dark' as const },
  { label: 'Light', mode: 'light' as const },
  { label: 'Match device', mode: null },
];

export function SettingsScreen() {
  const theme = useTheme();
  const { setMode, followsDevice } = useThemeContext();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  const [totalSeconds, setTotalSeconds] = useState(0);
  const [subjectCount, setSubjectCount] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    if (user === null) return;

    void (async () => {
      try {
        const repositories = getRepositories();
        setTotalSeconds(await repositories.sessions.totalSecondsForUser(user.id));
        setSubjectCount((await repositories.subjects.listByUser(user.id)).length);
      } catch {
        // A failed statistic is not worth an error banner on a settings screen.
      }
    })();
  }, [user]);

  const deleteEverything = async () => {
    if (user === null) return;

    setDeleting(true);
    try {
      const repositories = getRepositories();

      // Tombstone everything the student owns before asking the server to remove
      // the account. Doing it in this order means a failure leaves the device
      // clear and the account intact — recoverable by retrying — rather than the
      // account gone and the data still sitting on the phone.
      const subjects = await repositories.subjects.listByUser(user.id);
      for (const subject of subjects) await repositories.subjects.softDelete(subject.id);

      const sessions = await repositories.sessions.listByUser(user.id, 1000);
      for (const session of sessions) await repositories.sessions.softDelete(session.id);

      const reminders = await repositories.reminders.listByUser(user.id);
      for (const reminder of reminders) await repositories.reminders.softDelete(reminder.id);

      const remote = await deleteRemoteAccount();
      setConfirming(false);
      setOutcome(
        remote.kind === 'deleted'
          ? 'Your account and everything in it have been deleted.'
          : remote.kind === 'localOnly'
            ? 'Everything on this device has been deleted. A demo session has no account on the server.'
            : remote.message,
      );
      await signOut();
    } catch {
      setOutcome('We could not delete your data. Try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.base, gap: theme.spacing.base }}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="heading">Settings</Text>

        <Card>
          <Text variant="caption" tone="muted" overline>
            Account
          </Text>
          <Text variant="body" style={{ marginTop: theme.spacing.sm }}>
            {user?.email ?? 'Not signed in'}
          </Text>
          {isDemoMode() && (
            <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xxs }}>
              This is a demo session. Nothing here is synced to an account.
            </Text>
          )}
        </Card>

        <View style={[styles.stats, { gap: theme.spacing.xl }]}>
          <StatChip
            label="Total studied"
            value={formatCompactDuration(totalSeconds)}
            testID="settings-total"
          />
          <StatChip label="Subjects" value={String(subjectCount)} testID="settings-subjects" />
        </View>

        <SyncStatusCard userId={user?.id ?? null} />

        <Card>
          <Text variant="caption" tone="muted" overline>
            Appearance
          </Text>
          <View style={[styles.row, { marginTop: theme.spacing.md, gap: theme.spacing.sm }]}>
            {/*
              A segmented control has to show which segment is on. Dark and Light
              were both fixed as "secondary", so choosing one changed the app's
              colours but left the control looking untouched — and on a light
              device, "Light" and "Match device" then looked identical with no way
              to tell which was actually chosen.
            */}
            {THEME_CHOICES.map((choice) => {
              const active = followsDevice ? choice.mode === null : choice.mode === theme.mode;

              return (
                <Button
                  key={choice.label}
                  label={choice.label}
                  size="small"
                  variant={active ? 'primary' : 'secondary'}
                  selected={active}
                  onPress={() => setMode(choice.mode)}
                />
              );
            })}
          </View>
        </Card>

        {outcome !== null && (
          <Card testID="delete-outcome">
            <Text variant="small" accessibilityRole="alert">
              {outcome}
            </Text>
          </Card>
        )}

        <Card>
          <Text variant="caption" tone="muted" overline>
            Sign Out
          </Text>
          <View style={{ marginTop: theme.spacing.md }}>
            <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
          </View>
        </Card>

        <Card>
          <Text variant="small" tone="danger" weight="semibold">
            DELETE ACCOUNT
          </Text>
          <Text variant="small" tone="secondary" style={{ marginTop: theme.spacing.sm }}>
            This removes your syllabus, study history and reminders from this device. It cannot be
            undone.
          </Text>
          {/*
            Saying what this does not do matters more than what it does. Claiming
            a full account deletion that never reached the server would be worse
            than admitting the gap.
          */}
          <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
            Removing your account from the server is not built yet — it needs a server-side step
            that does not exist.
          </Text>
          <View style={{ marginTop: theme.spacing.md }}>
            <Button
              label="Delete my data"
              variant="danger"
              onPress={() => {
                setConfirmation('');
                setOutcome(null);
                setConfirming(true);
              }}
            />
          </View>
        </Card>
      </ScrollView>

      <Sheet visible={confirming} onDismiss={() => setConfirming(false)} label="Delete your data">
        <Text variant="title">Delete your data?</Text>
        <Text variant="small" tone="secondary">
          Your syllabus, study history and reminders will be removed from this device. This cannot
          be undone.
        </Text>

        {/*
          A typed confirmation rather than a second button: destroying months of
          study history should take more than two taps in the same place.
        */}
        <TextField
          label={`Type ${DELETE_CONFIRMATION} to confirm`}
          value={confirmation}
          onChangeText={setConfirmation}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={DELETE_CONFIRMATION}
        />

        <View style={styles.actions}>
          <Button label="Cancel" variant="ghost" onPress={() => setConfirming(false)} />
          <Button
            label="Delete"
            variant="danger"
            loading={deleting}
            disabled={confirmation.trim() !== DELETE_CONFIRMATION}
            onPress={() => void deleteEverything()}
          />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  stats: { flexDirection: 'row' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
