import { accentForIndex, formatPercent } from '@preppilot/shared';
import { StyleSheet, View } from 'react-native';
import { Card, ProgressBar, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-context';
import type { SubjectProgress } from '../dashboard-store';

export interface SubjectProgressListProps {
  readonly subjects: readonly SubjectProgress[];
}

/**
 * Completion per subject (PRD §12).
 *
 * Separate from time-by-subject because they answer different questions: an hour
 * spent on a subject says nothing about how much of it is left, and a student
 * deciding what to study next needs the second answer more than the first.
 *
 * Ordered by least complete, so what needs attention is at the top.
 */
export function SubjectProgressList({ subjects }: SubjectProgressListProps) {
  const theme = useTheme();
  if (subjects.length === 0) return null;

  const ordered = [...subjects].sort((a, b) => {
    // Unmeasurable subjects sink: an empty subject is not "0% done", it is
    // nothing to do yet, and putting it first would be misleading advice.
    if (a.progress.isEmpty !== b.progress.isEmpty) return a.progress.isEmpty ? 1 : -1;
    return (a.progress.percent ?? 0) - (b.progress.percent ?? 0);
  });

  return (
    <Card testID="subject-progress">
      <Text variant="caption" tone="muted" overline>
        Progress by subject
      </Text>

      <View style={{ marginTop: theme.spacing.base, gap: theme.spacing.md }}>
        {ordered.map((subject, index) => (
          <View key={subject.subjectId} style={{ gap: theme.spacing.xs }}>
            <View style={styles.row}>
              <Text variant="body" style={styles.name} numberOfLines={1}>
                {subject.name}
              </Text>
              <Text
                variant="small"
                tone={subject.progress.isEmpty ? 'muted' : 'secondary'}
                style={styles.figure}
              >
                {formatPercent(subject.progress, { precision: subject.progress.isEmpty ? 0 : 1 })}
              </Text>
            </View>

            <ProgressBar
              progress={subject.progress}
              color={accentForIndex(index)}
              label={subject.name}
            />
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1 },
  figure: { fontVariant: ['tabular-nums'] },
});
