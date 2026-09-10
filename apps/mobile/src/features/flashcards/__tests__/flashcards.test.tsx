import { RELEARN_DELAY_MS } from '@preppilot/shared';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { Repositories } from '../../../db/client';
import { getRepositories } from '../../../db/client';
import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../../../db/test-support/test-database';
import { getInModal, renderWithTheme } from '../../../test-utils/render';
import { useAuthStore } from '../../auth/auth-store';
import { FlashcardsScreen } from '../flashcards-screen';
import { resetFlashcardsStore, useFlashcardsStore } from '../flashcards-store';

jest.mock('../../../db/client', () => ({ getRepositories: jest.fn() }));
jest.mock('../../../lib/supabase', () => ({
  getSupabase: jest.fn(),
  startAutoRefresh: jest.fn(() => jest.fn()),
}));

const USER = 'user-1';
const NOW = Date.UTC(2026, 7, 26, 9, 0);
const DAY = 24 * 60 * 60 * 1000;

let db: ReturnType<typeof createTestDatabase>;
let repositories: Repositories;

const cards = () => useFlashcardsStore.getState();

beforeEach(() => {
  db = createTestDatabase();
  repositories = createTestRepositories(db, createTestClock(NOW));
  (getRepositories as jest.MockedFunction<typeof getRepositories>).mockReturnValue(repositories);
  resetFlashcardsStore();
  useAuthStore.setState({ user: { id: USER } as never, status: 'signedIn' });
});

afterEach(() => {
  db.$close();
});

const load = () => cards().load(USER, repositories, NOW);

describe('the review queue', () => {
  it('offers a new card immediately', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'Ohm', back: 'V = IR' });

    await load();

    expect(cards().queue).toHaveLength(1);
  });

  it('leaves out a card scheduled for the future', async () => {
    const card = await repositories.flashcards.create({ userId: USER, front: 'A', back: 'B' });
    await repositories.flashcards.applySchedule(card.id, {
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      dueAt: NOW + 6 * DAY,
      lapses: 0,
    });

    await load();

    expect(cards().queue).toHaveLength(0);
    expect(cards().cards).toHaveLength(1);
  });

  it('shows the most overdue card first', async () => {
    const older = await repositories.flashcards.create({ userId: USER, front: 'Older', back: 'x' });
    const newer = await repositories.flashcards.create({ userId: USER, front: 'Newer', back: 'y' });
    await repositories.flashcards.applySchedule(older.id, {
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 1,
      dueAt: NOW - 3 * DAY,
      lapses: 0,
    });
    await repositories.flashcards.applySchedule(newer.id, {
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 1,
      dueAt: NOW - 1 * DAY,
      lapses: 0,
    });

    await load();

    expect(cards().queue[0]?.front).toBe('Older');
  });
});

describe('rating a card', () => {
  const seed = async () => {
    await repositories.flashcards.create({ userId: USER, front: 'Ohm', back: 'V = IR' });
    await load();
  };

  it('brings the card back after exactly the delay chosen', async () => {
    await seed();

    await cards().rate('1d', NOW);

    expect(cards().queue).toHaveLength(0);
    const stored = cards().cards[0]!;
    expect(stored.intervalDays).toBe(1);
    expect(stored.dueAt).toBe(NOW + DAY);
  });

  it('honours the longest delay too', async () => {
    await seed();

    await cards().rate('4d', NOW);

    expect(cards().cards[0]!.dueAt).toBe(NOW + 4 * DAY);
  });

  /** The card you just failed is the one you most need to see again today. */
  it('brings a five-minute card back in the same sitting', async () => {
    await seed();

    await cards().rate('5m', NOW);

    expect(cards().queue).toHaveLength(1);
    expect(cards().cards[0]!.dueAt).toBe(NOW + 5 * 60_000);
    expect(cards().cards[0]!.lapses).toBe(1);
  });

  it('puts the failed card behind the others rather than repeating it at once', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'First', back: 'a' });
    await repositories.flashcards.create({ userId: USER, front: 'Second', back: 'b' });
    await load();

    await cards().rate('5m', NOW);

    expect(cards().queue.map((card) => card.front)).toEqual(['Second', 'First']);
  });

  it('hides the answer again when the next card comes up', async () => {
    await seed();
    cards().reveal();
    expect(cards().revealed).toBe(true);

    await cards().rate('1d', NOW);

    expect(cards().revealed).toBe(false);
  });

  it('counts what was reviewed in this sitting', async () => {
    await seed();

    await cards().rate('1d', NOW);

    expect(cards().reviewedCount).toBe(1);
  });

  it('does nothing when the queue is empty', async () => {
    await load();

    await expect(cards().rate('1d', NOW)).resolves.toBeUndefined();
    expect(cards().reviewedCount).toBe(0);
  });

  it('keeps the place when the write fails', async () => {
    await seed();
    jest
      .spyOn(repositories.flashcards, 'applySchedule')
      .mockRejectedValue(new Error('SQLITE_BUSY'));

    await cards().rate('1d', NOW);

    expect(cards().error).toMatch(/could not save that review/);
  });
});

