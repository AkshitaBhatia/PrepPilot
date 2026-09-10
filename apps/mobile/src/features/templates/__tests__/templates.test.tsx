import {
  TEMPLATE_CATEGORIES,
  bundledTemplates,
  countTemplate,
  type SyllabusTemplate,
  type TemplateCategory,
} from '@preppilot/shared';
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
import { resetTrackersStore, useTrackersStore } from '../../trackers/trackers-store';
import { importTemplate } from '../import-template';
import { TemplatePreview, TemplatesScreen } from '../templates-screen';

jest.mock('../../../db/client', () => ({ getRepositories: jest.fn() }));
jest.mock('../../../lib/supabase', () => ({
  getSupabase: jest.fn(),
  startAutoRefresh: jest.fn(() => jest.fn()),
}));

const USER = 'user-1';

/** Mirrors the screen's own filter labels. */
function filterLabelFor(category: TemplateCategory): string {
  return { exam: 'Exams', school: 'School', custom: 'Other' }[category];
}

let db: ReturnType<typeof createTestDatabase>;
let repositories: Repositories;

const sample: SyllabusTemplate = {
  id: 'sample',
  name: 'Sample',
  description: 'A sample',
  category: 'school',
  source: 'Example content',
  verified: false,
  subjects: [
    {
      name: 'Physics',
      chapters: [
        { name: 'Light', topics: [{ name: 'Reflection' }, { name: 'Refraction' }] },
        { name: 'Empty chapter', topics: [] },
      ],
    },
    { name: 'Chemistry', chapters: [{ name: 'Acids', topics: [{ name: 'pH' }] }] },
  ],
};

beforeEach(() => {
  db = createTestDatabase();
  repositories = createTestRepositories(db, createTestClock());
  (getRepositories as jest.MockedFunction<typeof getRepositories>).mockReturnValue(repositories);
  jest.mocked(router.push).mockClear();
  useAuthStore.setState({ user: { id: USER } as never, status: 'signedIn' });
  // Every screen is scoped to a tracker, and the app loads them before the first
  // route renders — so a screen test has to do the same.
  resetTrackersStore();
});

afterEach(() => {
  db.$close();
});

