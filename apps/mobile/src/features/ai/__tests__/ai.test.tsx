import type { AiProposal } from '@preppilot/shared';
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
import * as client from '../ai-client';
import { AiScreen } from '../ai-screen';
import { resetAiStore, useAiStore } from '../ai-store';

jest.mock('../../../db/client', () => ({ getRepositories: jest.fn() }));
jest.mock('../../../lib/supabase', () => ({
  getSupabase: jest.fn(),
  startAutoRefresh: jest.fn(() => jest.fn()),
}));
jest.mock('../ai-client');

const USER = 'user-1';
const mocked = client as jest.Mocked<typeof client>;

let db: ReturnType<typeof createTestDatabase>;
let repositories: Repositories;

const ai = () => useAiStore.getState();

const proposal: AiProposal = {
  kind: 'addChapters',
  subjectName: 'Mathematics',
  chapters: [
    { name: 'Number Systems', topics: ['Decimal', 'Real Number'] },
    { name: 'Polynomials', topics: ['Degree'] },
  ],
};

beforeEach(() => {
  db = createTestDatabase();
  repositories = createTestRepositories(db, createTestClock());
  (getRepositories as jest.MockedFunction<typeof getRepositories>).mockReturnValue(repositories);

  jest.clearAllMocks();
  mocked.unavailableReason.mockReturnValue(null);
  // Automocking blanks the copy table the screen reads from.
  Object.assign(mocked.UNAVAILABLE_COPY, {
    unconfigured: 'The AI assistant is not set up yet. It needs a server connection to work.',
    demo: 'The assistant is off in the demo. It answers only for a signed-in account, because each reply costs the project owner.',
  });
  mocked.ask.mockResolvedValue({
    ok: true,
    reply: { message: 'A polynomial is an expression.', proposal: null },
  });

  resetAiStore();
  useAuthStore.setState({ user: { id: USER } as never, status: 'signedIn' });
});

afterEach(() => {
  db.$close();
});

const render = () => renderWithTheme(<AiScreen />);

describe('when the assistant is not configured', () => {
  /** Better than accepting a question and failing after the student has typed it. */
  it('says so instead of accepting questions', () => {
    mocked.unavailableReason.mockReturnValue('unconfigured');
    render();

    expect(screen.getByTestId('ai-unavailable')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ask' }).props.accessibilityState.disabled).toBe(
      true,
    );
  });

  it('reassures that the rest of the app still works', () => {
    mocked.unavailableReason.mockReturnValue('unconfigured');
    render();

    expect(screen.getByText('Everything else in PrepPilot works without it.')).toBeOnTheScreen();
  });

  /**
   * The proxy answers only a request carrying a real account's token, because
   * every reply spends the project owner's Gemini quota. Demo mode has no such
   * token, so the composer must not look ready.
   */
  it('explains that the demo has no account to bill the reply to', () => {
    mocked.unavailableReason.mockReturnValue('demo');
    render();

    expect(screen.getByTestId('ai-unavailable')).toBeOnTheScreen();
    expect(screen.getByText(/only for a signed-in account/)).toBeOnTheScreen();
  });
});

describe('asking a question', () => {
  it('shows the question and the reply', async () => {
    render();

    fireEvent.changeText(screen.getByLabelText('Ask a question'), 'What is a polynomial?');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Ask' }));
    });

    await waitFor(() => expect(screen.getByText('What is a polynomial?')).toBeOnTheScreen());
    expect(screen.getByText('A polynomial is an expression.')).toBeOnTheScreen();
  });

  it('ignores an empty question', async () => {
    render();

    await act(async () => {
      await ai().ask('   ');
    });

    expect(mocked.ask).not.toHaveBeenCalled();
    expect(ai().messages).toHaveLength(0);
  });

  it('ignores a second question while one is in flight', async () => {
    let release: (value: unknown) => void = () => {};
    mocked.ask.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }) as never,
    );
    render();

    const first = ai().ask('One');
    await act(async () => {
      await ai().ask('Two');
    });

    expect(mocked.ask).toHaveBeenCalledTimes(1);
    release({ ok: true, reply: { message: 'ok', proposal: null } });
    await act(async () => {
      await first;
    });
  });

  it('shows a student-facing failure', async () => {
    mocked.ask.mockResolvedValue({
      ok: false,
      message: 'PrepPilot needs an internet connection to answer this.',
    });
    render();

    await act(async () => {
      await ai().ask('Explain polynomials');
    });

    await waitFor(() => expect(screen.getByTestId('ai-error')).toBeOnTheScreen());
    expect(
      screen.getByText('PrepPilot needs an internet connection to answer this.'),
    ).toBeOnTheScreen();
  });

  it('dismisses an error', async () => {
    mocked.ask.mockResolvedValue({ ok: false, message: 'Something failed.' });
    render();
    await act(async () => {
      await ai().ask('Explain polynomials');
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }));
    });

    expect(ai().error).toBeNull();
  });
});

