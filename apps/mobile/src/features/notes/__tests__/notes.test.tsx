import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { RefreshControl } from 'react-native';
import type { Repositories } from '../../../db/client';
import { getRepositories } from '../../../db/client';
import {
  createTestClock,
  createTestDatabase,
  createTestRepositories,
} from '../../../db/test-support/test-database';
import { renderWithTheme } from '../../../test-utils/render';
import { useAuthStore } from '../../auth/auth-store';
import { NotesScreen } from '../notes-screen';
import { resetNotesStore } from '../notes-store';

jest.mock('../../../db/client', () => ({ getRepositories: jest.fn() }));
jest.mock('../../../lib/supabase', () => ({
  getSupabase: jest.fn(),
  startAutoRefresh: jest.fn(() => jest.fn()),
}));

const USER = 'user-1';

let db: ReturnType<typeof createTestDatabase>;
let repositories: Repositories;

beforeEach(() => {
  db = createTestDatabase();
  repositories = createTestRepositories(db, createTestClock());
  (getRepositories as jest.MockedFunction<typeof getRepositories>).mockReturnValue(repositories);
  jest.mocked(router.push).mockClear();
  resetNotesStore();
  useAuthStore.setState({ user: { id: USER } as never, status: 'signedIn' });
});

afterEach(() => {
  db.$close();
});

/** Creates a topic and optionally writes a note on it. */
async function seedTopic(name: string, note?: string, subjectName = 'Physics') {
  const subject = await repositories.subjects.create({ userId: USER, name: subjectName });
  const chapter = await repositories.chapters.create({
    userId: USER,
    subjectId: subject.id,
    name: 'Electricity',
  });
  const topic = await repositories.topics.create({
    userId: USER,
    chapterId: chapter.id,
    name,
  });
  if (note !== undefined) await repositories.topics.setNote(topic.id, note);
  return topic;
}

const render = async () => {
  const view = renderWithTheme(<NotesScreen />);
  await act(async () => {
    await Promise.resolve();
  });
  return view;
};

describe('with no notes', () => {
  it('says where notes come from rather than just that there are none', async () => {
    await render();

    await waitFor(() => expect(screen.getByTestId('notes-empty')).toBeOnTheScreen());
    expect(screen.getByText(/choose Add note/)).toBeOnTheScreen();
  });

  it('offers a way to the tracker, which is where notes are written', async () => {
    await render();

    await waitFor(() => expect(screen.getByTestId('notes-empty')).toBeOnTheScreen());
    fireEvent.press(screen.getByRole('button', { name: 'Go to the tracker' }));

    expect(router.push).toHaveBeenCalledWith('/');
  });

  it('offers no search box when there is nothing to search', async () => {
    await render();

    await waitFor(() => expect(screen.getByTestId('notes-empty')).toBeOnTheScreen());
    expect(screen.queryByLabelText('Search notes')).toBeNull();
  });
});

describe('listing notes', () => {
  it('shows the note with the topic it belongs to', async () => {
    // A note is meaningless without knowing what it is about.
    await seedTopic("Ohm's law", 'V = IR. Remember the triangle.');

    await render();

    await waitFor(() =>
      expect(screen.getByText('V = IR. Remember the triangle.')).toBeOnTheScreen(),
    );
    expect(screen.getByText("Ohm's law")).toBeOnTheScreen();
    expect(screen.getByText('Physics · Electricity')).toBeOnTheScreen();
  });

  it('leaves out topics that have no note', async () => {
    await seedTopic('Has one', 'A note');
    await seedTopic('Has none', undefined, 'Chemistry');

    await render();

    await waitFor(() => expect(screen.getByText('A note')).toBeOnTheScreen());
    expect(screen.queryByText('Has none')).toBeNull();
  });

  it('leaves out a note whose topic was deleted', async () => {
    const topic = await seedTopic('Doomed', 'Goes with it');
    await repositories.topics.softDelete(topic.id);

    await render();

    await waitFor(() => expect(screen.getByTestId('notes-empty')).toBeOnTheScreen());
  });

  it('leaves out a note whose whole subject was deleted', async () => {
    const topic = await seedTopic('Orphan', 'Also goes');
    const subjects = await repositories.subjects.listByUser(USER);
    await repositories.subjects.softDelete(subjects[0]!.id);
    expect(topic).toBeDefined();

    await render();

    await waitFor(() => expect(screen.getByTestId('notes-empty')).toBeOnTheScreen());
  });
});

