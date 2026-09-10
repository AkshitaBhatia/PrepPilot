import { create } from 'zustand';
import type { Repositories } from '../../db/client';
import type { NoteEntry, NoteLevel } from '../../db/repositories/notes';
import { activeTrackerId } from '../trackers/trackers-store';

/** A topic a note can be attached to, with enough context to tell two apart. */
export interface NoteTarget {
  readonly topicId: string;
  readonly topicName: string;
  readonly chapterName: string;
  readonly subjectName: string;
  readonly hasNote: boolean;
}

export interface NotesState {
  readonly notes: readonly NoteEntry[];
  /** Topics in the current course, for choosing where a new note goes. */
  readonly targets: readonly NoteTarget[];
  readonly loading: boolean;
  readonly error: string | null;
}

export interface NotesActions {
  load: (userId: string, repositories: Repositories) => Promise<void>;
  save: (id: string, level: NoteLevel, note: string) => Promise<boolean>;
  remove: (id: string, level: NoteLevel) => Promise<void>;
  clearError: () => void;
}

const initialState: NotesState = { notes: [], targets: [], loading: false, error: null };

interface Context {
  readonly userId: string;
  readonly repositories: Repositories;
}

let context: Context | null = null;

function requireContext(): Context {
  if (context === null) {
    throw new Error('Notes used before load() — call load(userId, repositories) first.');
  }
  return context;
}

export const useNotesStore = create<NotesState & NotesActions>((set, get) => ({
  ...initialState,

  /**
   * Reads the notes, and the topics one could be written against.
   *
   * The targets come along because writing a note from this tab means choosing
   * where it goes, and a picker that has to fetch its own options would leave
   * the student looking at a spinner after they had already decided.
   */
  async load(userId, repositories) {
    context = { userId, repositories };
    set({ loading: true, error: null });

    try {
      const tracker = activeTrackerId();
      const notes = await repositories.notes.listByUser(userId, tracker);
      const subjects = await repositories.subjects.listByUser(userId, tracker);

      const targets: NoteTarget[] = [];
      for (const subject of subjects) {
        const chapters = await repositories.chapters.listBySubject(subject.id);
        for (const chapter of chapters) {
          for (const topic of await repositories.topics.listByChapter(chapter.id)) {
            targets.push({
              topicId: topic.id,
              topicName: topic.name,
              chapterName: chapter.name,
              subjectName: subject.name,
              hasNote: topic.note !== null && topic.note.trim().length > 0,
            });
          }
        }
      }

      set({ notes, targets });
    } catch {
      set({ error: 'We could not open your notes. Pull down to try again.' });
    } finally {
      set({ loading: false });
    }
  },

  /**
   * Writes a note, whether it is the first one on that topic or a correction.
   *
   * Returns whether it landed, so the editor can stay open — and keep what the
   * student typed — when it did not.
   */
  async save(id, level, note) {
    const ctx = requireContext();
    const trimmed = note.trim();
    if (trimmed.length === 0) {
      set({ error: 'A note needs something in it.' });
      return false;
    }

    try {
      await writeNote(ctx, id, level, trimmed);
      await get().load(ctx.userId, ctx.repositories);
      return true;
    } catch {
      set({ error: 'We could not save that note. Try again.' });
      return false;
    }
  },

  async remove(id, level) {
    const ctx = requireContext();

    try {
      await writeNote(ctx, id, level, null);
      await get().load(ctx.userId, ctx.repositories);
    } catch {
      set({ error: 'We could not delete that note. Try again.' });
    }
  },

  clearError() {
    set({ error: null });
  },
}));

/**
 * A note lives on its topic or sub-topic, so clearing it is the same write as
 * emptying it. Keeping that in one place is what stops "delete" and "save an
 * empty note" drifting into two different behaviours.
 */
function writeNote(ctx: Context, id: string, level: NoteLevel, note: string | null): Promise<void> {
  return level === 'topic'
    ? ctx.repositories.topics.setNote(id, note)
    : ctx.repositories.subtopics.setNote(id, note);
}

/** Test seam: clears the store and its captured context. */
export function resetNotesStore(): void {
  context = null;
  useNotesStore.setState({ ...initialState });
}