describe('importTemplate', () => {
  it('creates the whole hierarchy', async () => {
    const result = await importTemplate(USER, sample, repositories);

    expect(result).toEqual({ subjects: 2, chapters: 3, topics: 3 });
  });

  it('produces an editable syllabus in the tracker', async () => {
    await importTemplate(USER, sample, repositories);

    const subjects = await repositories.subjects.listByUser(USER);
    expect(subjects.map((row) => row.name)).toEqual(['Physics', 'Chemistry']);

    const chapters = await repositories.chapters.listBySubject(subjects[0]!.id);
    expect(chapters.map((row) => row.name)).toEqual(['Light', 'Empty chapter']);

    const topics = await repositories.topics.listByChapter(chapters[0]!.id);
    expect(topics.map((row) => row.name)).toEqual(['Reflection', 'Refraction']);
  });

  it('preserves a chapter with no topics', async () => {
    await importTemplate(USER, sample, repositories);

    const subjects = await repositories.subjects.listByUser(USER);
    const chapters = await repositories.chapters.listBySubject(subjects[0]!.id);
    const empty = chapters.find((row) => row.name === 'Empty chapter');

    expect(await repositories.topics.listByChapter(empty!.id)).toEqual([]);
  });

  it('starts every imported topic incomplete', async () => {
    await importTemplate(USER, sample, repositories);

    expect((await repositories.topics.listByUser(USER)).every((row) => !row.completed)).toBe(true);
  });

  it('imports into the given account only', async () => {
    await importTemplate(USER, sample, repositories);

    expect(await repositories.subjects.listByUser('someone-else')).toEqual([]);
  });

  /**
   * Importing a course now creates a *new* tracker rather than replacing the
   * current one: a student preparing for two exams keeps both, and switching
   * between them switches the whole app.
   */
  it('leaves an existing syllabus untouched', async () => {
    const tracker = await repositories.trackers.create({ userId: USER, name: 'Existing' });
    await repositories.subjects.create({
      userId: USER,
      name: 'Old subject',
      trackerId: tracker.id,
    });

    const other = await repositories.trackers.create({ userId: USER, name: 'New course' });
    await importTemplate(USER, sample, repositories, other.id);

    const kept = await repositories.subjects.listByUser(USER, tracker.id);
    expect(kept.map((subject) => subject.name)).toEqual(['Old subject']);
  });

  it('puts the imported syllabus in the tracker it was given', async () => {
    const tracker = await repositories.trackers.create({ userId: USER, name: 'New course' });

    await importTemplate(USER, sample, repositories, tracker.id);

    const imported = await repositories.subjects.listByUser(USER, tracker.id);
    expect(imported.map((subject) => subject.name)).toEqual(['Physics', 'Chemistry']);
  });

  it('keeps the two courses apart', async () => {
    // The whole point: one student, two exams, neither bleeding into the other.
    const first = await repositories.trackers.create({ userId: USER, name: 'First' });
    const second = await repositories.trackers.create({ userId: USER, name: 'Second' });

    await importTemplate(USER, sample, repositories, first.id);
    await importTemplate(USER, sample, repositories, second.id);

    expect(await repositories.subjects.listByUser(USER, first.id)).toHaveLength(2);
    expect(await repositories.subjects.listByUser(USER, second.id)).toHaveLength(2);
  });

  /** A malformed template would leave a syllabus the student cleans up by hand. */
  it('refuses a malformed template with a reason', async () => {
    const broken = { ...sample, subjects: [{ name: '', chapters: [] }] };

    await expect(importTemplate(USER, broken, repositories)).rejects.toThrow(
      /Every subject in a template needs a name/,
    );
    expect(await repositories.subjects.listByUser(USER)).toEqual([]);
  });
});

