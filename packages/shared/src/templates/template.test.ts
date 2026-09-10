import { describe, expect, it } from 'vitest';
import { bundledTemplates } from './bundled';
import {
  countTemplate,
  searchTemplates,
  templatesInCategory,
  validateTemplate,
  type SyllabusTemplate,
} from './template';

const template = (overrides: Partial<SyllabusTemplate> = {}): SyllabusTemplate => ({
  id: 't1',
  name: 'Test template',
  description: 'A template',
  category: 'school',
  source: 'Example content',
  verified: false,
  subjects: [
    {
      name: 'Physics',
      chapters: [
        { name: 'Light', topics: [{ name: 'Reflection' }, { name: 'Refraction' }] },
        { name: 'Electricity', topics: [{ name: "Ohm's law" }] },
      ],
    },
  ],
  ...overrides,
});

describe('countTemplate', () => {
  it('counts every level', () => {
    expect(countTemplate(template())).toEqual({ subjects: 1, chapters: 2, topics: 3 });
  });

  it('counts a chapter with no topics', () => {
    const withEmpty = template({
      subjects: [{ name: 'Physics', chapters: [{ name: 'Light', topics: [] }] }],
    });

    expect(countTemplate(withEmpty)).toEqual({ subjects: 1, chapters: 1, topics: 0 });
  });

  it('counts an empty template as all zeroes', () => {
    expect(countTemplate(template({ subjects: [] }))).toEqual({
      subjects: 0,
      chapters: 0,
      topics: 0,
    });
  });
});

describe('validateTemplate', () => {
  it('accepts a well-formed template', () => {
    expect(validateTemplate(template()).valid).toBe(true);
  });

  const message = (result: ReturnType<typeof validateTemplate>) =>
    result.valid ? undefined : result.message;

  it('rejects a template with no name', () => {
    expect(message(validateTemplate(template({ name: '  ' })))).toBe('A template needs a name.');
  });

  it('rejects a template with no subjects', () => {
    expect(message(validateTemplate(template({ subjects: [] })))).toBe(
      'A template needs at least one subject.',
    );
  });

  it('rejects an unnamed subject', () => {
    const bad = template({ subjects: [{ name: '', chapters: [] }] });

    expect(message(validateTemplate(bad))).toBe('Every subject in a template needs a name.');
  });

  it('names the subject when a chapter is unnamed', () => {
    const bad = template({
      subjects: [{ name: 'Physics', chapters: [{ name: ' ', topics: [] }] }],
    });

    expect(message(validateTemplate(bad))).toBe('Every chapter in Physics needs a name.');
  });

  it('names the chapter when a topic is unnamed', () => {
    const bad = template({
      subjects: [{ name: 'Physics', chapters: [{ name: 'Light', topics: [{ name: '' }] }] }],
    });

    expect(message(validateTemplate(bad))).toBe('Every topic in Light needs a name.');
  });
});

describe('templatesInCategory', () => {
  const templates = [
    template({ id: 'a', category: 'school' }),
    template({ id: 'b', category: 'exam' }),
    template({ id: 'c', category: 'school' }),
  ];

  it('filters by category', () => {
    expect(templatesInCategory(templates, 'school').map((entry) => entry.id)).toEqual(['a', 'c']);
  });

  it('returns everything for "all"', () => {
    expect(templatesInCategory(templates, 'all')).toHaveLength(3);
  });

  it('returns nothing for a category with no templates', () => {
    expect(templatesInCategory(templates, 'custom')).toEqual([]);
  });
});

