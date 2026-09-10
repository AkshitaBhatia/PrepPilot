import { isReviewable, type AiProposal, type ParsedReply } from '@preppilot/shared';
import { create } from 'zustand';
import type { Repositories } from '../../db/client';
import * as client from './ai-client';
import { activeTrackerId } from '../trackers/trackers-store';

export interface AiMessage {
  readonly id: string;
  readonly role: 'student' | 'assistant';
  readonly text: string;
  /** Attached to an assistant message that asked to change the tracker. */
  readonly proposal: AiProposal | null;
}

export interface AiState {
  readonly messages: readonly AiMessage[];
  readonly asking: boolean;
  readonly error: string | null;
  /** The proposal awaiting confirmation, if any. */
  readonly pendingProposal: AiProposal | null;
  readonly applying: boolean;
}

export interface AiActions {
  ask: (question: string) => Promise<void>;
  reviewProposal: (proposal: AiProposal) => void;
  dismissProposal: () => void;
  /** Applies a reviewed proposal. Only reachable after explicit confirmation. */
  applyProposal: (userId: string, repositories: Repositories) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

const initialState: AiState = {
  messages: [],
  asking: false,
  error: null,
  pendingProposal: null,
  applying: false,
};

let counter = 0;
const nextId = () => `m${(counter += 1)}`;

/** Supplied by the screen so the assistant can refer to the student's own subjects. */
let subjectNames: readonly string[] = [];

export function setSubjectContext(names: readonly string[]): void {
  subjectNames = names;
}

export const useAiStore = create<AiState & AiActions>((set, get) => ({
  ...initialState,

  async ask(question) {
    const trimmed = question.trim();
    if (trimmed.length === 0 || get().asking) return;

    set({
      messages: [
        ...get().messages,
        { id: nextId(), role: 'student', text: trimmed, proposal: null },
      ],
      asking: true,
      error: null,
    });

    const result = await client.ask({ question: trimmed, subjectNames });

    if (!result.ok) {
      set({ error: result.message, asking: false });
      return;
    }

    const reply: ParsedReply = result.reply;
    set({
      messages: [
        ...get().messages,
        {
          id: nextId(),
          role: 'assistant',
          text: reply.message,
          // A proposal is attached, never applied. PRD §14 requires review and
          // confirmation before anything reaches the tracker.
          proposal: reply.proposal,
        },
      ],
      asking: false,
    });
  },

  reviewProposal(proposal) {
    set({ pendingProposal: proposal });
  },

  dismissProposal() {
    set({ pendingProposal: null });
  },

  async applyProposal(userId, repositories) {
    const proposal = get().pendingProposal;
    if (proposal === null || get().applying) return;

    if (!isReviewable(proposal)) {
      set({
        error: 'That suggestion is too large to apply at once. Ask for a smaller part of it.',
      });
      return;
    }

    set({ applying: true, error: null });

    try {
      // Added to the named subject if it exists, otherwise created — the student
      // has already seen and confirmed what this will add.
      const existing = await repositories.subjects.listByUser(userId, activeTrackerId());
      const match = existing.find(
        (subject) => subject.name.toLowerCase() === proposal.subjectName.toLowerCase(),
      );
      const subject =
        match ??
        (await repositories.subjects.create({
          userId,
          name: proposal.subjectName,
          trackerId: activeTrackerId(),
        }));

      for (const proposedChapter of proposal.chapters) {
        const chapter = await repositories.chapters.create({
          userId,
          subjectId: subject.id,
          name: proposedChapter.name,
        });

        if (proposedChapter.topics.length === 0) continue;
        await repositories.topics.createMany(
          proposedChapter.topics.map((name) => ({ userId, chapterId: chapter.id, name })),
        );
      }

      set({ pendingProposal: null });
    } catch {
      set({ error: 'We could not add that to your tracker. Try again.' });
    } finally {
      set({ applying: false });
    }
  },

  clearError() {
    set({ error: null });
  },

  reset() {
    set({ ...initialState });
  },
}));

/** Test seam: clears the store and its subject context. */
export function resetAiStore(): void {
  subjectNames = [];
  useAiStore.setState({ ...initialState });
}
