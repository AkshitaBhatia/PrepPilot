import {
  bundledTemplates,
  searchTemplates,
  type SyllabusTemplate,
  type TemplateSubject,
} from '@preppilot/shared';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Checkbox,
  PressableScale,
  Sheet,
  Text,
  TextField,
} from '../../../components/ui';
import { ariaState } from '../../../components/ui/aria';
import { useTheme } from '../../../theme/theme-context';

export interface SubjectPickerProps {
  readonly visible: boolean;
  /** Named so the student can see which course they are adding to. */
  readonly trackerName: string;
  readonly onAdd: (subjects: readonly TemplateSubject[]) => void;
  readonly onDismiss: () => void;
  readonly busy?: boolean;
  readonly error?: string | null;
}

function countSubject(subject: TemplateSubject): { chapters: number; topics: number } {
  let topics = 0;
  for (const chapter of subject.chapters) topics += chapter.topics.length;
  return { chapters: subject.chapters.length, topics };
}

/**
 * Taking particular subjects out of a template.
 *
 * "Search from templates" used to open the library, which imports whole
 * templates as new courses — so a student who wanted one subject got a second
 * course containing four they had not asked for, and it read as the app having
 * replaced their syllabus.
 *
 * Two steps on purpose: find the template, then choose from inside it. Ticking
 * subjects out of one flat list of every subject in the library would be worse
 * than scrolling.
 */
export function SubjectPicker({
  visible,
  trackerName,
  onAdd,
  onDismiss,
  busy = false,
  error = null,
}: SubjectPickerProps) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState<SyllabusTemplate | null>(null);
  const [picked, setPicked] = useState<readonly string[]>([]);

  // Reopening must not show the last visit's ticks.
  useEffect(() => {
    if (visible) {
      setQuery('');
      setOpened(null);
      setPicked([]);
    }
  }, [visible]);

  const matches = searchTemplates(bundledTemplates, query).slice(0, 25);

  const toggle = (name: string) =>
    setPicked((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    );

  const chosen = (opened?.subjects ?? []).filter((subject) => picked.includes(subject.name));

  return (
    <Sheet visible={visible} onDismiss={onDismiss} label="Add a subject from a template">
      {opened === null ? (
        <>
          <Text variant="title">Which course is it from?</Text>

          <TextField
            label="Search templates"
            value={query}
            onChangeText={setQuery}
            placeholder="Try “class 12”, “accountancy” or “GATE”"
            autoCapitalize="none"
            autoCorrect={false}
            testID="subject-picker-search"
          />

          {matches.length === 0 ? (
            <Text variant="small" tone="secondary" testID="subject-picker-no-templates">
              No template matches that.
            </Text>
          ) : (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              <View style={{ gap: theme.spacing.sm }}>
                {matches.map((template) => (
                  <PressableScale
                    key={template.id}
                    accessibilityRole="button"
                    accessibilityLabel={template.name}
                    accessibilityHint="Shows the subjects inside it"
                    testID={`pick-template-${template.id}`}
                    onPress={() => {
                      setOpened(template);
                      setPicked([]);
                    }}
                  >
                    <Card>
                      <Text variant="body" weight="semibold">
                        {template.name}
                      </Text>
                      <Text variant="caption" tone="muted" numberOfLines={2}>
                        {template.subjects.map((subject) => subject.name).join(' · ')}
                      </Text>
                    </Card>
                  </PressableScale>
                ))}
              </View>
            </ScrollView>
          )}
        </>
      ) : (
        <>
          <Text variant="title">{opened.name}</Text>
          <Text variant="small" tone="secondary">
            Choose what to add to {trackerName}. Nothing already there is touched.
          </Text>

          {error !== null && (
            <Text variant="small" tone="danger" accessibilityRole="alert">
              {error}
            </Text>
          )}

          <ScrollView style={styles.list}>
            <View style={{ gap: theme.spacing.sm }}>
              {opened.subjects.map((subject) => {
                const counts = countSubject(subject);
                const ticked = picked.includes(subject.name);

                return (
                  <PressableScale
                    key={subject.name}
                    accessibilityRole="checkbox"
                    accessibilityLabel={subject.name}
                    accessibilityState={{ checked: ticked }}
                    {...ariaState({ checked: ticked })}
                    testID={`pick-subject-${subject.name}`}
                    onPress={() => toggle(subject.name)}
                  >
                    <Card>
                      <View style={styles.row}>
                        {/*
                          The row is the control; the box is what it looks like.
                          Two nested checkboxes would be announced twice and the
                          inner one would swallow the tap.
                        */}
                        <View
                          accessibilityElementsHidden
                          importantForAccessibility="no-hide-descendants"
                        >
                          <Checkbox
                            checked={ticked}
                            label={subject.name}
                            onToggle={() => toggle(subject.name)}
                          />
                        </View>
                        <View style={styles.rowText}>
                          <Text variant="body" weight="semibold">
                            {subject.name}
                          </Text>
                          <Text variant="caption" tone="muted">
                            {counts.chapters} chapters · {counts.topics} topics
                          </Text>
                        </View>
                      </View>
                    </Card>
                  </PressableScale>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Button
              label="Back"
              variant="secondary"
              testID="subject-picker-back"
              onPress={() => setOpened(null)}
            />
            <Button
              label={
                chosen.length === 0
                  ? 'Add'
                  : `Add ${chosen.length} ${chosen.length === 1 ? 'subject' : 'subjects'}`
              }
              disabled={chosen.length === 0 || busy}
              testID="subject-picker-add"
              onPress={() => onAdd(chosen)}
            />
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { maxHeight: 300 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
