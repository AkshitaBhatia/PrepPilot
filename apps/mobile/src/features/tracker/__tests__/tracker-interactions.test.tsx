import { bundledTemplates, countTemplate } from '@preppilot/shared';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';
import type { Repositories } from '../../../db/client';
import { getRepositories } from '../../../db/client';
import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../../../db/test-support/test-database';
import { router } from 'expo-router';
import { getInModal, renderWithTheme } from '../../../test-utils/render';
import { useAuthStore } from '../../auth/auth-store';
import { ask, quizTopic, summariseTopic } from '../../ai/ai-client';
import { TrackerScreen } from '../tracker-screen';
import { resetTrackerStore, useTrackerStore } from '../tracker-store';
import { resetTrackersStore, useTrackersStore } from '../../trackers/trackers-store';

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
jest.mock('../../ai/ai-client', () => ({
  // Only the calls are stubbed. The copy is the real thing, so a test asserting
  // what a guest is told is asserting what a guest actually sees.
  ...jest.requireActual('../../ai/ai-client'),
  summariseTopic: jest.fn(),
  quizTopic: jest.fn(),
  ask: jest.fn(),
}));
jest.mock('../../../lib/supabase', () => ({
  getSupabase: jest.fn(),
  startAutoRefresh: jest.fn(() => jest.fn()),
}));

const USER = 'user-1';

const mockedSummarise = summariseTopic as jest.MockedFunction<typeof summariseTopic>;

/**
 * Walks the quiz one question at a time, as a student does: choose, check, move
 * on. `picks` is the option index to choose for each question.
 */
const withSubtopic = async (name = 'Recurring decimals') => {
  await seed();
  await renderTracker();
  expandAll();
  fireEvent.press(screen.getByRole('button', { name: 'Options for Decimal' }));
  fireEvent.press(getInModal('Add sub-topic'));
  fireEvent.changeText(screen.getByLabelText('Name'), name);
  await act(async () => {
    fireEvent.press(getInModal('Add'));
  });
  await waitFor(() => expect(screen.getByText(name)).toBeOnTheScreen());
};

const openMenu = (name: string) =>
  fireEvent.press(screen.getByRole('button', { name: `Options for ${name}` }));

async function answerQuiz(picks: readonly number[]) {
  for (const [questionIndex, option] of picks.entries()) {
    await waitFor(() =>
      expect(screen.getByTestId(`q${questionIndex}-option${option}`)).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByTestId(`q${questionIndex}-option${option}`));
    fireEvent.press(screen.getByTestId('quiz-check'));

    const last = questionIndex === picks.length - 1;
    await act(async () => {
      fireEvent.press(screen.getByTestId(last ? 'quiz-results' : 'quiz-next'));
    });
  }
}
const mockedQuiz = quizTopic as jest.MockedFunction<typeof quizTopic>;
const mockedAsk = ask as jest.MockedFunction<typeof ask>;

/** Correct answers are options 0, 1 and 2 in order. */
const sampleQuiz = {
  topicName: 'Decimal',
  questions: [0, 1, 2].map((answerIndex, n) => ({
    question: `Question ${n + 1}?`,
    options: ['One', 'Two', 'Three', 'Four'],
    answerIndexes: [answerIndex],
    explanation: `Because ${n + 1}.`,
  })),
};

let db: ReturnType<typeof createTestDatabase>;
let repositories: Repositories;

const tracker = () => useTrackerStore.getState();

beforeEach(() => {
  db = createTestDatabase();
  const clock = createTestClock();
  repositories = createTestRepositories(db, clock);
  (getRepositories as jest.MockedFunction<typeof getRepositories>).mockReturnValue(repositories);
  resetTrackerStore();
  resetTrackersStore();
  // Navigation is a shared mock: without this, a test asserting "we did not
  // navigate" sees a push made by the test before it.
  (router.push as jest.Mock).mockClear();
  mockedSummarise.mockReset();
  mockedQuiz.mockReset();
  mockedAsk.mockReset();
  useAuthStore.setState({ user: { id: USER } as never, status: 'signedIn', isGuest: false });
});

afterEach(() => {
  db.$close();
});

async function seed({ withTopics = true } = {}) {
  await act(async () => {
    await tracker().load(USER, repositories);
    await tracker().addSubject('Mathematics');
  });
  const subjectId = tracker().subjects[0]!.id;

  await act(async () => {
    await tracker().addChapter(subjectId, 'Number Systems');
  });
  const chapterId = tracker().subjects[0]!.chapters[0]!.id;

  if (withTopics) {
    await act(async () => {
      await tracker().addTopic(chapterId, 'Decimal');
    });
  }

  return { subjectId, chapterId };
}

const renderTracker = async () => {
  const view = renderWithTheme(<TrackerScreen />);
  await waitFor(() => expect(tracker().loading).toBe(false));
  return view;
};

/** Opens Mathematics, then Number Systems. */
const expandAll = () => {
  fireEvent.press(screen.getByRole('button', { name: 'Mathematics' }));
  fireEvent.press(screen.getByRole('button', { name: 'Number Systems' }));
};

