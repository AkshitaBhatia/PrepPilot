import { act, screen, waitFor } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';
import type { Repositories } from '../../../db/client';
import { getRepositories } from '../../../db/client';
import { StudySessionRepository } from '../../../db/repositories/study-sessions';
import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../../../db/test-support/test-database';
import { renderWithTheme } from '../../../test-utils/render';
import { useAuthStore } from '../../auth/auth-store';
import { DashboardScreen } from '../dashboard-screen';
import { resetDashboardStore, useDashboardStore } from '../dashboard-store';

jest.mock('../../../db/client', () => ({ getRepositories: jest.fn() }));
jest.mock('../../../lib/supabase', () => ({
  getSupabase: jest.fn(),
  startAutoRefresh: jest.fn(() => jest.fn()),
}));

const USER = 'user-1';
/** Local noon, so no timezone shift can move it to another day. */
const NOW = new Date(2026, 7, 23, 12).getTime();
const dayBefore = (days: number) => new Date(2026, 7, 23 - days, 12).getTime();

let db: ReturnType<typeof createTestDatabase>;
let repositories: Repositories;

const dashboard = () => useDashboardStore.getState();

beforeEach(() => {
  db = createTestDatabase();
  const clock = createTestClock(NOW);
  repositories = createTestRepositories(db, clock);
  (getRepositories as jest.MockedFunction<typeof getRepositories>).mockReturnValue(repositories);
  resetDashboardStore();
  useAuthStore.setState({ user: { id: USER } as never, status: 'signedIn' });
});

afterEach(() => {
  db.$close();
});

async function seedSyllabus() {
  const subject = await repositories.subjects.create({ userId: USER, name: 'Mathematics' });
  const chapter = await repositories.chapters.create({
    userId: USER,
    subjectId: subject.id,
    name: 'Number Systems',
  });
  const first = await repositories.topics.create({
    userId: USER,
    chapterId: chapter.id,
    name: 'Decimal',
  });
  await repositories.topics.create({ userId: USER, chapterId: chapter.id, name: 'Real Number' });
  await repositories.topics.setCompleted(first.id, true);
}

/** A completed session recorded at a specific moment. */
async function seedSession(
  startedAt: number,
  durationSeconds: number,
  subjectName = 'Mathematics',
) {
  const repo = new StudySessionRepository(db, createTestClock(startedAt));
  const session = await repo.start({
    userId: USER,
    timerMode: 'stopwatch',
    subjectId: 'subject-1',
    subjectName,
  });
  await repo.complete(session.id, durationSeconds);
  return session;
}

const render = async () => {
  const view = renderWithTheme(<DashboardScreen />);
  await waitFor(() => expect(dashboard().loading).toBe(false));
  return view;
};

describe('an empty dashboard', () => {
  it('shows an em dash rather than 0% when nothing is tracked', async () => {
    await render();

    expect(screen.getByText('—')).toBeOnTheScreen();
  });

  it('invites the student to start a timer', async () => {
    await render();

    expect(screen.getByTestId('dashboard-no-sessions')).toBeOnTheScreen();
  });

  it('shows a zero streak', async () => {
    await render();

    expect(dashboard().streakDays).toBe(0);
  });
});

describe('with study recorded', () => {
  it('reports overall syllabus progress', async () => {
    await seedSyllabus();

    await act(async () => {
      await dashboard().load(USER, repositories, NOW);
    });

    expect(dashboard().overall).toMatchObject({ completed: 1, total: 2 });
  });

  it("sums today's study time, ignoring earlier days", async () => {
    await seedSession(NOW, 1800);
    await seedSession(dayBefore(1), 3600);

    await act(async () => {
      await dashboard().load(USER, repositories, NOW);
    });

    expect(dashboard().todaySeconds).toBe(1800);
    expect(dashboard().totalSeconds).toBe(5400);
  });

  it('counts a study streak across consecutive days', async () => {
    await seedSession(NOW, 600);
    await seedSession(dayBefore(1), 600);
    await seedSession(dayBefore(2), 600);

    await act(async () => {
      await dashboard().load(USER, repositories, NOW);
    });

    expect(dashboard().streakDays).toBe(3);
  });

  it('groups time by subject', async () => {
    await seedSession(NOW, 1800, 'Mathematics');
    await seedSession(NOW, 600, 'Mathematics');

    await act(async () => {
      await dashboard().load(USER, repositories, NOW);
    });

    expect(dashboard().bySubject[0]).toMatchObject({ subjectName: 'Mathematics', seconds: 2400 });
  });

  it('renders a bar for each of the last seven days', async () => {
    await seedSession(NOW, 1800);
    await render();

    await waitFor(() => expect(screen.getByTestId('day-bar-6')).toBeOnTheScreen());
    expect(screen.getByTestId('day-bar-0')).toBeOnTheScreen();
  });

  it('lists recent sessions', async () => {
    const session = await seedSession(NOW, 1800);
    await render();

    await waitFor(() => expect(screen.getByTestId(`session-${session.id}`)).toBeOnTheScreen());
  });
});