describe('the templates screen', () => {
  const render = () => renderWithTheme(<TemplatesScreen />);

  /** Loads trackers the way the app layout does, then renders. */
  const renderReady = async () => {
    await useTrackersStore.getState().load(USER, repositories);
    return renderWithTheme(<TemplatesScreen />);
  };

  it('lists the bundled templates', () => {
    render();

    for (const template of bundledTemplates) {
      expect(screen.getByTestId(`template-${template.id}`)).toBeOnTheScreen();
    }
  });

  it('filters by category', () => {
    const exam = bundledTemplates.find((entry) => entry.category === 'exam');
    const school = bundledTemplates.find((entry) => entry.category === 'school');
    if (exam === undefined || school === undefined) {
      throw new Error('The library needs one template of each category to test the filter.');
    }

    render();
    fireEvent.press(screen.getByRole('button', { name: 'Exams' }));

    expect(screen.getByTestId(`template-${exam.id}`)).toBeOnTheScreen();
    expect(screen.queryByTestId(`template-${school.id}`)).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'School' }));

    expect(screen.getByTestId(`template-${school.id}`)).toBeOnTheScreen();
    expect(screen.queryByTestId(`template-${exam.id}`)).toBeNull();
  });

  /** The empty state is still reachable — just not by a category that has content. */
  it('shows the empty state for a category with nothing in it', () => {
    const untouched = TEMPLATE_CATEGORIES.find(
      (category) => !bundledTemplates.some((entry) => entry.category === category),
    );
    if (untouched === undefined) return;

    render();
    fireEvent.press(screen.getByRole('button', { name: filterLabelFor(untouched) }));

    expect(screen.getByTestId('templates-empty')).toBeOnTheScreen();
  });

  it('shows how much a template will add before importing', () => {
    render();

    fireEvent.press(screen.getByTestId(`template-${bundledTemplates[0]!.id}`));

    expect(screen.getByText(/Adds \d+ subjects, \d+ chapters and \d+ topics/)).toBeOnTheScreen();
  });

  /**
   * A student planning months of study around a syllabus must be able to see
   * that nobody has checked it, before importing rather than after.
   */
  it('shows where a bundled syllabus came from, without warning about it', () => {
    render();

    fireEvent.press(screen.getByTestId(`template-${bundledTemplates[0]!.id}`));

    expect(screen.getByText(/included with PrepPilot/i)).toBeOnTheScreen();
    expect(screen.queryByText(/Not checked/)).toBeNull();
  });

  /**
   * The warning still exists — it is what a template whose accuracy nobody has
   * claimed should carry. It just does not apply to the app's own content.
   */
  it('still warns about a template that is not vouched for', () => {
    renderWithTheme(<TemplatePreview template={{ ...sample, verified: false }} />);

    expect(screen.getByText(/Not checked/)).toBeOnTheScreen();
  });

  it('imports on confirmation and returns to the tracker', async () => {
    await renderReady();

    fireEvent.press(screen.getByTestId(`template-${bundledTemplates[0]!.id}`));
    await act(async () => {
      fireEvent.press(getInModal('Import'));
    });

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/'));
    expect((await repositories.subjects.listByUser(USER)).length).toBeGreaterThan(0);
  });

  /** A course becomes its own tracker, named for it and switched to. */
  it('creates a course for what was imported and switches to it', async () => {
    await renderReady();
    const template = bundledTemplates[0]!;

    fireEvent.press(screen.getByTestId(`template-${template.id}`));
    await act(async () => {
      fireEvent.press(getInModal('Import'));
    });

    await waitFor(() => {
      const { trackers, activeId } = useTrackersStore.getState();
      const active = trackers.find((tracker) => tracker.id === activeId);
      expect(active?.name).toBe(template.name);
      expect(active?.templateId).toBe(template.id);
    });
  });

  it('imports nothing when the preview is cancelled', async () => {
    render();

    fireEvent.press(screen.getByTestId(`template-${bundledTemplates[0]!.id}`));
    await act(async () => {
      fireEvent.press(getInModal('Cancel'));
    });

    expect(await repositories.subjects.listByUser(USER)).toEqual([]);
  });

  it('shows a student-facing message when importing fails', async () => {
    jest.spyOn(repositories.subjects, 'create').mockRejectedValue(new Error('SQLITE_BUSY'));
    render();

    fireEvent.press(screen.getByTestId(`template-${bundledTemplates[0]!.id}`));
    await act(async () => {
      fireEvent.press(getInModal('Import'));
    });

    await waitFor(() =>
      expect(screen.getByText('We could not import that template. Try again.')).toBeOnTheScreen(),
    );
    expect(screen.queryByText(/SQLITE_BUSY/)).toBeNull();
  });

  it.each(['All', 'Exams', 'School', 'Other'])('offers the %s filter', (label) => {
    render();

    expect(screen.getByRole('button', { name: label })).toBeOnTheScreen();
  });

  it('shows the chapters a template will add', () => {
    render();

    fireEvent.press(screen.getByTestId(`template-${bundledTemplates[0]!.id}`));

    const first = bundledTemplates[0]!.subjects[0]!;
    expect(screen.getByText(first.name)).toBeOnTheScreen();
    expect(screen.getByText(new RegExp(`${first.chapters[0]!.name}`))).toBeOnTheScreen();
  });

  it('closes the preview from the backdrop', async () => {
    render();

    fireEvent.press(screen.getByTestId(`template-${bundledTemplates[0]!.id}`));
    await act(async () => {
      fireEvent.press(getInModal('Dismiss Template preview'));
    });

    expect(await repositories.subjects.listByUser(USER)).toEqual([]);
  });

  /**
   * A student plans months around one of these, so the library must say plainly
   * that nobody has checked them against the awarding body's own syllabus.
   */
  it('describes what a template covers rather than repeating its counts', () => {
    // The counts already sit under every card; a description echoing them wastes
    // the one line that could say what the syllabus is actually about.
    const generated = bundledTemplates.find((entry) => entry.category === 'exam');
    if (generated === undefined) return;

    render();

    // JEE Main and JEE Advanced share their subjects, so this is not unique.
    expect(screen.getAllByText(generated.description).length).toBeGreaterThan(0);
    expect(generated.description).not.toMatch(/\d+ chapters/);
  });
});