describe('searching', () => {
  it('matches the note text', async () => {
    await seedTopic("Ohm's law", 'V = IR');
    await seedTopic('Photosynthesis', 'Chlorophyll absorbs light', 'Biology');

    await render();
    await waitFor(() => expect(screen.getByText('V = IR')).toBeOnTheScreen());

    fireEvent.changeText(screen.getByLabelText('Search notes'), 'chlorophyll');

    expect(screen.getByText('Chlorophyll absorbs light')).toBeOnTheScreen();
    expect(screen.queryByText('V = IR')).toBeNull();
  });

  it('matches the subject, so a whole subject can be pulled up', async () => {
    await seedTopic("Ohm's law", 'V = IR');
    await seedTopic('Photosynthesis', 'Chlorophyll', 'Biology');

    await render();
    await waitFor(() => expect(screen.getByText('V = IR')).toBeOnTheScreen());

    fireEvent.changeText(screen.getByLabelText('Search notes'), 'biology');

    expect(screen.getByText('Chlorophyll')).toBeOnTheScreen();
    expect(screen.queryByText('V = IR')).toBeNull();
  });

  it('says nothing matched rather than looking empty', async () => {
    await seedTopic("Ohm's law", 'V = IR');

    await render();
    await waitFor(() => expect(screen.getByText('V = IR')).toBeOnTheScreen());

    fireEvent.changeText(screen.getByLabelText('Search notes'), 'nothing like this');

    expect(screen.getByTestId('notes-no-match')).toBeOnTheScreen();
  });
});

describe('when notes cannot be read', () => {
  it('says so instead of showing an empty list', async () => {
    jest.spyOn(repositories.notes, 'listByUser').mockRejectedValue(new Error('SQLITE_BUSY'));

    await render();

    await waitFor(() => expect(screen.getByText(/could not open your notes/)).toBeOnTheScreen());
  });
});

describe('pulling to refresh', () => {
  it('picks up a note written elsewhere', async () => {
    // Notes are written on the tracker, so this screen has to re-read rather
    // than trust what it loaded when it first mounted.
    await render();
    await waitFor(() => expect(screen.getByTestId('notes-empty')).toBeOnTheScreen());

    await seedTopic("Ohm's law", 'Written on another screen');
    await act(async () => {
      screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });

    await waitFor(() => expect(screen.getByText('Written on another screen')).toBeOnTheScreen());
  });
});

/**
 * The tab used to be read-only: fixing a typo meant finding the topic again in a
 * collapsed syllabus. Notes that are awkward to correct stop being written.
 */