describe('progress by subject', () => {
  /** PRD §12 asks for subject progress, not only time spent on a subject. */
  it('reports completion for each subject', async () => {
    await seedSyllabus();

    await act(async () => {
      await dashboard().load(USER, repositories, NOW);
    });

    expect(dashboard().subjectProgress).toHaveLength(1);
    expect(dashboard().subjectProgress[0]).toMatchObject({
      name: 'Mathematics',
      progress: { completed: 1, total: 2 },
    });
  });

  it('renders the list', async () => {
    await seedSyllabus();
    await render();

    await waitFor(() => expect(screen.getByTestId('subject-progress')).toBeOnTheScreen());
    expect(screen.getByText('50.0%')).toBeOnTheScreen();
  });

  it('shows nothing when there are no subjects', async () => {
    await render();

    expect(screen.queryByTestId('subject-progress')).toBeNull();
  });

  /**
   * The Tracker and the Dashboard run the same engine over the same rows, so a
   * subject cannot read as two different percentages depending on the screen.
   */
  it('agrees with the overall figure it is derived from', async () => {
    await seedSyllabus();

    await act(async () => {
      await dashboard().load(USER, repositories, NOW);
    });

    const subject = dashboard().subjectProgress[0]!;
    expect(subject.progress.percent).toBe(dashboard().overall.percent);
  });
});

describe('sessions still running', () => {
  /**
   * A running session has no final duration, so counting it would make today's
   * total jump around as the timer advances.
   */
  it('are excluded until they settle', async () => {
    const repo = new StudySessionRepository(db, createTestClock(NOW));
    const running = await repo.start({ userId: USER, timerMode: 'stopwatch' });
    await repo.heartbeat(running.id, 600, 'running');

    await act(async () => {
      await dashboard().load(USER, repositories, NOW);
    });

    expect(dashboard().todaySeconds).toBe(0);
    expect(dashboard().recentSessions).toHaveLength(0);
  });

  it('are included once completed', async () => {
    const repo = new StudySessionRepository(db, createTestClock(NOW));
    const running = await repo.start({ userId: USER, timerMode: 'stopwatch' });
    await repo.complete(running.id, 600);

    await act(async () => {
      await dashboard().load(USER, repositories, NOW);
    });

    expect(dashboard().todaySeconds).toBe(600);
  });
});

describe('pull to refresh', () => {
  it('picks up study recorded elsewhere', async () => {
    await render();
    expect(dashboard().totalSeconds).toBe(0);

    await seedSession(NOW, 1800);

    await act(async () => {
      screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });

    await waitFor(() => expect(dashboard().totalSeconds).toBe(1800));
  });
});

describe('failures', () => {
  it('shows a student-facing message, not the driver error', async () => {
    jest
      .spyOn(repositories.subjects, 'listByUser')
      .mockRejectedValue(new Error('SQLITE_CORRUPT: database disk image is malformed'));

    await render();

    expect(screen.getByText(/could not load your dashboard/)).toBeOnTheScreen();
    expect(screen.queryByText(/SQLITE_CORRUPT/)).toBeNull();
  });
});

describe('when the dashboard cannot be read', () => {
  it('says so and offers to try again', async () => {
    jest
      .spyOn(repositories.sessions, 'listByUser')
      .mockRejectedValue(new Error('SQLITE_BUSY: database is locked'));

    await render();

    await waitFor(() => expect(screen.getByText(/could not load/i)).toBeOnTheScreen());
    expect(screen.getByRole('button', { name: 'Reload' })).toBeOnTheScreen();
    expect(screen.queryByText(/SQLITE_BUSY/)).toBeNull();
  });
});
