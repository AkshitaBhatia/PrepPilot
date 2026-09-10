import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { Repositories } from '../../../db/client';
import { getRepositories } from '../../../db/client';
import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../../../db/test-support/test-database';
import { getInModal, renderWithTheme } from '../../../test-utils/render';
import { useAuthStore } from '../../auth/auth-store';
import { TrackerScreen } from '../tracker-screen';
import { resetTrackerStore, useTrackerStore } from '../tracker-store';

/**
 * "Add subject" opens the four ways to add one; typing a name by hand is the
 * last of them. Tests that care about the name prompt go through the sheet the
 * way a student does.
 */
function openAddSubject(): void {
  fireEvent.press(screen.getByRole('button', { name: 'Add subject' }));
  fireEvent.press(screen.getByTestId('add-subject-custom'));
}

jest.mock('../../../db/client', () => ({ getRepositories: jest.fn() }));
jest.mock('../../../lib/supabase', () => ({
  getSupabase: jest.fn(),
  startAutoRefresh: jest.fn(() => jest.fn()),
}));

const USER = 'user-1';

let db: ReturnType<typeof createTestDatabase>;
let repositories: Repositories;

const tracker = () => useTrackerStore.getState();

beforeEach(() => {
  db = createTestDatabase();
  const clock = createTestClock();
  repositories = createTestRepositories(db, clock);
  (getRepositories as jest.MockedFunction<typeof getRepositories>).mockReturnValue(repositories);

  resetTrackerStore();
  jest.mocked(router.push).mockClear();
  useAuthStore.setState({ user: { id: USER } as never, status: 'signedIn' });
});

afterEach(() => {
  db.$close();
});

const renderTracker = async () => {
  const view = renderWithTheme(<TrackerScreen />);
  await waitFor(() => expect(tracker().loading).toBe(false));
  return view;
};

/** Builds Mathematics → Number Systems → two topics directly through the store. */
async function seed() {
  await act(async () => {
    await tracker().load(USER, repositories);
    await tracker().addSubject('Mathematics');
  });
  const subjectId = tracker().subjects[0]!.id;

  await act(async () => {
    await tracker().addChapter(subjectId, 'Number Systems');
  });
  const chapterId = tracker().subjects[0]!.chapters[0]!.id;

  await act(async () => {
    await tracker().addTopic(chapterId, 'Decimal');
    await tracker().addTopic(chapterId, 'Real Number');
  });

  return { subjectId, chapterId };
}

describe('empty state', () => {
  /**
   * A student opening PrepPilot knows which exam they are sitting, and that one
   * answer fills in a whole syllabus. Asking it is the difference between a
   * first session that starts with studying and one that starts with typing in
   * a hundred chapter names.
   */
  it('asks which exam the student is preparing for', async () => {
    await renderTracker();

    expect(screen.getByText('Which exam are you preparing for?')).toBeOnTheScreen();
  });

  it('offers a way past it for a student no template covers', async () => {
    await renderTracker();

    expect(screen.getByTestId('own-subjects')).toBeOnTheScreen();
    expect(screen.getByTestId('see-all-courses')).toBeOnTheScreen();
  });

  it('shows an em dash rather than 0% when there is nothing to measure', async () => {
    await renderTracker();

    expect(screen.getByText('—')).toBeOnTheScreen();
  });
});