describe('managing notes from the Notes tab', () => {
  const openFirstNote = async () => {
    const topic = await seedTopic("Ohm's law", 'V equals I times R.');
    await render();
    await act(async () => {
      fireEvent.press(screen.getByTestId(`note-${topic.id}`));
    });
    return topic;
  };

  it('opens a note to edit by tapping it', async () => {
    await openFirstNote();

    expect(screen.getByTestId('note-input').props.value).toBe('V equals I times R.');
  });

  it('shows where the note sits, so the student can see what they are editing', async () => {
    await openFirstNote();

    expect(screen.getByText("Physics · Electricity · Ohm's law")).toBeOnTheScreen();
  });

  it('saves a correction and shows it straight away', async () => {
    await openFirstNote();

    fireEvent.changeText(screen.getByTestId('note-input'), 'V = IR, and P = VI.');
    await act(async () => {
      fireEvent.press(screen.getByTestId('note-save'));
    });

    await waitFor(() => expect(screen.getByText('V = IR, and P = VI.')).toBeOnTheScreen());
  });

  /** The same row the tracker reads, so the two can never disagree. */
  it('writes the correction back to the topic itself', async () => {
    const topic = await openFirstNote();

    fireEvent.changeText(screen.getByTestId('note-input'), 'Corrected.');
    await act(async () => {
      fireEvent.press(screen.getByTestId('note-save'));
    });

    await waitFor(async () =>
      expect((await repositories.topics.findById(topic.id))?.note).toBe('Corrected.'),
    );
  });

  it('refuses to save an empty note rather than silently deleting it', async () => {
    await openFirstNote();

    fireEvent.changeText(screen.getByTestId('note-input'), '   ');
    await act(async () => {
      fireEvent.press(screen.getByTestId('note-save'));
    });

    expect(screen.getByText('A note needs something in it.')).toBeOnTheScreen();
  });

  it('keeps what was typed when the write fails', async () => {
    await openFirstNote();
    jest.spyOn(repositories.topics, 'setNote').mockRejectedValueOnce(new Error('disk'));

    fireEvent.changeText(screen.getByTestId('note-input'), 'Worth keeping.');
    await act(async () => {
      fireEvent.press(screen.getByTestId('note-save'));
    });

    expect(screen.getByTestId('note-input').props.value).toBe('Worth keeping.');
    expect(screen.getByText('We could not save that note. Try again.')).toBeOnTheScreen();
  });

  it('leaves the note alone when the editor is cancelled', async () => {
    await openFirstNote();

    fireEvent.changeText(screen.getByTestId('note-input'), 'Discard me.');
    await act(async () => {
      fireEvent.press(screen.getByTestId('note-cancel'));
    });

    expect(screen.getByText('V equals I times R.')).toBeOnTheScreen();
  });

  it('does not carry one note’s text into the next', async () => {
    const first = await seedTopic('First topic', 'First note.');
    const second = await seedTopic('Second topic', 'Second note.', 'Chemistry');
    await render();

    await act(async () => {
      fireEvent.press(screen.getByTestId(`note-${first.id}`));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('note-cancel'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId(`note-${second.id}`));
    });

    expect(screen.getByTestId('note-input').props.value).toBe('Second note.');
  });
});

describe('deleting a note', () => {
  const openDelete = async () => {
    const topic = await seedTopic("Ohm's law", 'V equals I times R.');
    await render();
    await act(async () => {
      fireEvent.press(screen.getByTestId(`note-${topic.id}`));
    });
    fireEvent.press(screen.getByTestId('note-delete'));
    return topic;
  };

  /** Nothing else in the app keeps a copy, so it asks before destroying one. */
  it('asks before destroying it', async () => {
    await openDelete();

    expect(screen.getByText('Delete this note?')).toBeOnTheScreen();
  });

  it('keeps the note when the student backs out', async () => {
    await openDelete();

    fireEvent.press(screen.getByTestId('note-delete-cancel'));

    expect(screen.getByTestId('note-input').props.value).toBe('V equals I times R.');
  });

  it('removes it from the list once confirmed', async () => {
    const topic = await openDelete();

    await act(async () => {
      fireEvent.press(screen.getByTestId('note-delete-confirm'));
    });

    await waitFor(() => expect(screen.queryByTestId(`note-${topic.id}`)).toBeNull());
  });

  /** Deleting the note must not delete the topic it was written on. */
  it('leaves the topic itself in the syllabus', async () => {
    const topic = await openDelete();

    await act(async () => {
      fireEvent.press(screen.getByTestId('note-delete-confirm'));
    });

    await waitFor(async () => {
      const row = await repositories.topics.findById(topic.id);
      expect(row?.note).toBeNull();
      expect(row?.name).toBe("Ohm's law");
    });
  });
});