describe('chapter actions', () => {
  it('adds a topic from the chapter’s Add New Topic button', async () => {
    await seed({ withTopics: false });
    await renderTracker();
    expandAll();

    fireEvent.press(screen.getByRole('button', { name: 'Add New Topic' }));
    fireEvent.changeText(screen.getByLabelText('Name'), 'Decimal');
    await act(async () => {
      fireEvent.press(getInModal('Add'));
    });

    await waitFor(() => expect(screen.getByText('Decimal')).toBeOnTheScreen());
  });

  it('adds a topic from the chapter menu', async () => {
    await seed({ withTopics: false });
    await renderTracker();
    expandAll();

    fireEvent.press(screen.getByRole('button', { name: 'Options for Number Systems' }));
    fireEvent.press(getInModal('Add topic'));
    fireEvent.changeText(screen.getByLabelText('Name'), 'Real Number');
    await act(async () => {
      fireEvent.press(getInModal('Add'));
    });

    await waitFor(() => expect(screen.getByText('Real Number')).toBeOnTheScreen());
  });

  it('deletes a chapter', async () => {
    await seed();
    await renderTracker();
    fireEvent.press(screen.getByRole('button', { name: 'Mathematics' }));

    fireEvent.press(screen.getByRole('button', { name: 'Options for Number Systems' }));
    await act(async () => {
      fireEvent.press(getInModal('Delete chapter'));
    });

    await waitFor(() => expect(tracker().subjects[0]?.chapters).toHaveLength(0));
    expect(
      screen.getByText('No chapters yet. Add one to start building this subject.'),
    ).toBeOnTheScreen();
  });

  it('prompts an empty chapter to gain a topic', async () => {
    await seed({ withTopics: false });
    await renderTracker();
    expandAll();

    expect(
      screen.getByText('No topics yet. Add one to start tracking this chapter.'),
    ).toBeOnTheScreen();
  });

  it('adds a chapter from the subject’s Add New Chapter button', async () => {
    await seed({ withTopics: false });
    await renderTracker();
    fireEvent.press(screen.getByRole('button', { name: 'Mathematics' }));

    fireEvent.press(screen.getByRole('button', { name: 'Add New Chapter' }));
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
});

describe('topic actions', () => {
  it('deletes a topic and recomputes progress', async () => {
    await seed();
    await renderTracker();
    expandAll();

    fireEvent.press(screen.getByRole('button', { name: 'Options for Decimal' }));
    await act(async () => {
      fireEvent.press(getInModal('Delete topic'));
    });

    await waitFor(() => expect(screen.queryByText('Decimal')).toBeNull());
    expect(tracker().progress.overall.total).toBe(0);
  });
});

describe('the row menu sheet', () => {
  it('closes when the backdrop is tapped', async () => {
    await seed();
    await renderTracker();

    fireEvent.press(screen.getByRole('button', { name: 'Options for Mathematics' }));
    expect(screen.queryAllByRole('button', { name: 'Delete subject' }).length).toBeGreaterThan(0);

    fireEvent.press(getInModal('Dismiss Options for Mathematics'));

    await waitFor(() =>
      expect(screen.queryAllByRole('button', { name: 'Delete subject' })).toHaveLength(0),
    );
  });
});

describe('the name prompt', () => {
  it('rejects a name that is too long', async () => {
    await renderTracker();

    openAddSubject();
    fireEvent.changeText(screen.getByLabelText('Name'), 'a'.repeat(121));
    await act(async () => {
      fireEvent.press(getInModal('Add'));
    });

    expect(screen.getByText('That name is too long.')).toBeOnTheScreen();
    expect(tracker().subjects).toHaveLength(0);
  });

  it('clears the error once the student types again', async () => {
    await renderTracker();

    openAddSubject();
    await act(async () => {
      fireEvent.press(getInModal('Add'));
    });
    expect(screen.getByText('Enter a name.')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByLabelText('Name'), 'S');

    expect(screen.queryByText('Enter a name.')).toBeNull();
  });

  it('does not carry a previous entry into the next prompt', async () => {
    await renderTracker();

    openAddSubject();
    fireEvent.changeText(screen.getByLabelText('Name'), 'Abandoned');
    fireEvent.press(getInModal('Cancel'));

    openAddSubject();

    expect(screen.getByLabelText('Name').props.value).toBe('');
  });
});

describe('editing from the menus', () => {
  it('renames a chapter', async () => {
    await seed();
    await renderTracker();
    fireEvent.press(screen.getByRole('button', { name: 'Mathematics' }));

    fireEvent.press(screen.getByRole('button', { name: 'Options for Number Systems' }));
    fireEvent.press(getInModal('Rename chapter'));
    fireEvent.changeText(screen.getByLabelText('Name'), 'Chapter 1');
    await act(async () => {
      fireEvent.press(getInModal('Rename'));
    });

    await waitFor(() => expect(tracker().subjects[0]?.chapters[0]?.name).toBe('Chapter 1'));
  });

  it('renames a topic', async () => {
    await seed();
    await renderTracker();
    expandAll();

    fireEvent.press(screen.getByRole('button', { name: 'Options for Decimal' }));
    fireEvent.press(getInModal('Rename topic'));
    fireEvent.changeText(screen.getByLabelText('Name'), 'Decimals');
    await act(async () => {
      fireEvent.press(getInModal('Rename'));
    });

    await waitFor(() =>
      expect(tracker().subjects[0]?.chapters[0]?.topics[0]?.name).toBe('Decimals'),
    );
  });

  /** A description must be clearable, unlike a name. */
  it('edits and clears a subject description', async () => {
    await seed();
    await renderTracker();

    fireEvent.press(screen.getByRole('button', { name: 'Options for Mathematics' }));
    fireEvent.press(getInModal('Edit description'));
    fireEvent.changeText(screen.getByLabelText('Description'), 'NCERT Class 10');
    await act(async () => {
      fireEvent.press(getInModal('Save'));
    });

    await waitFor(() => expect(tracker().subjects[0]?.description).toBe('NCERT Class 10'));

    fireEvent.press(screen.getByRole('button', { name: 'Options for Mathematics' }));
    fireEvent.press(getInModal('Edit description'));
    fireEvent.changeText(screen.getByLabelText('Description'), '');
    await act(async () => {
      fireEvent.press(getInModal('Save'));
    });

    await waitFor(() => expect(tracker().subjects[0]?.description).toBe(''));
  });

  it('moves a subject down from its menu', async () => {
    await seed();
    await act(async () => {
      await tracker().addSubject('Science');
    });
    await renderTracker();

    fireEvent.press(screen.getByRole('button', { name: 'Options for Mathematics' }));
    await act(async () => {
      fireEvent.press(getInModal('Move down'));
    });

    await waitFor(() =>
      expect(tracker().subjects.map((s) => s.name)).toEqual(['Science', 'Mathematics']),
    );
  });

  it('shows a subject description once set', async () => {
    const { subjectId } = await seed();
    await act(async () => {
      await tracker().setSubjectDescription(subjectId, 'NCERT Class 10');
    });
    await renderTracker();

    expect(screen.getByText('NCERT Class 10')).toBeOnTheScreen();
  });
});

describe('reordering from the menus', () => {
  it('moves a chapter down', async () => {
    await seed();
    await act(async () => {
      await tracker().addChapter(tracker().subjects[0]!.id, 'Polynomials');
    });
    await renderTracker();
    fireEvent.press(screen.getByRole('button', { name: 'Mathematics' }));

    fireEvent.press(screen.getByRole('button', { name: 'Options for Number Systems' }));
    await act(async () => {
      fireEvent.press(getInModal('Move down'));
    });

    await waitFor(() =>
      expect(tracker().subjects[0]?.chapters.map((c) => c.name)).toEqual([
        'Polynomials',
        'Number Systems',
      ]),
    );
  });

  it('moves a chapter back up', async () => {
    await seed();
    await act(async () => {
      await tracker().addChapter(tracker().subjects[0]!.id, 'Polynomials');
      await tracker().moveChapter(
        tracker().subjects[0]!.id,
        tracker().subjects[0]!.chapters[0]!.id,
        'down',
      );
    });
    await renderTracker();
    fireEvent.press(screen.getByRole('button', { name: 'Mathematics' }));

    fireEvent.press(screen.getByRole('button', { name: 'Options for Number Systems' }));
    await act(async () => {
      fireEvent.press(getInModal('Move up'));
    });

    await waitFor(() =>
      expect(tracker().subjects[0]?.chapters.map((c) => c.name)).toEqual([
        'Number Systems',
        'Polynomials',
      ]),
    );
  });

  it('moves a topic down and back up', async () => {
    await seed();
    await act(async () => {
      await tracker().addTopic(tracker().subjects[0]!.chapters[0]!.id, 'Real Number');
    });
    await renderTracker();
    expandAll();

    fireEvent.press(screen.getByRole('button', { name: 'Options for Decimal' }));
    await act(async () => {
      fireEvent.press(getInModal('Move down'));
    });
    await waitFor(() =>
      expect(tracker().subjects[0]?.chapters[0]?.topics.map((t) => t.name)).toEqual([
        'Real Number',
        'Decimal',
      ]),
    );

    fireEvent.press(screen.getByRole('button', { name: 'Options for Decimal' }));
    await act(async () => {
      fireEvent.press(getInModal('Move up'));
    });
    await waitFor(() =>
      expect(tracker().subjects[0]?.chapters[0]?.topics.map((t) => t.name)).toEqual([
        'Decimal',
        'Real Number',
      ]),
    );
  });

  it('moves a subject up', async () => {
    await seed();
    await act(async () => {
      await tracker().addSubject('Science');
      await tracker().moveSubject(tracker().subjects[0]!.id, 'down');
    });
    await renderTracker();

    fireEvent.press(screen.getByRole('button', { name: 'Options for Mathematics' }));
    await act(async () => {
      fireEvent.press(getInModal('Move up'));
    });

    await waitFor(() =>
      expect(tracker().subjects.map((s) => s.name)).toEqual(['Mathematics', 'Science']),
    );
  });

  /** A destructive action is styled differently, so both branches render. */
  it('shows destructive and ordinary actions together', async () => {
    await seed();
    await renderTracker();

    fireEvent.press(screen.getByRole('button', { name: 'Options for Mathematics' }));

    expect(getInModal('Delete subject')).toBeOnTheScreen();
    expect(getInModal('Rename subject')).toBeOnTheScreen();
  });

  it('starts a timer for a topic from its play button', async () => {
    await seed();
    await renderTracker();
    expandAll();

    fireEvent.press(screen.getByRole('button', { name: 'Start timer for Decimal' }));

    expect(router.push).toHaveBeenCalled();
  });
});

describe('pull to refresh', () => {
  it('re-reads the syllabus, picking up changes made elsewhere', async () => {
    const { chapterId } = await seed();
    await renderTracker();

    // Simulates a change arriving from outside this screen — a template import
    // or, later, a sync pull.
    await repositories.topics.create({ userId: USER, chapterId, name: 'Real Number' });

    await act(async () => {
      screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });

    await waitFor(() => expect(tracker().progress.overall.total).toBe(2));
  });
});

describe('recovering from a failure', () => {
  it('retries loading when the student asks', async () => {
    const listByUser = jest
      .spyOn(repositories.subjects, 'listByUser')
      .mockRejectedValueOnce(new Error('SQLITE_BUSY'));

    await renderTracker();
    expect(
      screen.getByText('We could not open your syllabus. Try restarting PrepPilot.'),
    ).toBeOnTheScreen();

    listByUser.mockRestore();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Reload' }));
    });

    await waitFor(() =>
      expect(screen.getByText('Which exam are you preparing for?')).toBeOnTheScreen(),
    );
  });
});

