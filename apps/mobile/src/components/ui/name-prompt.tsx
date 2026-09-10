import { MAX_NAME_LENGTH } from '@preppilot/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from './button';
import { Sheet } from './sheet';
import { Text } from './text';
import { TextField } from './text-field';
import { useTheme } from '../../theme/theme-context';

export interface NamePromptProps {
  readonly visible: boolean;
  readonly title: string;
  readonly placeholder: string;
  readonly confirmLabel: string;
  readonly initialValue?: string;
  readonly onCancel: () => void;
  readonly onConfirm: (name: string) => void;
  /**
   * Permits an empty value. Used for a subject description, which a student
   * must be able to clear — a name, by contrast, is always required.
   */
  readonly allowEmpty?: boolean;
  /**
   * A failure that happened after confirming, such as the write not landing.
   * Shown in place of the sheet closing, so the student keeps what they typed
   * and can simply try again.
   */
  readonly error?: string | null;
}

/**
 * Collects a single name, for adding or renaming a subject, chapter or topic,
 * or for naming a syllabus a student is starting from scratch.
 *
 * Validates before closing, so an empty name never reaches the database and the
 * student keeps what they typed rather than having the sheet close on them.
 */
export function NamePrompt({
  visible,
  title,
  placeholder,
  confirmLabel,
  initialValue = '',
  onCancel,
  onConfirm,
  allowEmpty = false,
  error: externalError = null,
}: NamePromptProps) {
  const theme = useTheme();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  // What the student just typed takes precedence: a stale failure must not
  // hide the reason this attempt was rejected.
  const shown = error ?? externalError;

  // Reset whenever the sheet opens, so a previous entry does not reappear.
  useEffect(() => {
    if (visible) {
      setValue(initialValue);
      setError(null);
    }
  }, [visible, initialValue]);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0 && !allowEmpty) {
      setError('Enter a name.');
      return;
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      setError('That name is too long.');
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <Sheet visible={visible} onDismiss={onCancel} label={title}>
      <Text variant="title">{title}</Text>

      <TextField
        label={allowEmpty ? 'Description' : 'Name'}
        value={value}
        onChangeText={(next) => {
          setValue(next);
          if (error !== null) setError(null);
        }}
        placeholder={placeholder}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={submit}
        {...(shown !== null ? { error: shown } : {})}
      />

      <View style={styles.actions}>
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
        <Button label={confirmLabel} onPress={submit} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