describe('the screen', () => {
  const render = async () => {
    const view = renderWithTheme(<FlashcardsScreen />);
    await waitFor(() => expect(cards().loading).toBe(false));
    return view;
  };

  /** Studying is something the student starts, so the tests start it too. */
  const startStudying = async () => {
    await act(async () => {
      fireEvent.press(screen.getByTestId('study-cards'));
    });
  };

  it('invites a first card when there are none', async () => {
    await render();

    expect(screen.getByTestId('flashcards-empty')).toBeOnTheScreen();
  });

  /**
   * Grading yourself after the answer is already visible is not recall, and the
   * schedule is only as good as the honesty of the grade.
   */
  it('hides the answer until it is asked for', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'Ohm', back: 'V = IR' });
    await render();
    await startStudying();

    expect(screen.queryByTestId('card-back')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId('show-answer'));
    });

    expect(screen.getByTestId('card-back')).toBeOnTheScreen();
  });

  it('offers exactly the four delays, labelled with what they do', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'Ohm', back: 'V = IR' });
    await render();
    await startStudying();

    await act(async () => {
      fireEvent.press(screen.getByTestId('show-answer'));
    });

    for (const key of ['5m', '1d', '2d', '4d']) {
      expect(screen.getByTestId(`review-${key}`)).toBeOnTheScreen();
    }
  });

  it('adds a card from the sheet', async () => {
    await render();

    await act(async () => {
      fireEvent.press(screen.getByTestId('new-card'));
    });
    fireEvent.changeText(screen.getByLabelText('Question'), 'State Ohm’s law');
    fireEvent.changeText(screen.getByLabelText('Answer'), 'V = IR');
    await act(async () => {
      fireEvent.press(getInModal('Add card'));
    });

    await waitFor(() => expect(cards().cards).toHaveLength(1));
    expect(cards().cards[0]!.front).toBe('State Ohm’s law');
  });

  it('refuses a card missing half of itself', async () => {
    await render();

    await act(async () => {
      fireEvent.press(screen.getByTestId('new-card'));
    });
    fireEvent.changeText(screen.getByLabelText('Question'), 'Only a question');
    await act(async () => {
      fireEvent.press(getInModal('Add card'));
    });

    expect(screen.getByText(/needs both a question and an answer/)).toBeOnTheScreen();
    expect(cards().cards).toHaveLength(0);
  });

  /**
   * "Nothing due right now" read as "there is nothing here", which is the
   * opposite of what a full deck on a schedule means.
   */
  it('counts down to the next card rather than saying nothing is due', async () => {
    const card = await repositories.flashcards.create({ userId: USER, front: 'A', back: 'B' });
    await repositories.flashcards.applySchedule(card.id, {
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      dueAt: Date.now() + 4 * 60 * 60_000 + 32 * 60_000,
      lapses: 0,
    });

    await render();

    expect(screen.getByText(/Next card available in 4h 3[12]m\./)).toBeOnTheScreen();
    expect(screen.queryByText(/Nothing due right now/)).toBeNull();
  });
});