/**
 * Sub-topics are the optional fourth level. Nothing creates them, so a topic
 * only ever grows one because a student asked for it.
 */
describe('sub-topics on screen', () => {
  const addSubtopic = async (name: string) => {
    fireEvent.press(screen.getByRole('button', { name: 'Options for Decimal' }));
    fireEvent.press(getInModal('Add sub-topic'));
    fireEvent.changeText(screen.getByLabelText('Name'), name);
    await act(async () => {
      fireEvent.press(getInModal('Add'));
    });
  };

  it('is not offered on a topic that has none until asked for', async () => {
    await seed();
    await renderTracker();
    expandAll();

    // No disclosure clutters a topic that has not been broken down.
    expect(screen.queryByText(/Show \d+ sub-topic/)).toBeNull();
  });

  it('adds one from the topic menu and opens the topic to show it', async () => {
    await seed();
    await renderTracker();
    expandAll();

    await addSubtopic('Recurring decimals');

    await waitFor(() => expect(screen.getByText('Recurring decimals')).toBeOnTheScreen());
  });

  it('collapses and reopens the list', async () => {
    await seed();
    await renderTracker();
    expandAll();
    await addSubtopic('Recurring decimals');

    fireEvent.press(screen.getByRole('button', { name: 'Hide sub-topics of Decimal' }));
    expect(screen.queryByText('Recurring decimals')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Show sub-topics of Decimal' }));
    expect(screen.getByText('Recurring decimals')).toBeOnTheScreen();
  });

  it('ticks a sub-topic and moves the figures above it', async () => {
    await seed();
    await renderTracker();
    expandAll();
    await addSubtopic('Recurring decimals');
    await addSubtopic('Terminating decimals');

    await act(async () => {
      fireEvent.press(screen.getAllByRole('checkbox', { name: 'Recurring decimals' }).at(-1)!);
    });

    await waitFor(() => expect(tracker().progress.overall.percent).toBe(50));
  });

  it('renames one', async () => {
    await seed();
    await renderTracker();
    expandAll();
    await addSubtopic('Typo');

    fireEvent.press(screen.getByRole('button', { name: 'Options for Typo' }));
    fireEvent.press(getInModal('Rename sub-topic'));
    fireEvent.changeText(screen.getByLabelText('Name'), 'Fixed');
    await act(async () => {
      fireEvent.press(getInModal('Rename'));
    });

    await waitFor(() => expect(screen.getByText('Fixed')).toBeOnTheScreen());
  });

  it('deletes one', async () => {
    await seed();
    await renderTracker();
    expandAll();
    await addSubtopic('Doomed');

    fireEvent.press(screen.getByRole('button', { name: 'Options for Doomed' }));
    await act(async () => {
      fireEvent.press(getInModal('Delete sub-topic'));
    });

    await waitFor(() => expect(screen.queryByText('Doomed')).toBeNull());
  });

  it('adds another from the button inside the open list', async () => {
    await seed();
    await renderTracker();
    expandAll();
    await addSubtopic('First');

    fireEvent.press(screen.getByRole('button', { name: 'Add sub-topic' }));
    fireEvent.changeText(screen.getByLabelText('Name'), 'Second');
    await act(async () => {
      fireEvent.press(getInModal('Add'));
    });

    await waitFor(() => expect(screen.getByText('Second')).toBeOnTheScreen());
  });
});

describe('notes on a topic', () => {
  const openNote = () => {
    fireEvent.press(screen.getByRole('button', { name: 'Options for Decimal' }));
    fireEvent.press(getInModal('Add note'));
  };

  it('writes one and shows it under the topic', async () => {
    await seed();
    await renderTracker();
    expandAll();

    openNote();
    fireEvent.changeText(screen.getByLabelText('Description'), 'Recurring means repeating.');
    await act(async () => {
      fireEvent.press(getInModal('Save'));
    });

    await waitFor(() => expect(screen.getByText('Recurring means repeating.')).toBeOnTheScreen());
  });

  it('offers to edit rather than add once one exists', async () => {
    await seed();
    await renderTracker();
    expandAll();
    openNote();
    fireEvent.changeText(screen.getByLabelText('Description'), 'A note');
    await act(async () => {
      fireEvent.press(getInModal('Save'));
    });

    fireEvent.press(screen.getByRole('button', { name: 'Options for Decimal' }));

    expect(getInModal('Edit note')).toBeTruthy();
  });

  /** An emptied note is no note, not a blank card taking up space. */
  it('removes the note when it is cleared', async () => {
    await seed();
    await renderTracker();
    expandAll();
    openNote();
    fireEvent.changeText(screen.getByLabelText('Description'), 'Temporary');
    await act(async () => {
      fireEvent.press(getInModal('Save'));
    });
    await waitFor(() => expect(screen.getByText('Temporary')).toBeOnTheScreen());

    fireEvent.press(screen.getByRole('button', { name: 'Edit note on Decimal' }));
    fireEvent.changeText(screen.getByLabelText('Description'), '');
    await act(async () => {
      fireEvent.press(getInModal('Save'));
    });

    await waitFor(() => expect(screen.queryByText('Temporary')).toBeNull());
  });
});

/**
 * The first question the app asks. One answer fills in a whole syllabus, which
 * is the point — and the template library used to be reachable only from an
 * empty state, so a student with even one subject could never find it again.
 */
describe('choosing an exam', () => {
  const firstExam = () => {
    const exam = bundledTemplates.find((entry) => entry.category === 'exam');
    if (exam === undefined) throw new Error('The library needs one exam template.');
    return exam;
  };

  it('imports the whole syllabus for the exam chosen', async () => {
    const exam = firstExam();
    const expected = countTemplate(exam);
    await act(async () => {
      await tracker().load(USER, repositories);
    });
    await renderTracker();

    await act(async () => {
      fireEvent.press(screen.getByTestId(`exam-${exam.id}`));
    });

    await waitFor(() => expect(tracker().subjects).toHaveLength(expected.subjects));
    expect(tracker().progress.overall.total).toBe(expected.topics);
  });

  it('replaces the question with the syllabus once it is in', async () => {
    const exam = firstExam();
    await act(async () => {
      await tracker().load(USER, repositories);
    });
    await renderTracker();

    await act(async () => {
      fireEvent.press(screen.getByTestId(`exam-${exam.id}`));
    });

    await waitFor(() => expect(screen.queryByText('Which exam are you preparing for?')).toBeNull());
  });

  it('lets a student whose course is not listed add their own instead', async () => {
    await act(async () => {
      await tracker().load(USER, repositories);
    });
    await renderTracker();

    fireEvent.press(screen.getByTestId('own-subjects'));
    fireEvent.changeText(screen.getByLabelText('Name'), 'Organic Chemistry');
    await act(async () => {
      fireEvent.press(getInModal('Add'));
    });

    await waitFor(() =>
      expect(tracker().subjects.map((s) => s.name)).toEqual(['Organic Chemistry']),
    );
  });

  it('opens the full library from the shortlist', async () => {
    await act(async () => {
      await tracker().load(USER, repositories);
    });
    await renderTracker();

    fireEvent.press(screen.getByTestId('see-all-courses'));

    expect(router.push).toHaveBeenCalledWith('/templates');
  });

  it('says so on the card while the syllabus is going in', async () => {
    // A large syllabus takes a moment; a card that looks untouched invites a
    // second tap and a second copy of the whole thing.
    const exam = firstExam();
    await act(async () => {
      await tracker().load(USER, repositories);
    });
    await renderTracker();

    fireEvent.press(screen.getByTestId(`exam-${exam.id}`));

    await waitFor(() => expect(screen.getByText('Adding it to your tracker…')).toBeOnTheScreen());
    await waitFor(() => expect(tracker().subjects.length).toBeGreaterThan(0));
  });
});

/**
 * The template library sits behind a header button now, on every screen. It was
 * previously reachable only from the tracker's empty state, which a student with
 * any subject at all could never see.
 */
describe('the header', () => {
  it('reaches the course library from a tracker that already has subjects', async () => {
    await seed();
    await renderTracker();

    fireEvent.press(screen.getByTestId('header-courses'));

    expect(router.push).toHaveBeenCalledWith('/templates');
  });

  it('reaches the assistant and settings', async () => {
    await seed();
    await renderTracker();

    fireEvent.press(screen.getByTestId('header-assistant'));
    expect(router.push).toHaveBeenCalledWith('/assistant');

    fireEvent.press(screen.getByTestId('header-settings'));
    expect(router.push).toHaveBeenCalledWith('/settings');
  });
});

/**
 * Summaries and quizzes are built from the topic's name and its place in the
 * syllabus, because a template stores names and nothing else. Neither can block
 * a student from ticking a topic (D55).
 */
describe('asking the assistant about a topic', () => {
  const openTopicMenu = async () => {
    await seed();
    await renderTracker();
    expandAll();
    fireEvent.press(screen.getByRole('button', { name: 'Options for Decimal' }));
  };

  it('summarises it, and sends where it sits in the syllabus', async () => {
    mockedSummarise.mockResolvedValue({ ok: true, summary: 'A decimal is a base-ten fraction.' });
    await openTopicMenu();

    await act(async () => {
      fireEvent.press(getInModal('Summarise'));
    });

    await waitFor(() => expect(screen.getByTestId('topic-summary')).toBeOnTheScreen());
    expect(screen.getByText('A decimal is a base-ten fraction.')).toBeOnTheScreen();
    expect(mockedSummarise).toHaveBeenCalledWith({
      topicName: 'Decimal',
      chapterName: 'Number Systems',
      subjectName: 'Mathematics',
    });
  });

  it('never marks anything complete from a summary', async () => {
    mockedSummarise.mockResolvedValue({ ok: true, summary: 'A summary.' });
    await openTopicMenu();

    await act(async () => {
      fireEvent.press(getInModal('Summarise'));
    });

    const topic = tracker().subjects[0]!.chapters[0]!.topics[0]!;
    expect(topic.completed).toBe(false);
  });

  it('says so when the assistant cannot help, rather than failing silently', async () => {
    mockedSummarise.mockResolvedValue({ ok: false, message: 'The assistant is off in the demo.' });
    await openTopicMenu();

    await act(async () => {
      fireEvent.press(getInModal('Summarise'));
    });

    await waitFor(() => expect(screen.getByTestId('ai-error')).toBeOnTheScreen());
  });

  it('marks the topic complete when all three questions are right', async () => {
    mockedQuiz.mockResolvedValue({ ok: true, quiz: sampleQuiz });
    await openTopicMenu();

    await act(async () => {
      fireEvent.press(getInModal('Test me on this'));
    });
    await answerQuiz([0, 1, 2]);
    await act(async () => {
      fireEvent.press(screen.getByTestId('quiz-finish'));
    });

    await waitFor(() =>
      expect(tracker().subjects[0]!.chapters[0]!.topics[0]!.completed).toBe(true),
    );
  });

  /** The check finds out whether you understood it. It is not a gate. */
  it('leaves the topic alone when an answer was wrong', async () => {
    mockedQuiz.mockResolvedValue({ ok: true, quiz: sampleQuiz });
    await openTopicMenu();

    await act(async () => {
      fireEvent.press(getInModal('Test me on this'));
    });
    await answerQuiz([3, 1, 2]);

    expect(screen.getByTestId('quiz-outcome')).toHaveTextContent(/2 of 3 right/);

    await act(async () => {
      fireEvent.press(screen.getByTestId('quiz-finish'));
    });

    expect(tracker().subjects[0]!.chapters[0]!.topics[0]!.completed).toBe(false);
  });

  it('will not check a question until something is chosen', async () => {
    mockedQuiz.mockResolvedValue({ ok: true, quiz: sampleQuiz });
    await openTopicMenu();

    await act(async () => {
      fireEvent.press(getInModal('Test me on this'));
    });
    await waitFor(() => expect(screen.getByTestId('quiz-check')).toBeOnTheScreen());

    expect(screen.getByTestId('quiz-check').props.accessibilityState.disabled).toBe(true);
  });

  it('shows one question at a time', async () => {
    // Three questions with four options each did not fit the sheet, and a wall
    // of twelve choices is not how anyone reads a question.
    mockedQuiz.mockResolvedValue({ ok: true, quiz: sampleQuiz });
    await openTopicMenu();

    await act(async () => {
      fireEvent.press(getInModal('Test me on this'));
    });
    await waitFor(() => expect(screen.getByTestId('q0-option0')).toBeOnTheScreen());

    expect(screen.queryByTestId('q1-option0')).toBeNull();
    expect(screen.queryByTestId('q2-option0')).toBeNull();
  });

  it('says whether each answer was right before moving on', async () => {
    mockedQuiz.mockResolvedValue({ ok: true, quiz: sampleQuiz });
    await openTopicMenu();

    await act(async () => {
      fireEvent.press(getInModal('Test me on this'));
    });
    await waitFor(() => expect(screen.getByTestId('q0-option0')).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId('q0-option0'));
    fireEvent.press(screen.getByTestId('quiz-check'));

    expect(screen.getByTestId('q0-feedback')).toHaveTextContent(/Correct/);
    expect(screen.getByText('Because 1.')).toBeOnTheScreen();
  });

  /** A score that can be revised after seeing the answer is not a score. */
  it('locks a question once it has been checked', async () => {
    mockedQuiz.mockResolvedValue({ ok: true, quiz: sampleQuiz });
    await openTopicMenu();

    await act(async () => {
      fireEvent.press(getInModal('Test me on this'));
    });
    await waitFor(() => expect(screen.getByTestId('q0-option0')).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId('q0-option0'));
    fireEvent.press(screen.getByTestId('quiz-check'));
    fireEvent.press(screen.getByTestId('q0-option1'));

    expect(screen.getByTestId('q0-option1').props.accessibilityState.checked).toBe(false);
  });

  it('goes back to review an earlier question', async () => {
    mockedQuiz.mockResolvedValue({ ok: true, quiz: sampleQuiz });
    await openTopicMenu();

    await act(async () => {
      fireEvent.press(getInModal('Test me on this'));
    });
    await waitFor(() => expect(screen.getByTestId('q0-option0')).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId('q0-option0'));
    fireEvent.press(screen.getByTestId('quiz-check'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('quiz-next'));
    });
    await waitFor(() => expect(screen.getByTestId('q1-option0')).toBeOnTheScreen());

    await act(async () => {
      fireEvent.press(screen.getByTestId('quiz-previous'));
    });

    expect(screen.getByTestId('q0-feedback')).toBeOnTheScreen();
  });

  it('keeps the checkbox working regardless of the quiz', async () => {
    // Ticking a topic is the app's core action and must never need a network.
    await seed();
    await renderTracker();
    expandAll();

    await act(async () => {
      fireEvent.press(screen.getAllByRole('checkbox', { name: 'Decimal' }).at(-1)!);
    });

    await waitFor(() =>
      expect(tracker().subjects[0]!.chapters[0]!.topics[0]!.completed).toBe(true),
    );
    expect(mockedQuiz).not.toHaveBeenCalled();
  });
});