/**
 * The sample above has 8 topics. The real ones have hundreds, and importing
 * writes every subject, chapter and topic — so this is where a per-row round
 * trip would show up as a student watching a spinner.
 */
describe('importing a real syllabus', () => {
  const largest = [...bundledTemplates].sort(
    (a, b) => countTemplate(b).topics - countTemplate(a).topics,
  )[0]!;

  it('creates every subject, chapter and topic the preview promised', async () => {
    const expected = countTemplate(largest);
    const result = await importTemplate(USER, largest, repositories);

    expect(result).toEqual(expected);

    const subjects = await repositories.subjects.listByUser(USER);
    expect(subjects).toHaveLength(expected.subjects);

    let topics = 0;
    for (const subject of subjects) {
      for (const chapter of await repositories.chapters.listBySubject(subject.id)) {
        topics += (await repositories.topics.listByChapter(chapter.id)).length;
      }
    }
    expect(topics).toBe(expected.topics);
  });

  it('finishes fast enough not to need a progress bar', async () => {
    const started = Date.now();
    await importTemplate(USER, largest, repositories);
    const elapsed = Date.now() - started;

    // Generous for CI, but a per-row round trip would blow well past it.
    expect(elapsed).toBeLessThan(5000);
  });
});

/**
 * PRD §13 requires a Custom option alongside the prebuilt templates: not every
 * student is studying something a template covers.
 */