describe('managing cards', () => {
  it('edits both sides', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'Wrong', back: 'Also wrong' });
    await load();

    await cards().editCard(cards().cards[0]!.id, 'Right', 'Also right');

    expect(cards().cards[0]).toMatchObject({ front: 'Right', back: 'Also right' });
  });

  it('deletes one and drops it from the queue', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'Doomed', back: 'x' });
    await load();

    await cards().deleteCard(cards().cards[0]!.id);

    expect(cards().cards).toEqual([]);
    expect(cards().queue).toEqual([]);
  });

  it('deletes from the list on screen', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'Doomed', back: 'x' });
    renderWithTheme(<FlashcardsScreen />);
    await waitFor(() => expect(cards().loading).toBe(false));

    await act(async () => {
      fireEvent.press(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!);
    });

    await waitFor(() => expect(cards().cards).toEqual([]));
  });

  it('shows when each card is next due', async () => {
    // Anchored to the real clock: the screen formats the gap against Date.now(),
    // so a fixed date would read as one day fewer once the date rolled over.
    const card = await repositories.flashcards.create({ userId: USER, front: 'Later', back: 'x' });
    await repositories.flashcards.applySchedule(card.id, {
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      dueAt: Date.now() + 6 * DAY,
      lapses: 0,
    });
    renderWithTheme(<FlashcardsScreen />);
    await waitFor(() => expect(cards().loading).toBe(false));

    expect(screen.getByText(/In 6d/)).toBeOnTheScreen();
  });

  it('flags a card that keeps being forgotten', async () => {
    // A card with lapses is the one worth rewriting, so it says so.
    const card = await repositories.flashcards.create({ userId: USER, front: 'Hard', back: 'x' });
    await repositories.flashcards.applySchedule(card.id, {
      easeFactor: 1.9,
      intervalDays: 0,
      repetitions: 0,
      dueAt: NOW,
      lapses: 3,
    });
    renderWithTheme(<FlashcardsScreen />);
    await waitFor(() => expect(cards().loading).toBe(false));

    expect(screen.getByText(/3 lapses/)).toBeOnTheScreen();
  });
});

describe('failures', () => {
  it('reports a load that failed without pretending there are no cards', async () => {
    jest.spyOn(repositories.flashcards, 'listByUser').mockRejectedValue(new Error('SQLITE_BUSY'));

    await load();

    expect(cards().error).toMatch(/could not load your flashcards/);
    expect(cards().loading).toBe(false);
  });

  it('reports a card that could not be added', async () => {
    await load();
    jest.spyOn(repositories.flashcards, 'create').mockRejectedValue(new Error('SQLITE_BUSY'));

    await cards().addCard('Q', 'A');

    expect(cards().error).toMatch(/could not add that card/);
  });

  it('reports a delete that failed', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'A', back: 'B' });
    await load();
    jest.spyOn(repositories.flashcards, 'softDelete').mockRejectedValue(new Error('SQLITE_BUSY'));

    await cards().deleteCard(cards().cards[0]!.id);

    expect(cards().error).toMatch(/could not delete that card/);
  });

  it('reports an edit that failed', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'A', back: 'B' });
    await load();
    jest.spyOn(repositories.flashcards, 'edit').mockRejectedValue(new Error('SQLITE_BUSY'));

    await cards().editCard(cards().cards[0]!.id, 'X', 'Y');

    expect(cards().error).toMatch(/could not save that card/);
  });

  it('can be dismissed', async () => {
    await load();
    useFlashcardsStore.setState({ error: 'Something' });

    cards().clearError();

    expect(cards().error).toBeNull();
  });

  it('refuses to act before it has been loaded', async () => {
    resetFlashcardsStore();

    await expect(cards().addCard('Q', 'A')).rejects.toThrow(/before load/);
  });
});

describe('coming back to the screen', () => {
  it('picks up a card added elsewhere', async () => {
    // Cards can be made from the tracker, so this re-reads on focus rather than
    // trusting what it loaded when it first mounted.
    renderWithTheme(<FlashcardsScreen />);
    await waitFor(() => expect(cards().loading).toBe(false));
    expect(cards().cards).toHaveLength(0);

    await repositories.flashcards.create({ userId: USER, front: 'Added later', back: 'x' });
    await act(async () => {
      await cards().load(USER, repositories, NOW);
    });

    expect(cards().cards.map((card) => card.front)).toEqual(['Added later']);
  });

  it('reports a failure to reload without losing what is on screen', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'Kept', back: 'x' });
    await load();
    expect(cards().cards).toHaveLength(1);

    jest.spyOn(repositories.flashcards, 'listByUser').mockRejectedValue(new Error('SQLITE_BUSY'));
    await cards().load(USER, repositories, NOW);

    expect(cards().error).toMatch(/could not load/);
  });
});

