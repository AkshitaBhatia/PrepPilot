import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppHeader,
  Button,
  Card,
  EmptyState,
  PressableScale,
  Screen,
  Text,
  TextField,
} from '../../components/ui';
import { getRepositories } from '../../db/client';
import type { NoteEntry } from '../../db/repositories/notes';
import { useAuthStore } from '../auth/auth-store';
import { useTheme } from '../../theme/theme-context';
import { useActiveTrackerId } from '../trackers/trackers-store';
import { NoteEditor } from './components/note-editor';
import { NoteTargetPicker } from './components/note-target-picker';
import { useNotesStore, type NoteTarget } from './notes-store';

/** What the editor is currently open on, if anything. */
type Editing =
  | { readonly kind: 'existing'; readonly entry: NoteEntry }
  | { readonly kind: 'new'; readonly target: NoteTarget }
  | null;

/**
 * Every note, in one place — and everything you can do to one.
 *
 * Notes are written against a topic, which is where they belong while studying.
 * They are managed from here because that is where a student comes looking for
 * them: having to find the right topic in a collapsed syllabus to fix a typo is
 * how notes stop being worth writing.
 *
 * This is still a read model over the same rows. Editing writes back to the
 * topic, so the tracker and this tab can never disagree about what a note says.
 */
export function NotesScreen() {
  const theme = useTheme();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const { notes, targets, error } = useNotesStore();

  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState(false);

  const activeTracker = useActiveTrackerId();
  const load = useCallback(async () => {
    if (userId === null) return;
    await useNotesStore.getState().load(userId, getRepositories());
    // Re-reads when the courses finish loading and whenever the student switches
    // between them: a read taken before the active course was known would sit on
    // an empty result forever.
  }, [userId, activeTracker]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const needle = query.trim().toLowerCase();
  const visible =
    needle.length === 0
      ? notes
      : notes.filter((entry) =>
          [entry.note, entry.topicName, entry.chapterName, entry.subjectName]
            .join(' ')
            .toLowerCase()
            .includes(needle),
        );

  const closeEditor = () => {
    setEditing(null);
    useNotesStore.getState().clearError();
  };

  const saveNote = async (text: string) => {
    if (editing === null) return;
    setSaving(true);
    try {
      const id = editing.kind === 'existing' ? editing.entry.id : editing.target.topicId;
      const level = editing.kind === 'existing' ? editing.entry.level : 'topic';
      // Kept open on failure so the student does not lose what they typed.
      if (await useNotesStore.getState().save(id, level, text)) setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async () => {
    if (editing?.kind !== 'existing') return;
    await useNotesStore.getState().remove(editing.entry.id, editing.entry.level);
    setEditing(null);
  };

  /**
   * A topic that already has a note opens that note rather than starting a
   * second one — a topic holds one note, and silently overwriting the first
   * would be the worst of both.
   */
  const startNote = (target: NoteTarget) => {
    setChoosing(false);
    const existing = notes.find((entry) => entry.level === 'topic' && entry.id === target.topicId);
    setEditing(
      existing === undefined ? { kind: 'new', target } : { kind: 'existing', entry: existing },
    );
  };

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.base, gap: theme.spacing.base }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <AppHeader
          overline="What you wrote down"
          title="Notes"
          action={
            <Button
              label="Add note"
              size="small"
              testID="add-note"
              onPress={() => setChoosing(true)}
            />
          }
        />

        {error !== null && editing === null && (
          <Text variant="small" tone="danger" accessibilityRole="alert">
            {error}
          </Text>
        )}

        {notes.length > 0 && (
          <TextField
            label="Search notes"
            value={query}
            onChangeText={setQuery}
            placeholder="Search by note, topic or subject"
            autoCapitalize="none"
            testID="notes-search"
          />
        )}

        {notes.length === 0 ? (
          <EmptyState
            title="No notes yet"
            description="Write one here with Add note, or open a topic in the tracker and choose Add note."
            actionLabel="Go to the tracker"
            onAction={() => router.push('/')}
            testID="notes-empty"
          />
        ) : visible.length === 0 ? (
          <EmptyState
            title="Nothing matches that"
            description="Try a different word, or clear the search to see everything."
            testID="notes-no-match"
          />
        ) : (
          visible.map((entry) => (
            <PressableScale
              key={`${entry.level}-${entry.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Note on ${entry.topicName}`}
              accessibilityHint="Opens the note to edit or delete"
              testID={`note-${entry.id}`}
              onPress={() => setEditing({ kind: 'existing', entry })}
            >
              <Card>
                <View style={styles.head}>
                  <Text variant="caption" tone="muted" overline style={styles.crumbs}>
                    {entry.subjectName} · {entry.chapterName}
                  </Text>
                  {entry.level === 'subtopic' && (
                    <Text variant="caption" tone="accent">
                      Sub-topic
                    </Text>
                  )}
                </View>
                <Text
                  variant="bodyLarge"
                  weight="semibold"
                  style={{ marginTop: theme.spacing.xxs }}
                >
                  {entry.topicName}
                </Text>
                <Text variant="body" tone="secondary" style={{ marginTop: theme.spacing.sm }}>
                  {entry.note}
                </Text>
              </Card>
            </PressableScale>
          ))
        )}
      </ScrollView>

      <NoteTargetPicker
        visible={choosing}
        targets={targets}
        onPick={startNote}
        onDismiss={() => setChoosing(false)}
      />

      <NoteEditor
        visible={editing !== null}
        context={
          editing === null
            ? ''
            : editing.kind === 'existing'
              ? `${editing.entry.subjectName} · ${editing.entry.chapterName} · ${editing.entry.topicName}`
              : `${editing.target.subjectName} · ${editing.target.chapterName} · ${editing.target.topicName}`
        }
        initialValue={editing?.kind === 'existing' ? editing.entry.note : ''}
        onDelete={editing?.kind === 'existing' ? () => void deleteNote() : undefined}
        onSave={(text) => void saveNote(text)}
        onCancel={closeEditor}
        error={error}
        busy={saving}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  crumbs: { flex: 1 },
});