describe('building your own', () => {
  const startNaming = async () => {
    renderWithTheme(<TemplatesScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('start-from-scratch'));
    });
  };

  const typeName = async (name: string) => {
    // By label, not by empty value: the library now has a search box, and both
    // fields are empty when the prompt opens.
    fireEvent.changeText(screen.getByLabelText('Name'), name);
    await act(async () => {
      fireEvent.press(getInModal('Create'));
    });
  };

  it('creates the named subject and opens the tracker', async () => {
    // Handing over with the first subject already made, rather than opening an
    // empty syllabus: a student who chose "build my own" has something in mind.
    await startNaming();
    await typeName('Organic Chemistry');

    const subjects = await repositories.subjects.listByUser(USER);
    expect(subjects.map((row) => row.name)).toEqual(['Organic Chemistry']);
    expect(router.push).toHaveBeenCalledWith('/');
  });

  it('refuses an empty name without closing', async () => {
    await startNaming();
    await act(async () => {
      fireEvent.press(getInModal('Create'));
    });

    expect(screen.getByText('Enter a name.')).toBeOnTheScreen();
    expect(await repositories.subjects.listByUser(USER)).toEqual([]);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('keeps what was typed when the write fails', async () => {
    // Closing the sheet on a failure would throw away their input and leave
    // them with no idea whether it worked.
    jest.spyOn(repositories.subjects, 'create').mockRejectedValue(new Error('SQLITE_BUSY'));

    await startNaming();
    await typeName('Organic Chemistry');

    expect(screen.getByText('We could not create that subject. Try again.')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Organic Chemistry')).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('can be abandoned', async () => {
    await startNaming();
    await act(async () => {
      fireEvent.press(getInModal('Cancel'));
    });

    expect(screen.queryByText('What are you studying?')).toBeNull();
    expect(await repositories.subjects.listByUser(USER)).toEqual([]);
  });
});

/**
 * The import wrote to the database and the tracker never looked again: a plain
 * effect runs once, and tab screens stay mounted. From the outside that read as
 * the Import button doing nothing and dumping you back on an empty tracker.
 */
describe('after importing', () => {
  it('the tracker shows the imported syllabus when it comes back into view', async () => {
    const { useTrackerStore, resetTrackerStore } = jest.requireActual<
      typeof import('../../tracker/tracker-store')
    >('../../tracker/tracker-store');

    resetTrackerStore();
    await useTrackerStore.getState().load(USER, repositories);
    expect(useTrackerStore.getState().subjects).toEqual([]);

    // Another screen imports while the tracker sits mounted and stale.
    await importTemplate(USER, sample, repositories);
    expect(useTrackerStore.getState().subjects).toEqual([]);

    // Coming back into view is what re-reads it.
    await useTrackerStore.getState().load(USER, repositories);

    expect(useTrackerStore.getState().subjects.map((subject) => subject.name)).toEqual([
      'Physics',
      'Chemistry',
    ]);
  });

  it('leaves study history intact when the syllabus is replaced', async () => {
    // Sessions carry no foreign key to subjects (D16), so the time a student
    // really did spend survives a syllabus they have moved on from.
    const session = await repositories.sessions.start({ userId: USER, timerMode: 'stopwatch' });
    await repositories.sessions.complete(session.id, 900);
    await repositories.subjects.create({ userId: USER, name: 'Old subject' });

    await importTemplate(USER, sample, repositories);

    expect(await repositories.sessions.totalSecondsForUser(USER)).toBe(900);
  });
});

/**
 * Notes live on topics, so replacing the syllabus takes them with it. Saying how
 * many, before the button is pressed, is the difference between a warning and a
 * surprise.
 */
describe('telling a student their work is safe', () => {
  const seedSyllabusWithNote = async () => {
    const trackerId = useTrackersStore.getState().activeId;
    const subject = await repositories.subjects.create({
      userId: USER,
      name: 'Old subject',
      trackerId,
    });
    const chapter = await repositories.chapters.create({
      userId: USER,
      subjectId: subject.id,
      name: 'A chapter',
    });
    const topic = await repositories.topics.create({
      userId: USER,
      chapterId: chapter.id,
      name: 'A topic',
    });
    await repositories.topics.setNote(topic.id, 'Worth keeping.');
  };

  const openPreview = async () => {
    renderWithTheme(<TemplatesScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId(`template-${bundledTemplates[0]!.id}`));
    });
  };

  /**
   * The import used to wipe the current syllabus, and the preview said so in
   * red. It now starts a separate course, so the same red warning would be a
   * threat the app has no intention of carrying out.
   */
  it('says the import starts a separate course', async () => {
    await seedSyllabusWithNote();

    await openPreview();

    await waitFor(() => expect(screen.getByTestId('new-course-note')).toBeOnTheScreen());
    expect(screen.getByTestId('new-course-note')).toHaveTextContent(/starts a separate course/);
  });

  it('promises the syllabus, notes and cards are left alone', async () => {
    await seedSyllabusWithNote();

    await openPreview();

    await waitFor(() =>
      expect(screen.getByText(/notes and cards stay exactly as they are/)).toBeOnTheScreen(),
    );
  });

  it('never threatens to remove anything', async () => {
    await seedSyllabusWithNote();

    await openPreview();

    await waitFor(() => expect(screen.getByTestId('new-course-note')).toBeOnTheScreen());
    expect(screen.queryByText(/will be removed/)).toBeNull();
    expect(screen.queryByText(/replaces your current syllabus/)).toBeNull();
  });

  it('says nothing at all when there is nothing to reassure them about', async () => {
    await openPreview();

    expect(screen.queryByTestId('new-course-note')).toBeNull();
  });

  it('opens the preview even if what is already there cannot be read', async () => {
    // A missing count must not stop a student importing.
    await seedSyllabusWithNote();
    jest.spyOn(repositories.notes, 'listByUser').mockRejectedValue(new Error('SQLITE_BUSY'));

    await openPreview();

    expect(screen.getByRole('button', { name: 'Import' })).toBeTruthy();
  });

  /** A syllabus in a different course is not what this note is about. */
  it('ignores a syllabus belonging to another course', async () => {
    const other = await repositories.trackers.create({ userId: USER, name: 'Another course' });
    await repositories.subjects.create({
      userId: USER,
      name: 'Somewhere else',
      trackerId: other.id,
    });

    await openPreview();

    expect(screen.queryByTestId('new-course-note')).toBeNull();
  });
});