describe('the card list', () => {
  it('says a card is due now rather than in no time at all', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'Due', back: 'x' });

    renderWithTheme(<FlashcardsScreen />);
    await waitFor(() => expect(cards().loading).toBe(false));

    // The stat chip says it too, so this is the row's own label.
    expect(screen.getAllByText(/Due now/).length).toBeGreaterThanOrEqual(2);
  });

  it('counts what is due, reviewed and held', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'One', back: 'x' });
    await repositories.flashcards.create({ userId: USER, front: 'Two', back: 'y' });

    renderWithTheme(<FlashcardsScreen />);
    await waitFor(() => expect(cards().loading).toBe(false));

    expect(screen.getByTestId('cards-due')).toHaveTextContent(/Due now\s*2$/);
    expect(screen.getByTestId('cards-total')).toHaveTextContent(/Total\s*2$/);
  });

  it('cancels adding a card without creating one', async () => {
    renderWithTheme(<FlashcardsScreen />);
    await waitFor(() => expect(cards().loading).toBe(false));

    await act(async () => {
      fireEvent.press(screen.getByTestId('new-card'));
    });
    await act(async () => {
      fireEvent.press(getInModal('Cancel'));
    });

    expect(cards().cards).toEqual([]);
  });
});

/**
 * The deck screen used to land straight on a card with "Show answer" under it,
 * making the first action of the screen a review nobody had chosen to begin.
 */
describe('starting a study session', () => {
  const render = async () => {
    const view = renderWithTheme(<FlashcardsScreen />);
    await waitFor(() => expect(cards().loading).toBe(false));
    return view;
  };

  it('offers Study cards rather than an answer to reveal', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'Ohm', back: 'V = IR' });

    await render();

    expect(screen.getByTestId('study-cards')).toBeOnTheScreen();
    expect(screen.queryByTestId('show-answer')).toBeNull();
  });

  it('says how many are waiting', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'One', back: 'a' });
    await repositories.flashcards.create({ userId: USER, front: 'Two', back: 'b' });

    await render();

    expect(screen.getByText('2 cards ready')).toBeOnTheScreen();
  });

  it('reads naturally for a single card', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'One', back: 'a' });

    await render();

    expect(screen.getByText('1 card ready')).toBeOnTheScreen();
  });

  it('shows the first card once studying begins', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'Ohm', back: 'V = IR' });
    await render();

    await act(async () => {
      fireEvent.press(screen.getByTestId('study-cards'));
    });

    // Scoped to the card: the question also appears in the deck list below.
    expect(screen.getByTestId('review-card')).toHaveTextContent(/Ohm/);
  });

  it('shows where the student is in the sitting', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'One', back: 'a' });
    await repositories.flashcards.create({ userId: USER, front: 'Two', back: 'b' });
    await render();

    await act(async () => {
      fireEvent.press(screen.getByTestId('study-cards'));
    });

    expect(screen.getByTestId('card-position')).toHaveTextContent('1 of 2');
  });

  it('cannot be started when nothing is due', async () => {
    const card = await repositories.flashcards.create({ userId: USER, front: 'A', back: 'B' });
    await repositories.flashcards.applySchedule(card.id, {
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      dueAt: Date.now() + 6 * DAY,
      lapses: 0,
    });

    await render();

    expect(screen.getByTestId('study-cards').props.accessibilityState.disabled).toBe(true);
  });

  it('can be left part-way through', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'Ohm', back: 'V = IR' });
    await render();
    await act(async () => {
      fireEvent.press(screen.getByTestId('study-cards'));
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('stop-studying'));
    });

    expect(screen.getByTestId('study-prompt')).toBeOnTheScreen();
  });

  it('says when the sitting is finished, and when the next card lands', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'Ohm', back: 'V = IR' });
    await render();
    await act(async () => {
      fireEvent.press(screen.getByTestId('study-cards'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('show-answer'));
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('review-4d'));
    });

    expect(screen.getByTestId('study-finished')).toBeOnTheScreen();
    expect(screen.getByText(/Next card available in 4d/)).toBeOnTheScreen();
  });

  it('schedules the card by the button the student pressed', async () => {
    await repositories.flashcards.create({ userId: USER, front: 'Ohm', back: 'V = IR' });
    await render();
    await act(async () => {
      fireEvent.press(screen.getByTestId('study-cards'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('show-answer'));
    });

    const before = Date.now();
    await act(async () => {
      fireEvent.press(screen.getByTestId('review-2d'));
    });

    await waitFor(() => {
      const due = cards().cards[0]?.dueAt ?? 0;
      expect(due).toBeGreaterThanOrEqual(before + 2 * DAY - 5_000);
      expect(due).toBeLessThanOrEqual(before + 2 * DAY + 5_000);
    });
  });
});
