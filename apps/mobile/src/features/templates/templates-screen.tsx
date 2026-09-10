import {
  TEMPLATE_CATEGORIES,
  bundledTemplates,
  countTemplate,
  searchTemplates,
  templatesInCategory,
  type SyllabusTemplate,
  type TemplateCategory,
} from '@preppilot/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppHeader,
  Button,
  Card,
  EmptyState,
  NamePrompt,
  Screen,
  Sheet,
  Text,
  TextField,
} from '../../components/ui';
import { getRepositories } from '../../db/client';
import { emptyStateCopy } from '../../constants/copy';
import { useAuthStore } from '../auth/auth-store';
import { useTrackersStore } from '../trackers/trackers-store';
import { useTheme } from '../../theme/theme-context';
import { importTemplate } from './import-template';

type Filter = TemplateCategory | 'all';

/**
 * Template library.
 *
 * Flow:
 * browse → preview → confirm → import
 *
 * Importing a template starts a NEW course holding only that template's
 * subjects. Nothing already on the account is touched: the course the student
 * was on is still there, and the switcher moves between them.
 */
export function TemplatesScreen() {
  const theme = useTheme();
  const userId = useAuthStore((state) => state.user?.id ?? null);

  const [filter, setFilter] = useState<Filter>('all');
  const [previewing, setPreviewing] = useState<SyllabusTemplate | null>(null);
  /**
   * What the student already has, so the preview can say it will be left alone.
   * Null until it has been counted.
   */
  const [existing, setExisting] = useState<{ subjects: number; notes: number } | null>(null);
  const [naming, setNaming] = useState(false);
  const [query, setQuery] = useState('');
  // "Search from templates" arrives here wanting the keyboard up; "Import a
  // template" arrives wanting the list. Same screen, two intents.
  const { search } = useLocalSearchParams<{ search?: string }>();
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Category first, then the query, so a search runs inside the filter a
  // student can see rather than silently ignoring it.
  const visible = searchTemplates(templatesInCategory(bundledTemplates, filter), query);

  const confirmImport = async () => {
    if (previewing === null || userId === null) return;

    setImporting(true);
    setError(null);

    try {
      // A course becomes its own tracker, so the student's other courses are
      // untouched and switching between them switches everything.
      const tracker = await useTrackersStore.getState().add(previewing.name, previewing.id);
      if (tracker === null) throw new Error('Could not create the course');

      await importTemplate(userId, previewing, getRepositories(), tracker.id);

      setPreviewing(null);

      // The tracker reloads its data when it receives focus, and the new course
      // is already the active one, so it opens on the imported syllabus.
      router.push('/');
    } catch {
      setError('We could not import that template. Try again.');
    } finally {
      setImporting(false);
    }
  };

  /**
   * Whether the student already has a syllabus.
   *
   * Only decides whether to reassure them that this import leaves it alone —
   * there is nothing to warn about, since nothing is removed.
   */
  const countWhatIsAlreadyThere = async () => {
    if (userId === null) return;

    try {
      const repositories = getRepositories();
      // Scoped to the course showing: what sits in another course is not what
      // the student is being reassured about here.
      const tracker = useTrackersStore.getState().activeId;
      const [subjects, notes] = await Promise.all([
        repositories.subjects.listByUser(userId, tracker),
        repositories.notes.listByUser(userId, tracker),
      ]);
      setExisting({ subjects: subjects.length, notes: notes.length });
    } catch {
      // A missing count must not stop the preview opening; the copy falls back
      // to the general warning below.
      setExisting(null);
    }
  };

  /**
   * Creates a custom syllabus.
   *
   * This remains separate from template importing because "Build your own"
   * is intended to start a new syllabus manually.
   */
  const startFromScratch = async (name: string) => {
    if (userId === null) return;

    setImporting(true);
    setError(null);

    try {
      await getRepositories().subjects.create({
        userId,
        name,
        trackerId: useTrackersStore.getState().activeId,
      });

      setNaming(false);
      router.push('/');
    } catch {
      setError('We could not create that subject. Try again.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.base,
          gap: theme.spacing.base,
        }}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader overline="Choose a course" title="Templates">
          <Text variant="body" tone="secondary">
            Pick the exam you are preparing for and PrepPilot fills in its syllabus. You can edit
            any of it afterwards.
          </Text>
        </AppHeader>

        <TextField
          label="Search"
          placeholder="Try “class 12”, “accountancy” or “GATE”"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          testID="template-search"
          autoFocus={search === '1'}
          returnKeyType="search"
          hint={
            query.trim().length === 0
              ? undefined
              : `${visible.length} ${visible.length === 1 ? 'template' : 'templates'}`
          }
        />

        <View style={styles.filters}>
          {(['all', ...TEMPLATE_CATEGORIES] as Filter[]).map((option) => (
            <Button
              key={option}
              label={filterLabel(option)}
              size="small"
              variant={option === filter ? 'primary' : 'secondary'}
              onPress={() => setFilter(option)}
            />
          ))}
        </View>

        {visible.length === 0 ? (
          query.trim().length > 0 ? (
            <EmptyState
              title="No template matches that"
              description="Try a shorter search, or build the syllabus yourself below."
              testID="templates-no-results"
            />
          ) : (
            <EmptyState {...emptyStateCopy.templates} testID="templates-empty" />
          )
        ) : (
          visible.map((template) => {
            const counts = countTemplate(template);

            return (
              <Pressable
                key={template.id}
                accessibilityRole="button"
                accessibilityLabel={template.name}
                accessibilityHint="Opens a preview before importing"
                onPress={() => {
                  setError(null);
                  setPreviewing(template);
                  void countWhatIsAlreadyThere();
                }}
                testID={`template-${template.id}`}
              >
                <Card>
                  <Text variant="bodyLarge" weight="semibold">
                    {template.name}
                  </Text>

                  <Text variant="small" tone="secondary" style={{ marginTop: theme.spacing.xxs }}>
                    {template.description}
                  </Text>

                  <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
                    {counts.subjects} subjects · {counts.chapters} chapters · {counts.topics} topics
                  </Text>
                </Card>
              </Pressable>
            );
          })
        )}

        <Card>
          <Text variant="caption" tone="muted" overline>
            Custom
          </Text>

          <Text variant="bodyLarge" weight="semibold" style={{ marginTop: theme.spacing.xxs }}>
            Build your own
          </Text>

          <Text variant="small" tone="secondary" style={{ marginTop: theme.spacing.xxs }}>
            Start with a subject of your own and add chapters and topics as you go. Nothing here has
            to come from a template.
          </Text>

          <View style={{ marginTop: theme.spacing.base }}>
            <Button
              label="Start from scratch"
              variant="secondary"
              testID="start-from-scratch"
              onPress={() => {
                setError(null);
                setNaming(true);
              }}
            />
          </View>
        </Card>

        <Card>
          <Text variant="caption" tone="muted" overline>
            About These Templates
          </Text>

          <Text variant="small" tone="secondary" style={{ marginTop: theme.spacing.sm }}>
            Importing a template starts a separate course with that syllabus in it, leaving anything
            you are already studying untouched. You can rename, reorder, add to or delete any part
            of it afterwards, and switch between courses from the button at the top left.
          </Text>
        </Card>
      </ScrollView>

      <NamePrompt
        visible={naming}
        title="What are you studying?"
        placeholder="e.g. Organic Chemistry"
        confirmLabel="Create"
        error={naming ? error : null}
        onCancel={() => {
          setNaming(false);
          setError(null);
        }}
        onConfirm={(name) => void startFromScratch(name)}
      />

      <Sheet
        visible={previewing !== null}
        onDismiss={() => {
          if (!importing) {
            setPreviewing(null);
            setError(null);
          }
        }}
        label="Template preview"
      >
        {previewing !== null && <TemplatePreview template={previewing} existing={existing} />}

        {error !== null && (
          <Text variant="small" tone="danger" accessibilityRole="alert">
            {error}
          </Text>
        )}

        <View style={styles.actions}>
          <Button
            label="Cancel"
            variant="ghost"
            onPress={() => {
              setPreviewing(null);
              setError(null);
            }}
          />

          <Button label="Import" loading={importing} onPress={() => void confirmImport()} />
        </View>
      </Sheet>
    </Screen>
  );
}