describe('a proposal', () => {
  beforeEach(() => {
    mocked.ask.mockResolvedValue({
      ok: true,
      reply: { message: 'Here is a plan.', proposal },
    });
  });

  /**
   * The rule PRD §14 exists to enforce: nothing reaches the tracker until the
   * student has seen it and said yes.
   */
  it('changes nothing before it is confirmed', async () => {
    render();

    await act(async () => {
      await ai().ask('Plan my maths');
    });

    expect(await repositories.subjects.listByUser(USER)).toEqual([]);
  });

  it('offers a review rather than applying', async () => {
    render();
    await act(async () => {
      await ai().ask('Plan my maths');
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Review suggestion' })).toBeOnTheScreen(),
    );
  });

  it('lists exactly what would be added', async () => {
    render();
    await act(async () => {
      await ai().ask('Plan my maths');
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Review suggestion' }));
    });

    expect(screen.getByTestId('proposal-review')).toBeOnTheScreen();
    expect(screen.getByText('Number Systems')).toBeOnTheScreen();
    expect(screen.getByText('Decimal')).toBeOnTheScreen();
  });

  it('applies only on confirmation', async () => {
    render();
    await act(async () => {
      await ai().ask('Plan my maths');
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Review suggestion' }));
    });
    await act(async () => {
      fireEvent.press(getInModal('Add to tracker'));
    });

    await waitFor(async () => {
      const subjects = await repositories.subjects.listByUser(USER);
      expect(subjects.map((row) => row.name)).toEqual(['Mathematics']);
    });
  });

  it('creates the proposed chapters and topics', async () => {
    render();
    await act(async () => {
      await ai().ask('Plan my maths');
    });
    act(() => {
      ai().reviewProposal(proposal);
    });
    await act(async () => {
      await ai().applyProposal(USER, repositories);
    });

    const [subject] = await repositories.subjects.listByUser(USER);
    const chapters = await repositories.chapters.listBySubject(subject!.id);
    expect(chapters.map((row) => row.name)).toEqual(['Number Systems', 'Polynomials']);
    expect(await repositories.topics.listBySubject(subject!.id)).toHaveLength(3);
  });

  /** Adding to a subject the student already has, rather than duplicating it. */
  it('adds to an existing subject when the name matches', async () => {
    await repositories.subjects.create({ userId: USER, name: 'mathematics' });
    act(() => {
      ai().reviewProposal(proposal);
    });

    await act(async () => {
      await ai().applyProposal(USER, repositories);
    });

    expect(await repositories.subjects.listByUser(USER)).toHaveLength(1);
  });

  it('changes nothing when the student declines', async () => {
    render();
    await act(async () => {
      await ai().ask('Plan my maths');
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Review suggestion' }));
    });
    await act(async () => {
      fireEvent.press(getInModal('No thanks'));
    });

    expect(screen.queryByTestId('proposal-review')).toBeNull();
    expect(await repositories.subjects.listByUser(USER)).toEqual([]);
  });

  /** Confirming hundreds of topics is a rubber stamp, not a review. */
  it('refuses a proposal too large to review', async () => {
    const huge: AiProposal = {
      kind: 'addChapters',
      subjectName: 'Mathematics',
      chapters: [{ name: 'Everything', topics: Array.from({ length: 500 }, (_, i) => `t${i}`) }],
    };
    act(() => {
      ai().reviewProposal(huge);
    });

    await act(async () => {
      await ai().applyProposal(USER, repositories);
    });

    expect(ai().error).toMatch(/too large to apply at once/);
    expect(await repositories.subjects.listByUser(USER)).toEqual([]);
  });

  it('reports a failure to apply without claiming success', async () => {
    jest.spyOn(repositories.chapters, 'create').mockRejectedValue(new Error('SQLITE_BUSY'));
    act(() => {
      ai().reviewProposal(proposal);
    });

    await act(async () => {
      await ai().applyProposal(USER, repositories);
    });

    expect(ai().error).toBe('We could not add that to your tracker. Try again.');
    expect(ai().pendingProposal).not.toBeNull();
  });

  it('does nothing when there is no pending proposal', async () => {
    await act(async () => {
      await ai().applyProposal(USER, repositories);
    });

    expect(await repositories.subjects.listByUser(USER)).toEqual([]);
  });
});

describe('quick prompts', () => {
  it('offers starting points before the first question', () => {
    render();

    expect(screen.getByRole('button', { name: 'Explain this topic simply' })).toBeOnTheScreen();
  });

  it('sends one when tapped', async () => {
    render();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Give me a quick insight' }));
    });

    expect(mocked.ask).toHaveBeenCalledWith(
      expect.objectContaining({ question: 'Give me a quick insight' }),
    );
  });
});