describe('the hierarchy', () => {
  it('shows subjects collapsed, so a large syllabus is not overwhelming', async () => {
    await seed();
    await renderTracker();

    expect(screen.getByText('Mathematics')).toBeOnTheScreen();
    expect(screen.queryByText('Number Systems')).toBeNull();
    expect(screen.getByText('See Details')).toBeOnTheScreen();
  });

  it('reveals chapters when a subject is expanded', async () => {
    await seed();
    await renderTracker();

    fireEvent.press(screen.getByRole('button', { name: 'Mathematics' }));

    expect(screen.getByText('Number Systems')).toBeOnTheScreen();
    expect(screen.getByText('Hide Details')).toBeOnTheScreen();
    // Topics stay hidden until the chapter itself is expanded.
    expect(screen.queryByText('Decimal')).toBeNull();
  });

  it('reveals topics when a chapter is expanded', async () => {
    await seed();
    await renderTracker();

    fireEvent.press(screen.getByRole('button', { name: 'Mathematics' }));
    fireEvent.press(screen.getByRole('button', { name: 'Number Systems' }));

    expect(screen.getByText('Decimal')).toBeOnTheScreen();
    expect(screen.getByText('Real Number')).toBeOnTheScreen();
  });

  it('exposes the expanded state to assistive technology', async () => {
    await seed();
    await renderTracker();

    const subject = screen.getByRole('button', { name: 'Mathematics' });
    expect(subject.props.accessibilityState.expanded).toBe(false);

    fireEvent.press(subject);

    expect(
      screen.getByRole('button', { name: 'Mathematics' }).props.accessibilityState.expanded,
    ).toBe(true);
  });
});

describe('ticking a topic', () => {
  /**
   * PRD §10's headline requirement, through the real UI and real storage:
   * checking one topic moves chapter, subject and overall together.
   */
  it('updates every level of progress at once', async () => {
    await seed();
    await renderTracker();

    fireEvent.press(screen.getByRole('button', { name: 'Mathematics' }));
    fireEvent.press(screen.getByRole('button', { name: 'Number Systems' }));

    expect(screen.getByText('0.00%')).toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(screen.getByRole('checkbox', { name: 'Decimal' }));
    });

    await waitFor(() => expect(screen.getByText('50.00%')).toBeOnTheScreen());
    // Chapter and subject both read 50.0% at one decimal place.
    expect(screen.getAllByText('50.0%').length).toBeGreaterThanOrEqual(2);
  });

  it('reflects the checked state to assistive technology', async () => {
    await seed();
    await renderTracker();

    fireEvent.press(screen.getByRole('button', { name: 'Mathematics' }));
    fireEvent.press(screen.getByRole('button', { name: 'Number Systems' }));

    await act(async () => {
      fireEvent.press(screen.getByRole('checkbox', { name: 'Decimal' }));
    });

    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: 'Decimal' }).props.accessibilityState.checked,
      ).toBe(true),
    );
  });

  it('unticks a topic that was complete', async () => {
    const { chapterId } = await seed();
    const topicId = tracker().subjects[0]!.chapters[0]!.topics[0]!.id;
    await act(async () => {
      await tracker().toggleTopic(topicId);
    });
    await renderTracker();

    fireEvent.press(screen.getByRole('button', { name: 'Mathematics' }));
    fireEvent.press(screen.getByRole('button', { name: 'Number Systems' }));

    await act(async () => {
      fireEvent.press(screen.getByRole('checkbox', { name: 'Decimal' }));
    });

    await waitFor(() => expect(screen.getByText('0.00%')).toBeOnTheScreen());
    expect(chapterId).toBeDefined();
  });
});

describe('adding a subject', () => {
  it('creates the subject and shows it in the tracker', async () => {
    await renderTracker();

    openAddSubject();
    fireEvent.changeText(screen.getByLabelText('Name'), 'Science');
    await act(async () => {
      fireEvent.press(getInModal('Add'));
    });

    await waitFor(() => expect(screen.getByText('Science')).toBeOnTheScreen());
  });

  /** An empty name must not reach the database, and the sheet must stay open. */
  it('refuses an empty name and keeps the sheet open', async () => {
    await renderTracker();

    openAddSubject();
    fireEvent.changeText(screen.getByLabelText('Name'), '   ');
    await act(async () => {
      fireEvent.press(getInModal('Add'));
    });

    expect(screen.getByText('Enter a name.')).toBeOnTheScreen();
    expect(tracker().subjects).toHaveLength(0);
  });

  it('can be cancelled without creating anything', async () => {
    await renderTracker();

    openAddSubject();
    fireEvent.press(getInModal('Cancel'));

    expect(tracker().subjects).toHaveLength(0);
  });

  it('trims the name before saving', async () => {
    await renderTracker();

    openAddSubject();
    fireEvent.changeText(screen.getByLabelText('Name'), '  Science  ');
    await act(async () => {
      fireEvent.press(getInModal('Add'));
    });

    await waitFor(() => expect(tracker().subjects[0]?.name).toBe('Science'));
  });
});