export function TemplatePreview({
  template,
  existing = null,
}: {
  readonly template: SyllabusTemplate;
  /** What is there now, so the note only appears when there is something to keep. */
  readonly existing?: { subjects: number; notes: number } | null;
}) {
  const theme = useTheme();
  const counts = countTemplate(template);
  const startsAnother = existing !== null && existing.subjects > 0;

  return (
    <>
      <Text variant="title">{template.name}</Text>

      <Text variant="small" tone="secondary">
        Adds {counts.subjects} subjects, {counts.chapters} chapters and {counts.topics} topics.
      </Text>

      {/*
        A student who already has a syllabus is told plainly that this one does
        not disturb it. Left as a note rather than an alert: nothing here is
        destructive, and dressing it in red would teach them to ignore the
        warnings that are.
      */}
      {startsAnother && (
        <View
          accessible
          testID="new-course-note"
          style={[
            styles.warning,
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderRadius: theme.radius.md,
              padding: theme.spacing.md,
              borderLeftColor: theme.colors.accent,
            },
          ]}
        >
          <Text variant="small" weight="semibold">
            This starts a separate course
          </Text>
          <Text variant="caption" tone="secondary" style={{ marginTop: theme.spacing.xxs }}>
            Your current syllabus, notes and cards stay exactly as they are. Switch between courses
            from the button at the top left.
          </Text>
        </View>
      )}

      {/*
        Tell the student where the syllabus came from and whether
        it has been verified before they import it.
      */}
      <Text variant="caption" tone={template.verified ? 'muted' : 'danger'}>
        {template.verified
          ? template.source
          : `Not checked — ${template.source}. Compare it against your own syllabus.`}
      </Text>

      <ScrollView style={styles.preview} showsVerticalScrollIndicator={false}>
        {template.subjects.map((subject) => (
          <View key={subject.name} style={{ marginBottom: theme.spacing.sm }}>
            <Text variant="body" weight="medium">
              {subject.name}
            </Text>

            {subject.chapters.map((chapter) => (
              <Text
                key={chapter.name}
                variant="caption"
                tone="muted"
                style={{ marginLeft: theme.spacing.md }}
              >
                {chapter.name} · {chapter.topics.length} topics
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </>
  );
}

function filterLabel(filter: Filter): string {
  switch (filter) {
    case 'all':
      return 'All';
    case 'exam':
      return 'Exams';
    case 'school':
      return 'School';
    case 'custom':
      return 'Other';
  }
}

const styles = StyleSheet.create({
  warning: { borderLeftWidth: 3 },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  preview: {
    maxHeight: 220,
  },

  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
});
