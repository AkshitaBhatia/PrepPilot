import { accentForIndex, formatHoursMinutes, formatPercent, makeProgress } from '@preppilot/shared';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  LoadingState,
  PlayButton,
  ProgressBar,
  ProgressRing,
  Screen,
  StatChip,
  Text,
  TextField,
} from '../../components/ui';
import { emptyStateCopy } from '../../constants/copy';
import { useAuthStore } from '../../features/auth/auth-store';
import { useTheme, useThemeContext } from '../../theme/theme-context';

/**
 * Design-system gallery.
 *
 * Renders every primitive in one place so the design system can be reviewed on a
 * device. Not linked from the app: reachable at /design-system for development.
 */
export default function DesignSystemScreen() {
  const theme = useTheme();
  const { setMode, followsDevice } = useThemeContext();
  const signOut = useAuthStore((state) => state.signOut);
  const userEmail = useAuthStore((state) => state.user?.email ?? null);
  const [checked, setChecked] = useState<Record<string, boolean>>({ decimal: true, real: false });
  const [subjectName, setSubjectName] = useState('');

  const completedCount = Object.values(checked).filter(Boolean).length;
  const chapterProgress = makeProgress(completedCount, 2);
  const subjectProgress = makeProgress(3, 10);
  const emptyProgress = makeProgress(0, 0);

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.base, gap: theme.spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text variant="heading">PrepPilot</Text>
          <Text variant="small" tone="muted">
            Design system · {theme.mode} {followsDevice ? '(following device)' : '(manual)'}
          </Text>
        </View>

        <View style={styles.row}>
          <StatChip label="Completed" value={formatPercent(subjectProgress, { precision: 2 })} />
          <StatChip label="Time Spent" value={formatHoursMinutes(72_660)} />
          <StatChip label="Parts Done" value="3/10" />
        </View>

        <Section title="Subject card">
          <Card>
            <View style={styles.subjectRow}>
              <ProgressRing
                progress={subjectProgress}
                label="Mathematics"
                color={accentForIndex(0)}
              />
              <View style={styles.subjectMeta}>
                <Text variant="bodyLarge" weight="semibold">
                  Mathematics
                </Text>
                <Text variant="small" tone="secondary">
                  {formatHoursMinutes(14_400)}
                </Text>
              </View>
              <PlayButton label="Mathematics" color={accentForIndex(0)} onPress={() => {}} />
            </View>
          </Card>
        </Section>

        <Section title="Chapter and topics">
          <Card>
            <Text variant="body" weight="medium">
              Chapter 1: Number Systems
            </Text>
            <View style={styles.barRow}>
              <ProgressBar
                progress={chapterProgress}
                label="Chapter 1: Number Systems"
                style={styles.bar}
              />
              <Text variant="small" tone="secondary">
                {formatPercent(chapterProgress, { precision: 1 })}
              </Text>
            </View>

            <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.base }}>
              <TopicRow
                name="Decimal"
                checked={checked.decimal ?? false}
                onToggle={(next) => setChecked((prev) => ({ ...prev, decimal: next }))}
              />
              <TopicRow
                name="Real Number"
                checked={checked.real ?? false}
                onToggle={(next) => setChecked((prev) => ({ ...prev, real: next }))}
              />
            </View>

            <View style={{ marginTop: theme.spacing.base }}>
              <Button label="Add New Topic" variant="outline" fullWidth onPress={() => {}} />
            </View>
          </Card>
        </Section>

        <Section title="Empty progress renders an em dash, never 0%">
          <Card>
            <View style={styles.barRow}>
              <ProgressBar
                progress={emptyProgress}
                label="Chapter 4: Lines and Angles"
                style={styles.bar}
              />
              <Text variant="small" tone="muted">
                {formatPercent(emptyProgress)}
              </Text>
            </View>
          </Card>
        </Section>

        <Section title="Buttons">
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            <Button label="Primary" onPress={() => {}} />
            <Button label="Secondary" variant="secondary" onPress={() => {}} />
            <Button label="Outline" variant="outline" onPress={() => {}} />
            <Button label="Ghost" variant="ghost" onPress={() => {}} />
            <Button label="Loading" loading onPress={() => {}} />
            <Button label="Disabled" disabled onPress={() => {}} />
          </View>
        </Section>

        <Section title="Input">
          <TextField
            label="Subject name"
            required
            value={subjectName}
            onChangeText={setSubjectName}
            placeholder="e.g. Mathematics"
            hint="You can rename this later."
          />
        </Section>

        <Section title="States">
          <Card padded={false}>
            <EmptyState {...emptyStateCopy.tracker} actionLabel="Add subject" onAction={() => {}} />
          </Card>
          <Card padded={false}>
            <LoadingState label="Loading your syllabus" />
          </Card>
          <Card padded={false}>
            <ErrorState
              message="We could not load your syllabus. Check your connection and try again."
              onRetry={() => {}}
            />
          </Card>
        </Section>

        <Section title="Theme">
          <View style={styles.row}>
            <Button label="Dark" variant="secondary" onPress={() => setMode('dark')} />
            <Button label="Light" variant="secondary" onPress={() => setMode('light')} />
            <Button label="Device" variant="ghost" onPress={() => setMode(null)} />
          </View>
        </Section>

        <Section title="Account">
          {userEmail !== null && (
            <Text variant="small" tone="secondary">
              Signed in as {userEmail}
            </Text>
          )}
          <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
        </Section>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }}>
      <Text variant="small" tone="muted" weight="semibold">
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function TopicRow({
  name,
  checked,
  onToggle,
}: {
  name: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
}) {
  const theme = useTheme();
  const progress = makeProgress(checked ? 1 : 0, 1);

  return (
    <View style={styles.topicRow}>
      <View style={styles.topicMeta}>
        <Text variant="body">{name}</Text>
        <View style={styles.barRow}>
          <ProgressBar progress={progress} label={name} style={styles.bar} />
          <Text variant="caption" tone="muted">
            {formatPercent(progress)}
          </Text>
        </View>
      </View>
      <View style={{ marginLeft: theme.spacing.md }}>
        <Checkbox checked={checked} onToggle={onToggle} label={name} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  subjectRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  subjectMeta: { flex: 1 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  bar: { flex: 1 },
  topicRow: { flexDirection: 'row', alignItems: 'center' },
  topicMeta: { flex: 1 },
});