/**
 * A student who has broken a topic into parts is working at that level, so
 * offering less there would push them back up to a level they moved past.
 */
describe('sub-topics do everything topics do', () => {
  it('offers the same actions a topic does', async () => {
    await withSubtopic();

    openMenu('Recurring decimals');

    for (const label of [
      'Rename sub-topic',
      'Summarise',
      'Test me on this',
      'Add note',
      'Move up',
      'Move down',
      'Delete sub-topic',
    ]) {
      expect(getInModal(label)).toBeTruthy();
    }
  });

  it('writes a note against one', async () => {
    await withSubtopic();

    openMenu('Recurring decimals');
    fireEvent.press(getInModal('Add note'));
    fireEvent.changeText(screen.getByLabelText('Description'), '0.333… repeats forever.');
    await act(async () => {
      fireEvent.press(getInModal('Save'));
    });

    await waitFor(() => expect(screen.getByText('0.333… repeats forever.')).toBeOnTheScreen());
  });

  it('reorders them', async () => {
    await withSubtopic('First');
    fireEvent.press(screen.getByRole('button', { name: 'Options for Decimal' }));
    fireEvent.press(getInModal('Add sub-topic'));
    fireEvent.changeText(screen.getByLabelText('Name'), 'Second');
    await act(async () => {
      fireEvent.press(getInModal('Add'));
    });
    await waitFor(() => expect(screen.getByText('Second')).toBeOnTheScreen());

    openMenu('Second');
    await act(async () => {
      fireEvent.press(getInModal('Move up'));
    });

    const names = tracker().subjects[0]!.chapters[0]!.topics[0]!.subtopics.map((s) => s.name);
    expect(names).toEqual(['Second', 'First']);
  });

  it('summarises one, naming the topic it sits under', async () => {
    // "Refraction" alone means little; "Refraction, under Light" is a topic.
    mockedSummarise.mockResolvedValue({ ok: true, summary: 'A repeating decimal.' });
    await withSubtopic();

    openMenu('Recurring decimals');
    await act(async () => {
      fireEvent.press(getInModal('Summarise'));
    });

    await waitFor(() => expect(screen.getByTestId('topic-summary')).toBeOnTheScreen());
    expect(mockedSummarise).toHaveBeenCalledWith({
      topicName: 'Recurring decimals',
      chapterName: 'Decimal',
      subjectName: 'Mathematics · Number Systems',
    });
  });

  it('ticks the sub-topic, not its parent, when its quiz is passed', async () => {
    mockedQuiz.mockResolvedValue({
      ok: true,
      quiz: { ...sampleQuiz, topicName: 'Recurring decimals' },
    });
    await withSubtopic();

    openMenu('Recurring decimals');
    await act(async () => {
      fireEvent.press(getInModal('Test me on this'));
    });
    await answerQuiz([0, 1, 2]);
    await act(async () => {
      fireEvent.press(screen.getByTestId('quiz-finish'));
    });

    await waitFor(() => {
      const topic = tracker().subjects[0]!.chapters[0]!.topics[0]!;
      expect(topic.subtopics[0]!.completed).toBe(true);
    });
  });

  it('deletes one', async () => {
    await withSubtopic('Doomed');

    openMenu('Doomed');
    await act(async () => {
      fireEvent.press(getInModal('Delete sub-topic'));
    });

    await waitFor(() => expect(screen.queryByText('Doomed')).toBeNull());
  });
});

