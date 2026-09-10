import {
  dueCards,
  scheduleWithDelay,
  type CardSchedule,
  type ReviewDelayKey,
} from '@preppilot/shared';
import { create } from 'zustand';
import type { Repositories } from '../../db/client';
import type { FlashcardRow } from '../../db/schema';
import { activeTrackerId } from '../trackers/trackers-store';

export interface FlashcardsState {
  readonly cards: readonly FlashcardRow[];
  /** The cards due in this sitting, in the order they will be shown. */
  readonly queue: readonly FlashcardRow[];
  /**
   * Whether the student is in a study session.
   *
   * The deck screen is a place to look at cards; studying is a thing you start.
   * Landing straight on a card with "Show answer" under it made the first
   * action of the screen a review the student had not chosen to begin.
   */
  readonly studying: boolean;
  /** Whether the answer to the current card is showing. */
  readonly revealed: boolean;
  readonly reviewedCount: number;
  readonly loading: boolean;
  readonly error: string | null;
}

export interface FlashcardsActions {
  load: (userId: string, repositories: Repositories, now?: number) => Promise<void>;
  addCard: (front: string, back: string, topic?: { id: string; name: string }) => Promise<void>;
  editCard: (id: string, front: string, back: string) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  /** Begins a sitting over the cards that are due. */
  startStudying: (now?: number) => void;
  stopStudying: () => void;
  reveal: () => void;
  rate: (delay: ReviewDelayKey, now?: number) => Promise<void>;
  clearError: () => void;
}

const initialState: FlashcardsState = {
  cards: [],
  queue: [],
  studying: false,
  revealed: false,
  reviewedCount: 0,
  loading: false,
  error: null,
};

interface Context {
  readonly userId: string;
  readonly repositories: Repositories;
}

let context: Context | null = null;

function requireContext(): Context {
  if (context === null) {
    throw new Error('Flashcards used before load() — call load(userId, repositories) first.');
  }
  return context;
}

/** The schedule fields of a stored card, in the shape the algorithm expects. */
function scheduleOf(card: FlashcardRow): CardSchedule {
  return {
    easeFactor: card.easeFactor,
    intervalDays: card.intervalDays,
    repetitions: card.repetitions,
    dueAt: card.dueAt,
    lapses: card.lapses,
  };
}

export const useFlashcardsStore = create<FlashcardsState & FlashcardsActions>((set, get) => ({
  ...initialState,

  async load(userId, repositories, now = Date.now()) {
    context = { userId, repositories };
    set({ loading: true, error: null });

    try {
      const cards = await repositories.flashcards.listByUser(userId, activeTrackerId());
      set({ cards, queue: dueCards(cards, now), revealed: false, reviewedCount: 0 });
    } catch {
      set({ error: 'We could not load your flashcards. Pull down to try again.' });
    } finally {
      set({ loading: false });
    }
  },

  async addCard(front, back, topic) {
    const ctx = requireContext();

    try {
      await ctx.repositories.flashcards.create({
        userId: ctx.userId,
        trackerId: activeTrackerId(),
        front,
        back,
        topicId: topic?.id ?? null,
        topicName: topic?.name ?? null,
      });
      await get().load(ctx.userId, ctx.repositories);
    } catch {
      set({ error: 'We could not add that card. Try again.' });
    }
  },

  async editCard(id, front, back) {
    const ctx = requireContext();

    try {
      await ctx.repositories.flashcards.edit(id, front, back);
      await get().load(ctx.userId, ctx.repositories);
    } catch {
      set({ error: 'We could not save that card. Try again.' });
    }
  },

  async deleteCard(id) {
    const ctx = requireContext();

    try {
      await ctx.repositories.flashcards.softDelete(id);
      await get().load(ctx.userId, ctx.repositories);
    } catch {
      set({ error: 'We could not delete that card. Try again.' });
    }
  },

  reveal() {
    set({ revealed: true });
  },

  /**
   * Records one review and moves to the next card.
   *
   * A lapsed card goes to the back of this sitting's queue rather than
   * disappearing until tomorrow — its new due time is a minute away, and the
   * point of failing a card is to see it again while you are still here.
   */
  startStudying(now = Date.now()) {
    set({
      studying: true,
      queue: dueCards(get().cards, now),
      revealed: false,
      reviewedCount: 0,
    });
  },

  stopStudying() {
    set({ studying: false, revealed: false });
  },

  async rate(delay, now = Date.now()) {
    const ctx = requireContext();
    const [current, ...rest] = get().queue;
    if (current === undefined) return;

    const schedule = scheduleWithDelay(scheduleOf(current), delay, now);

    // Advance the queue first: the student has answered, and the next card
    // should not wait on a database write.
    //
    // The five-minute option puts the card back in this sitting rather than
    // ending it — a card the student has just failed is the one worth seeing
    // again today.
    const requeue = delay === '5m';
    set({
      queue: requeue ? [...rest, { ...current, ...schedule }] : rest,
      revealed: false,
      reviewedCount: get().reviewedCount + 1,
    });

    try {
      await ctx.repositories.flashcards.applySchedule(current.id, schedule);
      set({ cards: await ctx.repositories.flashcards.listByUser(ctx.userId, activeTrackerId()) });
    } catch {
      set({ error: 'We could not save that review. Your place is kept.' });
    }
  },

  clearError() {
    set({ error: null });
  },
}));

/** Test seam: clears the store and its captured context. */
export function resetFlashcardsStore(): void {
  context = null;
  useFlashcardsStore.setState({ ...initialState });
}
