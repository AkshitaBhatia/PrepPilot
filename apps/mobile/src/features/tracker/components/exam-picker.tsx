import { bundledTemplates, countTemplate, type SyllabusTemplate } from '@preppilot/shared';
import { StyleSheet, View } from 'react-native';
import { Button, Card, PressableScale, Text } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-context';

export interface ExamPickerProps {
  readonly onChoose: (template: SyllabusTemplate) => void;
  readonly onOwnSubject: () => void;
  readonly onBrowseAll: () => void;
  readonly busyId?: string | null;
}

/** Exams first: a student arrives knowing which one they are sitting. */
const EXAMS_FIRST = (a: SyllabusTemplate, b: SyllabusTemplate) =>
  a.category === b.category ? 0 : a.category === 'exam' ? -1 : 1;

/** How many choices to show before sending the student to the full library. */
const SHORTLIST = 4;

/**
 * The first question the app asks.
 *
 * A student opening PrepPilot for the first time knows which exam they are
 * preparing for, and that single answer can fill in an entire syllabus. Asking
 * it here — rather than presenting an empty tracker and an "Add subject" button
 * — is the difference between a first session that starts with studying and one
 * that starts with typing in a hundred chapter names.
 *
 * The old empty state hid the template library behind a "Browse templates"
 * button that only appeared when there were no subjects at all, which meant a
 * student who added even one subject could never reach the templates again.
 */
export function ExamPicker({ onChoose, onOwnSubject, onBrowseAll, busyId }: ExamPickerProps) {
  const theme = useTheme();
  const shortlist = [...bundledTemplates].sort(EXAMS_FIRST).slice(0, SHORTLIST);

  return (
    <View style={{ gap: theme.spacing.base }}>
      <View>
        <Text variant="title">Which exam are you preparing for?</Text>
        <Text variant="body" tone="secondary" style={{ marginTop: theme.spacing.xs }}>
          Pick one and PrepPilot fills in its syllabus, ready to tick off. You can change anything
          afterwards.
        </Text>
      </View>

      {shortlist.map((template) => {
        const counts = countTemplate(template);
        const busy = busyId === template.id;

        return (
          <PressableScale
            key={template.id}
            accessibilityRole="button"
            accessibilityLabel={`Start with ${template.name}`}
            accessibilityState={{ busy, disabled: busyId !== null && busyId !== undefined }}
            disabled={busyId !== null && busyId !== undefined}
            testID={`exam-${template.id}`}
            onPress={() => onChoose(template)}
          >
            <Card>
              <Text variant="bodyLarge" weight="semibold">
                {template.name}
              </Text>
              <Text variant="small" tone="secondary" style={{ marginTop: theme.spacing.xxs }}>
                {template.description}
              </Text>
              <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
                {busy
                  ? 'Adding it to your tracker…'
                  : `${counts.subjects} subjects · ${counts.chapters} chapters · ${counts.topics} topics`}
              </Text>
            </Card>
          </PressableScale>
        );
      })}

      <View style={styles.alternatives}>
        <Button
          label="See all courses"
          variant="secondary"
          fullWidth
          testID="see-all-courses"
          onPress={onBrowseAll}
        />
        <Button
          label="I'll add my own subjects"
          variant="ghost"
          fullWidth
          testID="own-subjects"
          onPress={onOwnSubject}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  alternatives: { gap: 8 },
});