/**
 * A question may have several correct options. The student has to be told, and
 * has to be able to pick more than one — otherwise it is a trick, not a test.
 */
describe('a question with more than one correct answer', () => {
  const multiQuiz = {
    topicName: 'Decimal',
    questions: [
      {
        question: 'Select all that apply. Which repeat?',
        options: ['1/3', '1/2', '2/3', '1/4'],
        answerIndexes: [0, 2],
        explanation: 'Thirds recur; halves and quarters terminate.',
      },
      {
        question: 'Question 2?',
        options: ['One', 'Two', 'Three', 'Four'],
        answerIndexes: [1],
        explanation: 'Because 2.',
      },
      {
        question: 'Question 3?',
        options: ['One', 'Two', 'Three', 'Four'],
        answerIndexes: [2],
        explanation: 'Because 3.',
      },
    ],
  };

  const start = async () => {
    mockedQuiz.mockResolvedValue({ ok: true, quiz: multiQuiz });
    await seed();
    await renderTracker();
    expandAll();
    fireEvent.press(screen.getByRole('button', { name: 'Options for Decimal' }));
    await act(async () => {
      fireEvent.press(getInModal('Test me on this'));
    });
    await waitFor(() => expect(screen.getByTestId('q0-option0')).toBeOnTheScreen());
  };

  it('says so, rather than leaving the student to guess', async () => {
    await start();

    expect(screen.getByTestId('multi-answer-hint')).toBeOnTheScreen();
  });

  it('keeps both selections instead of replacing one with the other', async () => {
    await start();

    fireEvent.press(screen.getByTestId('q0-option0'));
    fireEvent.press(screen.getByTestId('q0-option2'));

    expect(screen.getByTestId('q0-option0').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('q0-option2').props.accessibilityState.checked).toBe(true);
  });

  it('lets a selection be taken back before checking', async () => {
    await start();

    fireEvent.press(screen.getByTestId('q0-option0'));
    fireEvent.press(screen.getByTestId('q0-option0'));

    expect(screen.getByTestId('q0-option0').props.accessibilityState.checked).toBe(false);
  });

  it('is right only for the exact set', async () => {
    await start();

    fireEvent.press(screen.getByTestId('q0-option0'));
    fireEvent.press(screen.getByTestId('quiz-check'));

    // One of the two correct options is not the answer.
    expect(screen.getByTestId('q0-feedback')).toHaveTextContent(/Not quite/);
  });

  it('is right when both correct options are chosen', async () => {
    await start();

    fireEvent.press(screen.getByTestId('q0-option0'));
    fireEvent.press(screen.getByTestId('q0-option2'));
    fireEvent.press(screen.getByTestId('quiz-check'));

    expect(screen.getByTestId('q0-feedback')).toHaveTextContent(/Correct/);
  });

  it('replaces the choice on a single-answer question', async () => {
    // The second question expects one answer, so tapping another swaps it.
    await start();
    fireEvent.press(screen.getByTestId('q0-option0'));
    fireEvent.press(screen.getByTestId('q0-option2'));
    fireEvent.press(screen.getByTestId('quiz-check'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('quiz-next'));
    });
    await waitFor(() => expect(screen.getByTestId('q1-option0')).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId('q1-option0'));
    fireEvent.press(screen.getByTestId('q1-option1'));

    expect(screen.getByTestId('q1-option0').props.accessibilityState.checked).toBe(false);
    expect(screen.getByTestId('q1-option1').props.accessibilityState.checked).toBe(true);
  });

  it('announces the options as checkboxes when several may be picked', async () => {
    await start();

    expect(screen.getByTestId('q0-option0').props.accessibilityRole).toBe('checkbox');
  });
});

