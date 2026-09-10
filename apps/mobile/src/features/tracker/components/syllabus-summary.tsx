import { formatPercent, type Progress } from '@preppilot/shared';
import { StyleSheet, View } from 'react-native';
import { Card, ProgressBar, ProgressRing, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-context';

export interface SyllabusSummaryProps {
  readonly progress: Progress;
  readonly subjectCount: number;
}

/**
 * The overall progress card.
 *
 * Replaces a row of loose chips. Two small figures side by side read as
 * metadata; one card with the ring, the number and a bar reads as the answer to
 * the question the student opened the app to ask.
 */
export function SyllabusSummary({ progress, subjectCount }: SyllabusSummaryProps) {
  const theme = useTheme();

  return (
    <Card testID="syllabus-summary">
      <View style={[styles.row, { gap: theme.spacing.base }]}>
        <ProgressRing
          progress={progress}
          label="Overall syllabus progress"
          size={64}
          strokeWidth={6}
          hideValue
        />

        <View style={styles.figures}>
          <Text variant="caption" tone="muted" overline>
            Completed
          </Text>
          <Text variant="display" weight="bold" testID="overall-progress" style={styles.figure}>
            {formatPercent(progress, { precision: progress.isEmpty ? 0 : 2 })}
          </Text>
          <Text variant="small" tone="secondary">
            {progress.completed} of {progress.total} topics
            {subjectCount > 0
              ? ` · ${subjectCount} ${subjectCount === 1 ? 'subject' : 'subjects'}`
              : ''}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: theme.spacing.base }}>
        <ProgressBar progress={progress} label="Overall syllabus progress" height={8} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  figures: { flex: 1 },
  // Tabular figures stop the percentage jittering as it changes.
  figure: { fontVariant: ['tabular-nums'] },
});