/**
 * The library grew from three templates to two dozen. Scrolling for a class 12
 * stream past every professional exam is not a way to find anything.
 */
describe('searching the library', () => {
  const render = () => renderWithTheme(<TemplatesScreen />);

  it('narrows the list to what was typed', async () => {
    render();

    fireEvent.changeText(screen.getByTestId('template-search'), 'gate');

    expect(screen.getByTestId('template-gate-cs-it')).toBeOnTheScreen();
    expect(screen.queryByTestId('template-ca-final')).toBeNull();
  });

  it('finds a template by a subject inside it', async () => {
    render();

    fireEvent.changeText(screen.getByTestId('template-search'), 'accountancy');

    expect(screen.getByTestId('template-cbse-class-12-commerce')).toBeOnTheScreen();
  });

  it('says how many matched', async () => {
    render();

    fireEvent.changeText(screen.getByTestId('template-search'), 'gate');

    expect(screen.getByText(/1 template$/)).toBeOnTheScreen();
  });

  it('says so plainly when nothing matches', async () => {
    render();

    fireEvent.changeText(screen.getByTestId('template-search'), 'underwater basket weaving');

    expect(screen.getByTestId('templates-no-results')).toBeOnTheScreen();
  });

  it('brings the whole list back when the search is cleared', async () => {
    render();
    fireEvent.changeText(screen.getByTestId('template-search'), 'gate');

    fireEvent.changeText(screen.getByTestId('template-search'), '');

    expect(screen.getByTestId('template-ca-final')).toBeOnTheScreen();
  });

  /** Searching inside a filter the student can see, rather than ignoring it. */
  it('searches within the chosen category', async () => {
    render();
    fireEvent.press(screen.getByRole('button', { name: 'School' }));

    fireEvent.changeText(screen.getByTestId('template-search'), 'gate');

    expect(screen.getByTestId('templates-no-results')).toBeOnTheScreen();
  });
});

describe('every template a student can import', () => {
  it('includes the exams and classes the library promises', () => {
    const ids = new Set(bundledTemplates.map((template) => template.id));

    for (const expected of [
      'neet-pg',
      'ca-intermediate',
      'upsc-cse',
      'ssc-cgl',
      'ca-foundation',
      'ca-final',
      'cbse-class-12-pcm',
      'cbse-class-12-pcmb',
      'cbse-class-12-commerce',
      'cbse-class-12-humanities',
      'cbse-class-11-pcm',
      'cbse-class-11-pcmb',
      'cbse-class-11-commerce',
      'cbse-class-11-humanities',
      'cbse-class-10',
      'cbse-class-9',
      'mbbs',
      'devops',
      'gate-cs-it',
    ]) {
      expect(ids).toContain(expected);
    }
  });

  /**
   * A template with no chapters imports as a list of empty subjects, which
   * looks to a student exactly like the import having failed.
   */
  it('has real content in every subject', () => {
    for (const template of bundledTemplates) {
      for (const subject of template.subjects) {
        expect(subject.chapters.length).toBeGreaterThan(0);
        for (const chapter of subject.chapters) {
          expect(chapter.topics.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