describe('moving through the quiz', () => {
  const start = async () => {
    mockedQuiz.mockResolvedValue({ ok: true, quiz: sampleQuiz });
    await seed();
    await renderTracker();
    expandAll();
    fireEvent.press(screen.getByRole('button', { name: 'Options for Decimal' }));
    await act(async () => {
      fireEvent.press(getInModal('Test me on this'));
    });
    await waitFor(() => expect(screen.getByTestId('q0-option0')).toBeOnTheScreen());
  };

  it('cannot go back from the first question', async () => {
    await start();

    expect(screen.getByTestId('quiz-previous').props.accessibilityState.disabled).toBe(true);
  });

  it('shows the results only after the last question', async () => {
    await start();

    fireEvent.press(screen.getByTestId('q0-option0'));
    fireEvent.press(screen.getByTestId('quiz-check'));

    expect(screen.queryByTestId('quiz-results')).toBeNull();
    expect(screen.getByTestId('quiz-next')).toBeOnTheScreen();
  });

  it('returns from the results to the questions', async () => {
    // Reviewing an explanation is worth going back for, even once it is scored.
    await start();
    await answerQuiz([0, 1, 2]);
    expect(screen.getByTestId('quiz-outcome')).toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(screen.getByTestId('quiz-back-to-questions'));
    });

    expect(screen.getByTestId('q2-feedback')).toBeOnTheScreen();
  });

  it('lists every question with its explanation on the results', async () => {
    await start();
    await answerQuiz([0, 1, 2]);

    expect(screen.getByText(/Because 1\./)).toBeOnTheScreen();
    expect(screen.getByText(/Because 3\./)).toBeOnTheScreen();
  });

  it('can be abandoned part-way without marking anything', async () => {
    await start();
    fireEvent.press(screen.getByTestId('q0-option0'));
    fireEvent.press(screen.getByTestId('quiz-check'));

    await act(async () => {
      fireEvent.press(getInModal('Dismiss Questions on Decimal'));
    });

    expect(tracker().subjects[0]!.chapters[0]!.topics[0]!.completed).toBe(false);
  });
});

describe('a sub-topic that already has a note', () => {
  const withNotedSubtopic = async () => {
    await withSubtopic('Recurring decimals');
    fireEvent.press(screen.getByRole('button', { name: 'Options for Recurring decimals' }));
    fireEvent.press(getInModal('Add note'));
    fireEvent.changeText(screen.getByLabelText('Description'), 'It repeats.');
    await act(async () => {
      fireEvent.press(getInModal('Save'));
    });
    await waitFor(() => expect(screen.getByText('It repeats.')).toBeOnTheScreen());
  };

  it('offers to edit rather than add', async () => {
    await withNotedSubtopic();

    fireEvent.press(screen.getByRole('button', { name: 'Options for Recurring decimals' }));

    expect(getInModal('Edit note')).toBeTruthy();
  });

  it('opens the note by tapping it', async () => {
    await withNotedSubtopic();

    fireEvent.press(screen.getByRole('button', { name: 'Edit note on Recurring decimals' }));

    expect(screen.getByDisplayValue('It repeats.')).toBeOnTheScreen();
  });

  it('says when the assistant is working on a sub-topic', async () => {
    // A tap with no visible effect invites a second tap.
    let release: (value: { ok: false; message: string }) => void = () => {};
    mockedSummarise.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    await withSubtopic('Recurring decimals');

    fireEvent.press(screen.getByRole('button', { name: 'Options for Recurring decimals' }));
    fireEvent.press(getInModal('Summarise'));

    await waitFor(() => expect(screen.getByText('Asking the assistant…')).toBeOnTheScreen());

    await act(async () => {
      release({ ok: false, message: 'done' });
    });
  });
});

describe('small wordings that change with the count', () => {
  it('says "1 sub-topic", not "1 sub-topics"', async () => {
    await withSubtopic('Only one');

    fireEvent.press(screen.getByRole('button', { name: 'Hide sub-topics of Decimal' }));

    expect(screen.getByText('Show 1 sub-topic')).toBeOnTheScreen();
  });

  it('pluralises once there are several', async () => {
    await withSubtopic('First');
    fireEvent.press(screen.getByRole('button', { name: 'Options for Decimal' }));
    fireEvent.press(getInModal('Add sub-topic'));
    fireEvent.changeText(screen.getByLabelText('Name'), 'Second');
    await act(async () => {
      fireEvent.press(getInModal('Add'));
    });
    await waitFor(() => expect(screen.getByText('Second')).toBeOnTheScreen());

    fireEvent.press(screen.getByRole('button', { name: 'Hide sub-topics of Decimal' }));

    expect(screen.getByText('Show 2 sub-topics')).toBeOnTheScreen();
  });

  it('says when the assistant is working on a topic', async () => {
    let release: (value: { ok: false; message: string }) => void = () => {};
    mockedSummarise.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    await seed();
    await renderTracker();
    expandAll();

    fireEvent.press(screen.getByRole('button', { name: 'Options for Decimal' }));
    fireEvent.press(getInModal('Summarise'));

    await waitFor(() => expect(screen.getByText('Asking the assistant…')).toBeOnTheScreen());

    await act(async () => {
      release({ ok: false, message: 'done' });
    });
  });
});

/**
 * The syllabus on screen is scoped to one course, so it has to follow the
 * switcher. Both cases below were real: the first showed a student the
 * first-run exam picker over a syllabus they already had, and the second left
 * the previous course's subjects on screen after switching away from it.
 */
describe('following the course switcher', () => {
  const seedCourse = async (name: string, subject: string) => {
    const tracker = await repositories.trackers.create({ userId: USER, name });
    await repositories.subjects.create({ userId: USER, name: subject, trackerId: tracker.id });
    return tracker;
  };

  it('reads again once the courses have finished loading', async () => {
    await seedCourse('NEET PG', 'Anatomy');
    await renderTracker();

    // Mounted before the courses were known, so the first read found nothing.
    await act(async () => {
      await useTrackersStore.getState().load(USER, repositories);
    });

    await waitFor(() => expect(screen.getByText('Anatomy')).toBeOnTheScreen());
  });

  it('swaps the syllabus when the student switches course', async () => {
    await seedCourse('NEET PG', 'Anatomy');
    const upsc = await seedCourse('UPSC CSE', 'Polity');
    await act(async () => {
      await useTrackersStore.getState().load(USER, repositories);
    });
    await renderTracker();
    await waitFor(() => expect(screen.getByText('Anatomy')).toBeOnTheScreen());

    await act(async () => {
      await useTrackersStore.getState().select(upsc.id);
    });

    await waitFor(() => expect(screen.getByText('Polity')).toBeOnTheScreen());
    expect(screen.queryByText('Anatomy')).toBeNull();
  });
});

/**
 * Adding a subject by hand used to be the only route, which quietly assumed a
 * student wanted to type a syllabus out. Most have one already.
 */
