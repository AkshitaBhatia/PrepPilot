import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../../../db/test-support/test-database';
import { renderWithTheme } from '../../../test-utils/render';
import { TrackerSwitcher } from '../components/tracker-switcher';
import { resetTrackersStore, useTrackersStore } from '../trackers-store';

const USER = 'user-1';

let db: ReturnType<typeof createTestDatabase>;
let repositories: ReturnType<typeof createTestRepositories>;

beforeEach(() => {
  db = createTestDatabase();
  repositories = createTestRepositories(db, createTestClock());
  resetTrackersStore();
  jest.clearAllMocks();
});

afterEach(() => {
  db.$close();
});

const load = () => act(() => useTrackersStore.getState().load(USER, repositories));

async function seed(...names: readonly string[]) {
  for (const name of names) {
    await repositories.trackers.create({ userId: USER, name });
  }
}

describe('telling the student which course they are looking at', () => {
  it('names it on the pill', async () => {
    await seed('NEET PG');
    await load();

    renderWithTheme(<TrackerSwitcher />);

    expect(screen.getByTestId('tracker-switcher')).toHaveTextContent(/NEET PG/);
  });

  /**
   * Everything on screen is scoped to a course, so a screen reader user must be
   * able to hear which one without opening the sheet.
   */
  it('says so to a screen reader', async () => {
    await seed('NEET PG');
    await load();

    renderWithTheme(<TrackerSwitcher />);

    expect(screen.getByLabelText('Course: NEET PG. Change course')).toBeTruthy();
  });

  it('shows nothing at all before the courses have loaded', () => {
    renderWithTheme(<TrackerSwitcher />);

    expect(screen.queryByTestId('tracker-switcher')).toBeNull();
  });
});

describe('choosing a different course', () => {
  it('lists every course when opened', async () => {
    await seed('NEET PG', 'UPSC CSE');
    await load();
    renderWithTheme(<TrackerSwitcher />);

    fireEvent.press(screen.getByTestId('tracker-switcher'));

    expect(screen.getByText('UPSC CSE')).toBeTruthy();
  });

  it('marks the one already showing', async () => {
    await seed('NEET PG', 'UPSC CSE');
    await load();
    renderWithTheme(<TrackerSwitcher />);

    fireEvent.press(screen.getByTestId('tracker-switcher'));

    expect(screen.getByText('Showing')).toBeTruthy();
  });

  it('switches to the one tapped', async () => {
    await seed('NEET PG', 'UPSC CSE');
    await load();
    const upsc = useTrackersStore.getState().trackers[1];
    if (upsc === undefined) throw new Error('expected two courses');
    renderWithTheme(<TrackerSwitcher />);

    fireEvent.press(screen.getByTestId('tracker-switcher'));
    await act(async () => {
      fireEvent.press(screen.getByTestId(`tracker-${upsc.id}`));
    });

    await waitFor(() => expect(useTrackersStore.getState().activeId).toBe(upsc.id));
    expect(screen.getByTestId('tracker-switcher')).toHaveTextContent(/UPSC CSE/);
  });

  it('says where a course came from', async () => {
    await repositories.trackers.create({ userId: USER, name: 'NEET PG', templateId: 'neet-pg' });
    await load();
    renderWithTheme(<TrackerSwitcher />);

    fireEvent.press(screen.getByTestId('tracker-switcher'));

    expect(screen.getByText('From a course template')).toBeTruthy();
  });

  it('does not label a course the student built themselves', async () => {
    await seed('My own plan');
    await load();
    renderWithTheme(<TrackerSwitcher />);

    fireEvent.press(screen.getByTestId('tracker-switcher'));

    expect(screen.queryByText('From a course template')).toBeNull();
  });
});

describe('adding another course', () => {
  it('sends the student to the templates screen', async () => {
    await seed('NEET PG');
    await load();
    renderWithTheme(<TrackerSwitcher />);

    fireEvent.press(screen.getByTestId('tracker-switcher'));
    fireEvent.press(screen.getByTestId('add-course'));

    expect(router.push).toHaveBeenCalledWith('/templates');
  });
});

/**
 * The store could remove a course from the day it was written, but nothing in
 * the app ever called it — so a course added by mistake stayed for good.
 */
describe('removing a course', () => {
  const openSwitcher = async (...names: readonly string[]) => {
    await seed(...names);
    await load();
    renderWithTheme(<TrackerSwitcher />);
    fireEvent.press(screen.getByTestId('tracker-switcher'));
  };

  it('offers to remove one when there is more than one', async () => {
    await openSwitcher('NEET PG', 'UPSC CSE');
    const [first] = useTrackersStore.getState().trackers;

    expect(screen.getByTestId(`remove-tracker-${first?.id}`)).toBeOnTheScreen();
  });

  /**
   * With one course there is nowhere to put a subject. A button that always
   * refuses is worse than one that is not there.
   */
  it('does not offer it on the only course', async () => {
    await openSwitcher('Only one');
    const [only] = useTrackersStore.getState().trackers;

    expect(screen.queryByTestId(`remove-tracker-${only?.id}`)).toBeNull();
  });

  it('asks before destroying it, and names it', async () => {
    await openSwitcher('NEET PG', 'UPSC CSE');
    const [first] = useTrackersStore.getState().trackers;

    fireEvent.press(screen.getByTestId(`remove-tracker-${first?.id}`));

    expect(screen.getByText('Remove “NEET PG”?')).toBeOnTheScreen();
  });

  it('says what goes with it', async () => {
    await openSwitcher('NEET PG', 'UPSC CSE');
    const [first] = useTrackersStore.getState().trackers;
    fireEvent.press(screen.getByTestId(`remove-tracker-${first?.id}`));

    expect(screen.getByText(/syllabus, notes and flashcards go with it/)).toBeOnTheScreen();
  });

  it('keeps it when the student backs out', async () => {
    await openSwitcher('NEET PG', 'UPSC CSE');
    const [first] = useTrackersStore.getState().trackers;
    fireEvent.press(screen.getByTestId(`remove-tracker-${first?.id}`));

    fireEvent.press(screen.getByTestId('remove-tracker-cancel'));

    expect(useTrackersStore.getState().trackers).toHaveLength(2);
  });

  it('removes it once confirmed', async () => {
    await openSwitcher('NEET PG', 'UPSC CSE');
    const [first] = useTrackersStore.getState().trackers;
    fireEvent.press(screen.getByTestId(`remove-tracker-${first?.id}`));

    await act(async () => {
      fireEvent.press(screen.getByTestId('remove-tracker-confirm'));
    });

    await waitFor(() =>
      expect(useTrackersStore.getState().trackers.map((t) => t.name)).toEqual(['UPSC CSE']),
    );
  });

  it('takes the course’s syllabus with it', async () => {
    await openSwitcher('NEET PG', 'UPSC CSE');
    const [first] = useTrackersStore.getState().trackers;
    if (first === undefined) throw new Error('expected a course');
    await repositories.subjects.create({ userId: USER, name: 'Anatomy', trackerId: first.id });
    fireEvent.press(screen.getByTestId(`remove-tracker-${first.id}`));

    await act(async () => {
      fireEvent.press(screen.getByTestId('remove-tracker-confirm'));
    });

    await waitFor(async () =>
      expect(await repositories.subjects.listByUser(USER, first.id)).toEqual([]),
    );
  });
});