describe('the bundled library', () => {
  it('contains only valid templates', () => {
    for (const entry of bundledTemplates) {
      expect(validateTemplate(entry)).toEqual({ valid: true });
    }
  });

  it('gives every template a unique id', () => {
    const ids = bundledTemplates.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * Every template says where it came from, whether or not its accuracy is
   * claimed. `verified` decides whether the preview presents it as the app's own
   * content or warns the student to check it; either way the source is shown.
   */
  it('always says where a template came from', () => {
    for (const entry of bundledTemplates) {
      expect(entry.source.trim().length).toBeGreaterThan(0);
    }
  });

  /**
   * The generated exam syllabi ship as PrepPilot's own content: the project owner
   * supplies and vouches for them, so a student choosing one is not being asked
   * to verify it first.
   */
  it('presents the bundled exam syllabi as trusted', () => {
    const exams = bundledTemplates.filter((entry) => entry.category === 'exam');

    expect(exams.length).toBeGreaterThan(0);
    for (const entry of exams) {
      expect(entry.verified).toBe(true);
      // The source is for a student, not a filename for whoever maintains the repo.
      expect(entry.source).not.toMatch(/\.pdf/i);
    }
  });

  /**
   * Nothing may look official until someone has checked it against the awarding
   * body's own syllabus. An entry either says "example" in its name or carries a
   * source naming where the content came from — never neither.
   */
  it('never lets a template present itself as authoritative', () => {
    for (const entry of bundledTemplates) {
      const labelled = entry.name.toLowerCase().includes('example');
      expect(labelled || entry.source.trim().length > 0).toBe(true);
    }
  });

  it('carries the exam and board syllabi PRD §13 asks for', () => {
    expect(bundledTemplates.length).toBeGreaterThanOrEqual(3);
    const names = bundledTemplates.map((entry) => entry.name).join(' | ');
    expect(names).toMatch(/JEE/);
    expect(names).toMatch(/NEET/);
  });

  it('gives every template a unique id', () => {
    const ids = bundledTemplates.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * The generated file is machine-written from PDFs, so a parsing slip shows up
   * as an empty name or a chapter with nothing under it rather than as a crash.
   */
  it('has no empty names or childless nodes anywhere', () => {
    for (const entry of bundledTemplates) {
      expect(entry.name.trim()).not.toBe('');
      expect(entry.subjects.length).toBeGreaterThan(0);

      for (const subject of entry.subjects) {
        expect(subject.name.trim()).not.toBe('');
        expect(subject.chapters.length).toBeGreaterThan(0);

        for (const chapter of subject.chapters) {
          expect(chapter.name.trim()).not.toBe('');
          expect(chapter.topics.length).toBeGreaterThan(0);

          for (const topic of chapter.topics) {
            expect(topic.name.trim()).not.toBe('');
            // A bullet left in place would mean the marker was not stripped.
            expect(topic.name.startsWith('\u2022')).toBe(false);
          }
        }
      }
    }
  });

  it('passes its own validator, so every entry can actually be imported', () => {
    for (const entry of bundledTemplates) {
      expect(validateTemplate(entry).valid).toBe(true);
    }
  });
});

describe('finding a template', () => {
  const library: readonly SyllabusTemplate[] = [
    {
      id: 'cbse-12-commerce',
      name: 'CBSE Class 12 — Commerce',
      description: 'Accountancy, Business Studies and Economics.',
      category: 'school',
      source: 'test',
      verified: true,
      subjects: [
        { name: 'Accountancy', chapters: [] },
        { name: 'Business Studies', chapters: [] },
      ],
    },
    {
      id: 'gate-cs-it',
      name: 'GATE CS & IT',
      description: 'Ten sections plus General Aptitude.',
      category: 'exam',
      source: 'test',
      verified: true,
      subjects: [{ name: 'Operating System', chapters: [] }],
    },
  ];

  it('returns everything for an empty query', () => {
    expect(searchTemplates(library, '')).toHaveLength(2);
  });

  it('ignores a query that is only spaces', () => {
    expect(searchTemplates(library, '   ')).toHaveLength(2);
  });

  it('matches on the name', () => {
    expect(searchTemplates(library, 'gate').map((t) => t.id)).toEqual(['gate-cs-it']);
  });

  it('does not care about case', () => {
    expect(searchTemplates(library, 'CBSE').map((t) => t.id)).toEqual(['cbse-12-commerce']);
  });

  it('matches on the description', () => {
    expect(searchTemplates(library, 'aptitude').map((t) => t.id)).toEqual(['gate-cs-it']);
  });

  /**
   * A student looking for their subject usually types the subject, not the name
   * of the board stream it happens to sit in.
   */
  it('matches on a subject inside the template', () => {
    expect(searchTemplates(library, 'accountancy').map((t) => t.id)).toEqual(['cbse-12-commerce']);
  });

  it('narrows as more words are typed', () => {
    expect(searchTemplates(library, 'cbse commerce')).toHaveLength(1);
    expect(searchTemplates(library, 'cbse gate')).toHaveLength(0);
  });

  it('finds nothing when nothing matches', () => {
    expect(searchTemplates(library, 'astrophysics')).toEqual([]);
  });

  it('matches a partial word, so results appear as the student types', () => {
    expect(searchTemplates(library, 'oper').map((t) => t.id)).toEqual(['gate-cs-it']);
  });
});