describe('the row menu', () => {
  it('deletes a subject', async () => {
    await seed();
    await renderTracker();

    fireEvent.press(screen.getByRole('button', { name: 'Options for Mathematics' }));
    await act(async () => {
      fireEvent.press(getInModal('Delete subject'));
    });

    await waitFor(() =>
      expect(screen.getByText('Which exam are you preparing for?')).toBeOnTheScreen(),
    );
  });

  it('adds a chapter through the subject menu', async () => {
    await seed();
    await renderTracker();

    fireEvent.press(screen.getByRole('button', { name: 'Options for Mathematics' }));
    fireEvent.press(getInModal('Add chapter'));
    fireEvent.changeText(screen.getByLabelText('Name'), 'Polynomials');
    await act(async () => {
      fireEvent.press(getInModal('Add'));
    });

    await waitFor(() =>
      expect(tracker().subjects[0]?.chapters.map((c) => c.name)).toEqual([
        'Number Systems',
        'Polynomials',
      ]),
    );
  });

  it('renames a subject, prefilled with its current name', async () => {
    await seed();
    await renderTracker();

    fireEvent.press(screen.getByRole('button', { name: 'Options for Mathematics' }));
    fireEvent.press(getInModal('Rename subject'));

    expect(screen.getByLabelText('Name').props.value).toBe('Mathematics');

    fireEvent.changeText(screen.getByLabelText('Name'), 'Maths');
    await act(async () => {
      fireEvent.press(getInModal('Rename'));
    });

    await waitFor(() => expect(screen.getByText('Maths')).toBeOnTheScreen());
  });
});

describe('the timer control', () => {
  /** Phase 5 turned this from a disabled placeholder into a working control. */
  it('opens the timer for the subject it belongs to', async () => {
    await seed();
    await renderTracker();

    fireEvent.press(screen.getByRole('button', { name: 'Start timer for Mathematics' }));

    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/timer',
        params: expect.objectContaining({ subjectName: 'Mathematics' }),
      }),
    );
  });

  it('passes the chapter through when started from a chapter', async () => {
    await seed();
    await renderTracker();
    fireEvent.press(screen.getByRole('button', { name: 'Mathematics' }));

    fireEvent.press(screen.getByRole('button', { name: 'Start timer for Number Systems' }));

    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          subjectName: 'Mathematics',
          chapterName: 'Number Systems',
        }),
      }),
    );
  });

  it('passes the whole path through when started from a topic', async () => {
    await seed();
    await renderTracker();
    fireEvent.press(screen.getByRole('button', { name: 'Mathematics' }));
    fireEvent.press(screen.getByRole('button', { name: 'Number Systems' }));

    fireEvent.press(screen.getByRole('button', { name: 'Start timer for Decimal' }));

    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          subjectName: 'Mathematics',
          chapterName: 'Number Systems',
          topicName: 'Decimal',
        }),
      }),
    );
  });
});

describe('failures', () => {
  it('shows a student-facing message when the syllabus cannot be read', async () => {
    jest
      .spyOn(repositories.subjects, 'listByUser')
      .mockRejectedValue(new Error('SQLITE_CORRUPT: database disk image is malformed'));

    await renderTracker();

    expect(
      screen.getByText('We could not open your syllabus. Try restarting PrepPilot.'),
    ).toBeOnTheScreen();
    // The raw driver error must never reach the screen.
    expect(screen.queryByText(/SQLITE_CORRUPT/)).toBeNull();
  });
});