describe('the four ways to add a subject', () => {
  const openSheet = async () => {
    await act(async () => {
      await tracker().load(USER, repositories);
    });
    await renderTracker();
    fireEvent.press(screen.getByRole('button', { name: 'Add subject' }));
  };

  it('offers all four', async () => {
    await openSheet();

    expect(screen.getByTestId('add-subject-search')).toBeOnTheScreen();
    expect(screen.getByTestId('add-subject-import')).toBeOnTheScreen();
    expect(screen.getByTestId('add-subject-ai')).toBeOnTheScreen();
    expect(screen.getByTestId('add-subject-custom')).toBeOnTheScreen();
  });

  /**
   * Searching adds subjects into the course already open. It used to navigate
   * to the library, which imports whole templates as new courses — so asking
   * for one subject produced a second course holding four more, and read as the
   * app having replaced the syllabus.
   */
  it('picks subjects into this course rather than leaving it', async () => {
    await openSheet();

    fireEvent.press(screen.getByTestId('add-subject-search'));

    expect(screen.getByTestId('subject-picker-search')).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
  });

  /** The one option that does create a course, which is what it says. */
  it('opens the library to start a separate course', async () => {
    await openSheet();

    fireEvent.press(screen.getByTestId('add-subject-import'));

    expect(router.push).toHaveBeenCalledWith('/templates');
  });

  it('drafts a subject in place rather than opening the chat', async () => {
    await openSheet();

    fireEvent.press(screen.getByTestId('add-subject-ai'));

    expect(screen.getByTestId('generate-prompt')).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('still lets a student name one themselves', async () => {
    await openSheet();

    fireEvent.press(screen.getByTestId('add-subject-custom'));

    expect(screen.getByLabelText('Name')).toBeOnTheScreen();
  });

  it('closes without doing anything when dismissed', async () => {
    await openSheet();

    fireEvent.press(screen.getByLabelText('Dismiss Add a subject'));

    expect(screen.queryByTestId('add-subject-custom')).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('deleting a note from the tracker', () => {
  const seedTopicWithNote = async (note: string | null) => {
    const subject = await repositories.subjects.create({
      userId: USER,
      name: 'Physics',
      trackerId: useTrackersStore.getState().activeId,
    });
    const chapter = await repositories.chapters.create({
      userId: USER,
      subjectId: subject.id,
      name: 'Electricity',
    });
    const topic = await repositories.topics.create({
      userId: USER,
      chapterId: chapter.id,
      name: "Ohm's law",
    });
    if (note !== null) await repositories.topics.setNote(topic.id, note);
    return topic;
  };

  const openTopicMenu = async (note: string | null) => {
    const topic = await seedTopicWithNote(note);
    await act(async () => {
      await tracker().load(USER, repositories);
    });
    await renderTracker();
    fireEvent.press(screen.getByRole('button', { name: 'Physics' }));
    fireEvent.press(screen.getByRole('button', { name: 'Electricity' }));
    fireEvent.press(screen.getByRole('button', { name: "Options for Ohm's law" }));
    return topic;
  };

  it('offers to delete a note that exists', async () => {
    await openTopicMenu('V equals I times R.');

    expect(getInModal('Delete note')).toBeTruthy();
  });

  /** An action that would do nothing is worse absent than present. */
  it('does not offer it on a topic with no note', async () => {
    await openTopicMenu(null);

    expect(screen.queryByText('Delete note')).toBeNull();
  });

  it('clears the note but keeps the topic', async () => {
    const topic = await openTopicMenu('V equals I times R.');

    await act(async () => {
      fireEvent.press(getInModal('Delete note'));
    });

    await waitFor(async () => {
      const row = await repositories.topics.findById(topic.id);
      expect(row?.note).toBeNull();
      expect(row?.name).toBe("Ohm's law");
    });
  });
});

/**
 * Adding one subject out of a template. Importing the whole thing and deleting
 * the rest is not a way to add a subject.
 */
describe('adding subjects from a template', () => {
  const openPicker = async () => {
    await act(async () => {
      await useTrackersStore.getState().load(USER, repositories);
      await tracker().load(USER, repositories);
    });
    await renderTracker();
    fireEvent.press(screen.getByRole('button', { name: 'Add subject' }));
    fireEvent.press(screen.getByTestId('add-subject-search'));
  };

  it('finds a template by name', async () => {
    await openPicker();

    fireEvent.changeText(screen.getByTestId('subject-picker-search'), 'commerce');

    expect(screen.getByTestId('pick-template-cbse-class-12-commerce')).toBeOnTheScreen();
  });

  it('lists the subjects inside the template chosen', async () => {
    await openPicker();
    fireEvent.changeText(screen.getByTestId('subject-picker-search'), 'commerce');

    fireEvent.press(screen.getByTestId('pick-template-cbse-class-12-commerce'));

    expect(screen.getByTestId('pick-subject-Accountancy')).toBeOnTheScreen();
  });

  it('adds only the subjects ticked', async () => {
    await openPicker();
    fireEvent.changeText(screen.getByTestId('subject-picker-search'), 'commerce');
    fireEvent.press(screen.getByTestId('pick-template-cbse-class-12-commerce'));

    fireEvent.press(screen.getByTestId('pick-subject-Accountancy'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('subject-picker-add'));
    });

    await waitFor(() => expect(tracker().subjects.map((s) => s.name)).toEqual(['Accountancy']));
  });

  it('adds several at once', async () => {
    await openPicker();
    fireEvent.changeText(screen.getByTestId('subject-picker-search'), 'commerce');
    fireEvent.press(screen.getByTestId('pick-template-cbse-class-12-commerce'));

    fireEvent.press(screen.getByTestId('pick-subject-Accountancy'));
    fireEvent.press(screen.getByTestId('pick-subject-Economics'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('subject-picker-add'));
    });

    await waitFor(() => expect(tracker().subjects).toHaveLength(2));
  });

  it('brings the chapters and topics with it', async () => {
    await openPicker();
    fireEvent.changeText(screen.getByTestId('subject-picker-search'), 'commerce');
    fireEvent.press(screen.getByTestId('pick-template-cbse-class-12-commerce'));

    fireEvent.press(screen.getByTestId('pick-subject-Accountancy'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('subject-picker-add'));
    });

    await waitFor(() => expect(tracker().progress.overall.total).toBeGreaterThan(0));
  });

  /** Additive is the whole point: nothing already in the course is disturbed. */
  it('leaves what was already in the course alone', async () => {
    await repositories.subjects.create({
      userId: USER,
      name: 'My own subject',
      trackerId: useTrackersStore.getState().activeId,
    });
    await openPicker();
    fireEvent.changeText(screen.getByTestId('subject-picker-search'), 'commerce');
    fireEvent.press(screen.getByTestId('pick-template-cbse-class-12-commerce'));

    fireEvent.press(screen.getByTestId('pick-subject-Accountancy'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('subject-picker-add'));
    });

    await waitFor(() =>
      expect(tracker().subjects.map((s) => s.name)).toEqual(['My own subject', 'Accountancy']),
    );
  });

  /** And it never creates a second course, which is what made it feel like a replacement. */
  it('does not start another course', async () => {
    await openPicker();
    fireEvent.changeText(screen.getByTestId('subject-picker-search'), 'commerce');
    fireEvent.press(screen.getByTestId('pick-template-cbse-class-12-commerce'));

    fireEvent.press(screen.getByTestId('pick-subject-Accountancy'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('subject-picker-add'));
    });

    await waitFor(() => expect(useTrackersStore.getState().trackers).toHaveLength(1));
  });

  it('cannot be submitted with nothing ticked', async () => {
    await openPicker();
    fireEvent.changeText(screen.getByTestId('subject-picker-search'), 'commerce');
    fireEvent.press(screen.getByTestId('pick-template-cbse-class-12-commerce'));

    expect(screen.getByTestId('subject-picker-add').props.accessibilityState.disabled).toBe(true);
  });

  it('goes back to the template list', async () => {
    await openPicker();
    fireEvent.changeText(screen.getByTestId('subject-picker-search'), 'commerce');
    fireEvent.press(screen.getByTestId('pick-template-cbse-class-12-commerce'));

    fireEvent.press(screen.getByTestId('subject-picker-back'));

    expect(screen.getByTestId('subject-picker-search')).toBeOnTheScreen();
  });
});

/**
 * "Generate using AI" used to drop the student into the chat, leaving them to
 * work out what to type and to find the proposal card that led back here.
 */
describe('drafting a subject with the assistant', () => {
  const draft = {
    ok: true as const,
    reply: {
      message: 'Here is a syllabus.',
      proposal: {
        kind: 'addChapters' as const,
        subjectName: 'Organic Chemistry',
        chapters: [
          { name: 'Haloalkanes and Haloarenes', topics: ['Nomenclature', 'Preparation'] },
          { name: 'Alcohols, Phenols and Ethers', topics: ['Classification'] },
        ],
      },
    },
  };

  const openGenerate = async () => {
    await act(async () => {
      await useTrackersStore.getState().load(USER, repositories);
      await tracker().load(USER, repositories);
    });
    await renderTracker();
    fireEvent.press(screen.getByRole('button', { name: 'Add subject' }));
    fireEvent.press(screen.getByTestId('add-subject-ai'));
  };

  const askFor = async (text: string) => {
    fireEvent.changeText(screen.getByTestId('generate-prompt'), text);
    await act(async () => {
      fireEvent.press(screen.getByTestId('generate-submit'));
    });
  };

  it('asks what the student is studying', async () => {
    await openGenerate();

    expect(screen.getByTestId('generate-prompt')).toBeOnTheScreen();
  });

  it('shows the draft before anything is written', async () => {
    mockedAsk.mockResolvedValue(draft);
    await openGenerate();

    await askFor('class 12 Organic Chemistry');

    expect(screen.getByText('Organic Chemistry')).toBeOnTheScreen();
    expect(screen.getByText('Haloalkanes and Haloarenes')).toBeOnTheScreen();
    expect(tracker().subjects).toHaveLength(0);
  });

  it('says how much it would add', async () => {
    mockedAsk.mockResolvedValue(draft);
    await openGenerate();

    await askFor('class 12 Organic Chemistry');

    expect(screen.getByTestId('generate-summary')).toHaveTextContent(/2 chapters/);
  });

  /** The whole point: the draft reaches the tracker without a detour. */
  it('adds it to the course on screen', async () => {
    mockedAsk.mockResolvedValue(draft);
    await openGenerate();
    await askFor('class 12 Organic Chemistry');

    await act(async () => {
      fireEvent.press(screen.getByTestId('generate-add'));
    });

    await waitFor(() =>
      expect(tracker().subjects.map((s) => s.name)).toContain('Organic Chemistry'),
    );
  });

  it('brings the chapters and topics with it', async () => {
    mockedAsk.mockResolvedValue(draft);
    await openGenerate();
    await askFor('class 12 Organic Chemistry');

    await act(async () => {
      fireEvent.press(screen.getByTestId('generate-add'));
    });

    await waitFor(() => expect(tracker().progress.overall.total).toBe(3));
  });

  it('refuses an empty prompt rather than asking the model nothing', async () => {
    await openGenerate();

    await askFor('   ');

    expect(screen.getByText(/Say what you are studying/)).toBeOnTheScreen();
    expect(mockedAsk).not.toHaveBeenCalled();
  });

  it('says so when the assistant is unreachable', async () => {
    mockedAsk.mockResolvedValue({ ok: false, message: 'The assistant is offline.' });
    await openGenerate();

    await askFor('class 12 Organic Chemistry');

    expect(screen.getByText('The assistant is offline.')).toBeOnTheScreen();
  });

  /** An answer without a syllabus in it is not a subject to add. */
  it('says so when the reply carries no syllabus', async () => {
    mockedAsk.mockResolvedValue({ ok: true, reply: { message: 'Sure!', proposal: null } });
    await openGenerate();

    await askFor('hello');

    expect(screen.getByText(/did not offer a syllabus/)).toBeOnTheScreen();
  });

  it('lets the student ask again instead of accepting a bad draft', async () => {
    mockedAsk.mockResolvedValue(draft);
    await openGenerate();
    await askFor('class 12 Organic Chemistry');

    fireEvent.press(screen.getByTestId('generate-retry'));

    expect(screen.getByTestId('generate-prompt')).toBeOnTheScreen();
    expect(tracker().subjects).toHaveLength(0);
  });
});

/**
 * A guest gets the tracker and everything local. The assistant needs an
 * account, and pressing it should say so rather than making them wait for a
 * request that cannot succeed.
 */
describe('the assistant and a guest', () => {
  const asGuest = async () => {
    useAuthStore.setState({ user: { id: USER } as never, status: 'signedIn', isGuest: true });
    await act(async () => {
      await useTrackersStore.getState().load(USER, repositories);
      await tracker().load(USER, repositories);
    });
  };

  it('refuses to draft a subject, and says why', async () => {
    await asGuest();
    await renderTracker();

    fireEvent.press(screen.getByRole('button', { name: 'Add subject' }));
    fireEvent.press(screen.getByTestId('add-subject-ai'));

    expect(screen.queryByTestId('generate-prompt')).toBeNull();
    expect(screen.getByText(/assistant needs an account/)).toBeOnTheScreen();
  });

  it('never calls the model for a guest', async () => {
    await asGuest();
    await renderTracker();

    fireEvent.press(screen.getByRole('button', { name: 'Add subject' }));
    fireEvent.press(screen.getByTestId('add-subject-ai'));

    expect(mockedAsk).not.toHaveBeenCalled();
  });

  /** Everything that is not the assistant still works. */
  it('still lets a guest add a subject by hand', async () => {
    await asGuest();
    await renderTracker();

    openAddSubject();
    fireEvent.changeText(screen.getByLabelText('Name'), 'Physics');
    await act(async () => {
      fireEvent.press(getInModal('Add'));
    });

    await waitFor(() => expect(tracker().subjects.map((s) => s.name)).toEqual(['Physics']));
  });

  it('still lets a guest take subjects from a template', async () => {
    await asGuest();
    await renderTracker();

    fireEvent.press(screen.getByRole('button', { name: 'Add subject' }));
    fireEvent.press(screen.getByTestId('add-subject-search'));

    expect(screen.getByTestId('subject-picker-search')).toBeOnTheScreen();
  });
});

describe('the welcome and continue card', () => {
  const openTracker = async () => {
    await act(async () => {
      await useTrackersStore.getState().load(USER, repositories);
      await tracker().load(USER, repositories);
    });
    await renderTracker();
  };

  const seedStudied = async (subjectName = 'Biology', chapterName = 'Chapter 4') => {
    const subject = await repositories.subjects.create({
      userId: USER,
      name: subjectName,
      trackerId: useTrackersStore.getState().activeId,
    });
    const chapter = await repositories.chapters.create({
      userId: USER,
      subjectId: subject.id,
      name: chapterName,
    });
    await repositories.topics.create({ userId: USER, chapterId: chapter.id, name: 'A topic' });
    const session = await repositories.sessions.start({
      userId: USER,
      timerMode: 'stopwatch',
      trackerId: useTrackersStore.getState().activeId,
      subjectId: subject.id,
      subjectName,
      chapterName,
    });
    await repositories.sessions.complete(session.id, 600);
    return subject;
  };

  it('greets a guest as Guest', async () => {
    useAuthStore.setState({ user: { id: USER } as never, status: 'signedIn', isGuest: true });

    await openTracker();

    expect(screen.getByTestId('welcome-greeting')).toHaveTextContent('Welcome, Guest');
  });

  it('greets a signed-in student by name', async () => {
    useAuthStore.setState({
      user: { id: USER, user_metadata: { display_name: 'Archit' } } as never,
      status: 'signedIn',
      isGuest: false,
    });

    await openTracker();

    expect(screen.getByTestId('welcome-greeting')).toHaveTextContent('Welcome, Archit');
  });

  /** An empty card teaches the student to stop reading that part of the screen. */
  it('shows no continue card on a first run', async () => {
    await openTracker();

    expect(screen.queryByTestId('continue-tracking')).toBeNull();
  });

  it('shows what was last studied once there is a session', async () => {
    await seedStudied();

    await openTracker();

    await waitFor(() => expect(screen.getByTestId('continue-tracking')).toBeOnTheScreen());
    expect(screen.getByTestId('continue-tracking')).toHaveTextContent(/Biology/);
    expect(screen.getByTestId('continue-tracking')).toHaveTextContent(/Chapter 4/);
  });

  it('opens the timer for that subject', async () => {
    const subject = await seedStudied();
    await openTracker();
    await waitFor(() => expect(screen.getByTestId('continue-tracking')).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId('continue-tracking-action'));

    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/timer',
        params: expect.objectContaining({ subjectId: subject.id }),
      }),
    );
  });

  /**
   * Part of the screen a phone has to fit. A name or a subject that runs long
   * must wrap or truncate rather than push the Continue button off-screen.
   */
  it('caps a very long name rather than letting it run', async () => {
    useAuthStore.setState({
      user: { id: USER, user_metadata: { display_name: 'A'.repeat(120) } } as never,
      status: 'signedIn',
      isGuest: false,
    });

    await openTracker();

    expect(screen.getByTestId('welcome-greeting').props.numberOfLines).toBe(2);
  });

  it('keeps the card usable with a very long subject name', async () => {
    await seedStudied('B'.repeat(120), 'C'.repeat(120));

    await openTracker();

    await waitFor(() => expect(screen.getByTestId('continue-tracking')).toBeOnTheScreen());
    expect(screen.getByTestId('continue-tracking-action')).toBeOnTheScreen();
  });
});
