import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Sheet, Text, TextField } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-context';

export interface NoteEditorProps {
  readonly visible: boolean;
  /** Where the note sits, shown so the student can see what they are writing about. */
  readonly context: string;
  readonly initialValue: string;
  /** Absent for a new note: there is nothing to delete yet. */
  readonly onDelete?: () => void;
  readonly onSave: (note: string) => void;
  readonly onCancel: () => void;
  readonly error?: string | null;
  readonly busy?: boolean;
}

/**
 * Writing or correcting a note, without leaving the Notes tab.
 *
 * Deleting asks first. A note is typed by hand and nothing else in the app will
 * bring it back, so the one tap that destroys it should not sit next to the one
 * that saves it.
 */
export function NoteEditor({
  visible,
  context,
  initialValue,
  onDelete,
  onSave,
  onCancel,
  error = null,
  busy = false,
}: NoteEditorProps) {
  const theme = useTheme();
  const [value, setValue] = useState(initialValue);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Reopening on a different note must not show the last one's text.
  useEffect(() => {
    if (visible) {
      setValue(initialValue);
      setConfirmingDelete(false);
    }
  }, [visible, initialValue]);

  return (
    <Sheet visible={visible} onDismiss={onCancel} label="Note">
      <Text variant="caption" tone="muted" overline>
        {context}
      </Text>

      {confirmingDelete ? (
        <>
          <Text variant="title">Delete this note?</Text>
          <Text variant="small" tone="secondary">
            You typed it yourself, and nothing else in PrepPilot keeps a copy.
          </Text>

          <View style={styles.actions}>
            <Button
              label="Keep it"
              variant="secondary"
              testID="note-delete-cancel"
              onPress={() => setConfirmingDelete(false)}
            />
            <Button
              label="Delete note"
              variant="danger"
              testID="note-delete-confirm"
              onPress={() => onDelete?.()}
            />
          </View>
        </>
      ) : (
        <>
          <TextField
            label="Note"
            value={value}
            onChangeText={setValue}
            placeholder="What is worth remembering here?"
            multiline
            numberOfLines={6}
            testID="note-input"
            error={error ?? undefined}
          />

          <View style={styles.actions}>
            {onDelete !== undefined && (
              <Button
                label="Delete"
                variant="secondary"
                testID="note-delete"
                onPress={() => setConfirmingDelete(true)}
              />
            )}
            <Button label="Cancel" variant="secondary" testID="note-cancel" onPress={onCancel} />
            <Button
              label={busy ? 'Saving…' : 'Save'}
              disabled={busy}
              testID="note-save"
              onPress={() => onSave(value)}
            />
          </View>

          <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xxs }}>
            Notes are saved on the topic, so this is the same note you see in the tracker.
          </Text>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
});
