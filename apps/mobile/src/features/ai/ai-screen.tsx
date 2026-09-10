import { summariseProposal } from '@preppilot/shared';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, EmptyState, Screen, Sheet, Text, TextField } from '../../components/ui';
import { getRepositories } from '../../db/client';
import { emptyStateCopy } from '../../constants/copy';
import { useAuthStore } from '../auth/auth-store';
import { useNetworkStore } from '../network/network-store';
import { useTrackerStore } from '../tracker/tracker-store';
import { useTheme } from '../../theme/theme-context';
import { UNAVAILABLE_COPY, unavailableReason } from './ai-client';
import { setSubjectContext, useAiStore } from './ai-store';

const QUICK_PROMPTS = [
  'Explain this topic simply',
  'Give me a quick insight',
  'Help me plan this week',
];

/**
 * The AI assistant (PRD §14).
 *
 * Secondary and online-only. It can suggest additions to the tracker but never
 * makes them: a suggestion arrives as an inert proposal that the student reviews
 * and confirms before anything is written.
 */
export function AiScreen() {
  const theme = useTheme();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const subjects = useTrackerStore((state) => state.subjects);
  const state = useAiStore();
  const [question, setQuestion] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    setSubjectContext(subjects.map((subject) => subject.name));
  }, [subjects]);

  const send = async (text: string) => {
    setQuestion('');
    await state.ask(text);
    scrollRef.current?.scrollToEnd({ animated: true });
  };

  const online = useNetworkStore((state) => state.online);
  const isGuest = useAuthStore((state) => state.isGuest);
  // PRD §14 makes the assistant online-only, so being offline disables it for
  // the same reason missing configuration does: the request cannot succeed.
  const unavailable = unavailableReason({ isGuest });
  const configured = unavailable === null && online;

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: theme.spacing.base, gap: theme.spacing.md }}
          showsVerticalScrollIndicator={false}
        >
          <Text variant="heading">Assistant</Text>

          {!configured && (
            // Better to say why the assistant is unavailable than to accept a
            // question and fail after the student has typed it.
            <Card testID="ai-unavailable">
              <Text variant="small" tone="danger" accessibilityRole="alert">
                {!online
                  ? 'The assistant needs an internet connection. Everything else keeps working offline.'
                  : UNAVAILABLE_COPY[unavailable ?? 'unconfigured']}
              </Text>
              {online && (
                <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
                  Everything else in PrepPilot works without it.
                </Text>
              )}
              {/* A refusal with no way past it is a dead end. */}
              {unavailable === 'guest' && (
                <View style={{ marginTop: theme.spacing.base }}>
                  <Button
                    label="Sign in"
                    testID="ai-sign-in"
                    onPress={() => router.push('/login')}
                  />
                </View>
              )}
            </Card>
          )}

          {state.messages.length === 0 && (
            <EmptyState title={emptyStateCopy.ai.title} testID="ai-empty" />
          )}

          {state.messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.bubble,
                {
                  alignSelf: message.role === 'student' ? 'flex-end' : 'flex-start',
                  backgroundColor:
                    message.role === 'student' ? theme.colors.accent : theme.colors.surface,
                  borderRadius: theme.radius.lg,
                  padding: theme.spacing.md,
                },
              ]}
            >
              <Text
                variant="body"
                color={message.role === 'student' ? theme.colors.textOnAccent : undefined}
              >
                {message.text}
              </Text>

              {message.proposal !== null && (
                <View style={{ marginTop: theme.spacing.md }}>
                  <Text variant="caption" tone="muted">
                    This would add {summariseProposal(message.proposal).chapters} chapters and{' '}
                    {summariseProposal(message.proposal).topics} topics to{' '}
                    {message.proposal.subjectName}.
                  </Text>
                  <View style={{ marginTop: theme.spacing.sm }}>
                    <Button
                      label="Review suggestion"
                      size="small"
                      onPress={() => state.reviewProposal(message.proposal!)}
                    />
                  </View>
                </View>
              )}
            </View>
          ))}

          {state.asking && (
            <Text variant="small" tone="muted" testID="ai-thinking">
              Thinking…
            </Text>
          )}

          {state.error !== null && (
            <Card testID="ai-error">
              <Text variant="small" tone="danger" accessibilityRole="alert">
                {state.error}
              </Text>
              <View style={{ marginTop: theme.spacing.sm }}>
                <Button label="Dismiss" variant="ghost" size="small" onPress={state.clearError} />
              </View>
            </Card>
          )}
        </ScrollView>

        {configured && state.messages.length === 0 && (
          <View
            style={[
              styles.prompts,
              { paddingHorizontal: theme.spacing.base, gap: theme.spacing.sm },
            ]}
          >
            {QUICK_PROMPTS.map((prompt) => (
              <Button
                key={prompt}
                label={prompt}
                size="small"
                variant="secondary"
                onPress={() => void send(prompt)}
              />
            ))}
          </View>
        )}

        <View
          style={[
            styles.composer,
            {
              padding: theme.spacing.base,
              borderTopColor: theme.colors.border,
              gap: theme.spacing.sm,
            },
          ]}
        >
          <View style={styles.field}>
            <TextField
              label="Ask a question"
              value={question}
              onChangeText={setQuestion}
              placeholder="e.g. Explain polynomials"
              editable={configured}
              onSubmitEditing={() => void send(question)}
            />
          </View>
          <Button
            label="Ask"
            loading={state.asking}
            disabled={!configured || question.trim().length === 0}
            onPress={() => void send(question)}
          />
        </View>
      </KeyboardAvoidingView>

      <ProposalReview userId={userId} />
    </Screen>
  );
}

/**
 * The confirmation step (PRD §14: Proposal → Review → Confirmation → Apply).
 *
 * Lists exactly what would be added before anything is written, so a student is
 * accepting a specific change rather than trusting a summary.
 */
function ProposalReview({ userId }: { readonly userId: string | null }) {
  const theme = useTheme();
  const state = useAiStore();
  const proposal = state.pendingProposal;

  if (proposal === null) return null;
  const summary = summariseProposal(proposal);

  return (
    <Sheet
      visible
      onDismiss={state.dismissProposal}
      label="Add this to your tracker?"
      testID="proposal-review"
    >
      <Text variant="title">Add this to your tracker?</Text>
      <Text variant="small" tone="secondary">
        {summary.chapters} chapters and {summary.topics} topics would be added to{' '}
        {proposal.subjectName}. Nothing is changed until you confirm, and you can edit or delete any
        of it afterwards.
      </Text>

      <ScrollView style={styles.preview} showsVerticalScrollIndicator={false}>
        {proposal.chapters.map((chapter) => (
          <View key={chapter.name} style={{ marginBottom: theme.spacing.sm }}>
            <Text variant="body" weight="medium">
              {chapter.name}
            </Text>
            {chapter.topics.map((topic) => (
              <Text
                key={topic}
                variant="caption"
                tone="muted"
                style={{ marginLeft: theme.spacing.md }}
              >
                {topic}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>

      <View style={styles.actions}>
        <Button label="No thanks" variant="ghost" onPress={state.dismissProposal} />
        <Button
          label="Add to tracker"
          loading={state.applying}
          onPress={() => {
            if (userId !== null) void state.applyProposal(userId, getRepositories());
          }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bubble: { maxWidth: '85%' },
  prompts: { flexDirection: 'row', flexWrap: 'wrap' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  field: { flex: 1 },
  preview: { maxHeight: 200 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
