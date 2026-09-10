import { StyleSheet, View } from 'react-native';
import { Card, Icon, PressableScale, Sheet, Text } from '../../../components/ui';
import type { IconName } from '../../../components/ui/icon';
import { useTheme } from '../../../theme/theme-context';

export interface AddSubjectSheetProps {
  readonly visible: boolean;
  readonly onDismiss: () => void;
  readonly onSearchTemplates: () => void;
  readonly onImportTemplate: () => void;
  readonly onGenerateWithAi: () => void;
  readonly onAddCustom: () => void;
}

interface Option {
  readonly key: string;
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
  readonly testID: string;
  readonly onPress: (props: AddSubjectSheetProps) => void;
}

/**
 * The four ways to add a subject.
 *
 * "Add subject" used to go straight to a name prompt, which quietly assumed the
 * student wanted to type a whole syllabus out by hand. Most do not: a template
 * already holds theirs. Putting the four routes side by side means the cheapest
 * one is visible at the moment the student is deciding, rather than buried on a
 * screen they have no reason to open.
 */
const OPTIONS: readonly Option[] = [
  {
    key: 'search',
    icon: 'search',
    title: 'Search from templates',
    description: 'Find your exam or class by name and import its syllabus.',
    testID: 'add-subject-search',
    onPress: (props) => props.onSearchTemplates(),
  },
  {
    key: 'import',
    icon: 'book',
    title: 'Import a template',
    description: 'Browse every bundled syllabus, from CBSE to GATE.',
    testID: 'add-subject-import',
    onPress: (props) => props.onImportTemplate(),
  },
  {
    key: 'ai',
    icon: 'sparkles',
    title: 'Generate using AI',
    description: 'Describe what you are studying and let PrepPilot draft it.',
    testID: 'add-subject-ai',
    onPress: (props) => props.onGenerateWithAi(),
  },
  {
    key: 'custom',
    icon: 'plus',
    title: 'Add a custom subject',
    description: 'Start with a name and build the chapters yourself.',
    testID: 'add-subject-custom',
    onPress: (props) => props.onAddCustom(),
  },
];

export function AddSubjectSheet(props: AddSubjectSheetProps) {
  const theme = useTheme();

  return (
    <Sheet visible={props.visible} onDismiss={props.onDismiss} label="Add a subject">
      <Text variant="title">Add a subject</Text>

      <View style={{ gap: theme.spacing.sm }}>
        {OPTIONS.map((option) => (
          <PressableScale
            key={option.key}
            accessibilityRole="button"
            accessibilityLabel={option.title}
            accessibilityHint={option.description}
            testID={option.testID}
            onPress={() => {
              props.onDismiss();
              option.onPress(props);
            }}
          >
            <Card>
              <View style={styles.row}>
                <Icon name={option.icon} size={20} color={theme.colors.accent} />
                <View style={styles.text}>
                  <Text variant="bodyLarge" weight="semibold">
                    {option.title}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {option.description}
                  </Text>
                </View>
              </View>
            </Card>
          </PressableScale>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  text: { flex: 1, gap: 2 },
});
