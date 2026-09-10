import { summariseProposal, type AiProposal } from '@preppilot/shared';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Sheet, Text, TextField } from '../../../components/ui';
import { useTheme } from '../../../theme/theme-context';
import * as client from '../ai-client';

export interface GenerateSubjectSheetProps {
  readonly visible: boolean;
  /** Named so the student can see where the subject will land. */
  readonly trackerName: string;
  readonly existingSubjects: readonly string[];
  readonly onAdd: (proposal: AiProposal) => Promise<void>;
  readonly onDismiss: () => void;
}

/**
 * Asking the assistant for a syllabus, and putting it in the tracker.
 *
 * "Generate using AI" used to drop the student into the chat, where they had to
 * work out for themselves what to type to get a syllabus — and the reply's
 * proposal card was the only route back into the tracker. This asks the one
 * question that matters, drafts the subject, and shows it.
 *
 * Nothing is written until the student presses Add. An AI that mis-hears
 * "Organic Chemistry" and writes forty wrong topics into a syllabus is worse
 * than one that asks first.
 */
export function GenerateSubjectSheet({
  visible,
  trackerName,
  existingSubjects,
  onAdd,
  onDismiss,
}: GenerateSubjectSheetProps) {
  const theme = useTheme();
  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState<AiProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setPrompt('');
      setDraft(null);
      setError(null);
      setBusy(false);
    }
  }, [visible]);

  const generate = async () => {
    const asked = prompt.trim();
    if (asked.length === 0) {
      setError('Say what you are studying and PrepPilot will draft it.');
      return;
    }

    setBusy(true);
    setError(null);

    // Asked for explicitly rather than hoped for: the chat grammar only returns
    // a proposal when the request reads as one, and a student typing a subject
    // name is making exactly that request.
    const result = await client.ask({
      question: `Add a subject to my tracker for: ${asked}. Give the full syllabus as chapters and topics.`,
      subjectNames: existingSubjects,
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    if (result.reply.proposal === null) {
      setError(
        'The assistant answered but did not offer a syllabus. Try naming the subject and the level, like “class 12 Organic Chemistry”.',
      );
      return;
    }

    setDraft(result.reply.proposal);
  };

  const add = async () => {
    if (draft === null) return;
    setBusy(true);
    try {
      await onAdd(draft);
    } finally {
      setBusy(false);
    }
  };

  const summary = draft === null ? null : summariseProposal(draft);

  return (
    <Sheet visible={visible} onDismiss={onDismiss} label="Generate a subject">
      {draft === null ? (
        <>
          <Text variant="title">What are you studying?</Text>
          <Text variant="small" tone="secondary">
            Name the subject and the level, and PrepPilot will draft its chapters and topics for{' '}
            {trackerName}.
          </Text>

          <TextField
            label="Subject"
            value={prompt}
            onChangeText={(next) => {
              setPrompt(next);
              if (error !== null) setError(null);
            }}
            placeholder="e.g. class 12 Organic Chemistry"
            autoFocus
            testID="generate-prompt"
            {...(error !== null ? { error } : {})}
          />

          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="secondary"
              testID="generate-cancel"
              onPress={onDismiss}
            />
            <Button
              label={busy ? 'Drafting…' : 'Draft it'}
              disabled={busy}
              testID="generate-submit"
              onPress={() => void generate()}
            />
          </View>
        </>
      ) : (
        <>
          <Text variant="title">{draft.subjectName}</Text>
          <Text variant="small" tone="secondary" testID="generate-summary">
            {summary?.chapters} chapters · {summary?.topics} topics. Nothing is added until you
            press Add.
          </Text>

          {error !== null && (
            <Text variant="small" tone="danger" accessibilityRole="alert">
              {error}
            </Text>
          )}

          {/* Shown in full: a student confirming a syllabus should see it. */}
          <ScrollView style={styles.preview}>
            <View style={{ gap: theme.spacing.sm }}>
              {draft.chapters.map((chapter) => (
                <Card key={chapter.name}>
                  <Text variant="body" weight="semibold">
                    {chapter.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {chapter.topics.join(' · ')}
                  </Text>
                </Card>
              ))}
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Button
              label="Try again"
              variant="secondary"
              testID="generate-retry"
              onPress={() => setDraft(null)}
            />
            <Button
              label={busy ? 'Adding…' : `Add to ${trackerName}`}
              disabled={busy}
              testID="generate-add"
              onPress={() => void add()}
            />
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  preview: { maxHeight: 260 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