describe('writing a new note from the Notes tab', () => {
  it('lists the topics a note can be written on', async () => {
    const topic = await seedTopic("Ohm's law");
    await render();

    fireEvent.press(screen.getByTestId('add-note'));

    expect(screen.getByTestId(`note-target-${topic.id}`)).toBeOnTheScreen();
  });

  it('narrows the topics as the student types', async () => {
    const ohm = await seedTopic("Ohm's law");
    const acids = await seedTopic('Acids and bases', undefined, 'Chemistry');
    await render();
    fireEvent.press(screen.getByTestId('add-note'));

    fireEvent.changeText(screen.getByTestId('note-target-search'), 'acids');

    expect(screen.getByTestId(`note-target-${acids.id}`)).toBeOnTheScreen();
    expect(screen.queryByTestId(`note-target-${ohm.id}`)).toBeNull();
  });

  it('writes the note against the topic chosen', async () => {
    const topic = await seedTopic("Ohm's law");
    await render();
    fireEvent.press(screen.getByTestId('add-note'));

    fireEvent.press(screen.getByTestId(`note-target-${topic.id}`));
    fireEvent.changeText(screen.getByTestId('note-input'), 'Current is proportional to voltage.');
    await act(async () => {
      fireEvent.press(screen.getByTestId('note-save'));
    });

    await waitFor(() =>
      expect(screen.getByText('Current is proportional to voltage.')).toBeOnTheScreen(),
    );
  });

  /**
   * A topic holds one note. Starting a "new" one on a topic that already has
   * one would either overwrite it silently or leave two — both worse than
   * simply opening the note that is there.
   */
  it('opens the existing note when the topic already has one', async () => {
    const topic = await seedTopic("Ohm's law", 'Already written.');
    await render();
    fireEvent.press(screen.getByTestId('add-note'));

    fireEvent.press(screen.getByTestId(`note-target-${topic.id}`));

    expect(screen.getByTestId('note-input').props.value).toBe('Already written.');
  });

  it('says so when the course has no topics to write about', async () => {
    await render();

    fireEvent.press(screen.getByTestId('add-note'));

    expect(screen.getByTestId('note-targets-empty')).toBeOnTheScreen();
  });
});

/**
 * A note written on a sub-topic never appeared here, which made the tab look
 * like it was losing them.
 */
describe('notes written on a sub-topic', () => {
  const seedSubtopicNote = async (note: string) => {
    const topic = await seedTopic('Light');
    const subtopic = await repositories.subtopics.create({
      userId: USER,
      topicId: topic.id,
      name: 'Refraction',
    });
    await repositories.subtopics.setNote(subtopic.id, note);
    return subtopic;
  };

  it('shows up alongside the rest', async () => {
    const subtopic = await seedSubtopicNote('Bends towards the normal.');

    await render();

    expect(screen.getByTestId(`note-${subtopic.id}`)).toBeOnTheScreen();
    expect(screen.getByText('Bends towards the normal.')).toBeOnTheScreen();
  });

  it('is marked as a sub-topic, so its place is clear', async () => {
    await seedSubtopicNote('Bends towards the normal.');

    await render();

    expect(screen.getByText('Sub-topic')).toBeOnTheScreen();
  });

  it('can be edited from here too', async () => {
    const subtopic = await seedSubtopicNote('Bends towards the normal.');
    await render();

    await act(async () => {
      fireEvent.press(screen.getByTestId(`note-${subtopic.id}`));
    });
    fireEvent.changeText(screen.getByTestId('note-input'), 'Snell’s law.');
    await act(async () => {
      fireEvent.press(screen.getByTestId('note-save'));
    });

    await waitFor(async () =>
      expect((await repositories.subtopics.findById(subtopic.id))?.note).toBe('Snell’s law.'),
    );
  });
});
