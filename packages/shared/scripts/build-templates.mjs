#!/usr/bin/env node
/**
 * Turns the syllabus PDFs in docs/syllabus-sources into bundled.generated.ts.
 *
 * The PDFs encode their hierarchy in font size alone — every heading sits at the
 * same indentation, so text extraction on its own flattens them. This reads the
 * sizes out of poppler's XML instead.
 *
 * Run it after changing a source PDF:
 *   pnpm --filter @preppilot/shared build:templates
 *
 * The output is committed rather than generated at build time: the content is
 * static, a reviewer should see what changed in a diff, and nobody should need
 * poppler installed to build the app.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCES = resolve(here, '../../../docs/syllabus-sources');
const OUTPUT = resolve(here, '../src/templates/bundled.generated.ts');

/** Font sizes the source PDFs use for each level of the hierarchy. */
const SIZE = { template: 27, subject: 20, chapter: 16, topic: 13 };
/** The cover page's title and standfirst, which carry no syllabus content. */
const COVER_SIZES = new Set([36, 12, 11]);

function extract(pdfPath) {
  const xml = execFileSync('pdftohtml', ['-xml', '-i', '-stdout', pdfPath], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  const sizes = new Map();
  const rows = [];

  for (const page of xml.split('<page ').slice(1)) {
    for (const [, id, size] of page.matchAll(/<fontspec id="(\d+)" size="(\d+)"/g)) {
      sizes.set(id, Number(size));
    }
    for (const [, id, markup] of page.matchAll(/<text[^>]*font="(\d+)"[^>]*>([\s\S]*?)<\/text>/g)) {
      const text = decode(markup.replace(/<[^>]+>/g, '')).trim();
      if (text.length === 0 || /PrepPilot . Readable Syllabus . Page \d+/.test(text)) continue;
      rows.push({ size: sizes.get(id), text });
    }
  }

  return rows;
}

function decode(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&#39;', "'");
}

function build(rows, sourceName) {
  const templates = [];

  for (const { size, text } of rows) {
    const current = templates.at(-1);
    const subject = current?.subjects.at(-1);
    const chapter = subject?.chapters.at(-1);

    switch (size) {
      case SIZE.template:
        templates.push({ name: text, subjects: [] });
        break;
      case SIZE.subject:
        if (current === undefined) throw new Error(`Subject "${text}" before any template`);
        current.subjects.push({ name: text, chapters: [] });
        break;
      case SIZE.chapter:
        if (subject === undefined) throw new Error(`Chapter "${text}" before any subject`);
        subject.chapters.push({ name: text, topics: [] });
        break;
      case SIZE.topic:
        if (chapter === undefined) throw new Error(`Topic "${text}" before any chapter`);
        chapter.topics.push({ name: text.replace(/^[•\s]+/, '').trim() });
        break;
      default:
        // A size that is neither hierarchy nor cover means the source changed
        // shape; flattening it silently would lose syllabus content.
        if (!COVER_SIZES.has(size)) {
          throw new Error(`${sourceName}: unexpected font size ${size} on "${text}"`);
        }
    }
  }

  return templates;
}

/**
 * What the preview says a template came from.
 *
 * The filename is provenance for whoever maintains the repository, not
 * something useful on a card a student is deciding whether to trust. That
 * detail lives in docs/syllabus-sources instead.
 */
const SOURCE_LABEL = {
  '01_JEE_NEET_Expanded_Syllabus_READABLE.pdf': 'Official exam syllabus, included with PrepPilot.',
};

/** A stable id, so a re-run does not renumber every template. */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function categorise(name) {
  return /jee|neet|jam|cuet|gate/i.test(name) ? 'exam' : 'school';
}

const pdfs = readdirSync(SOURCES)
  .filter((file) => file.endsWith('.pdf'))
  .sort();

if (pdfs.length === 0) {
  console.error(`No PDFs in ${SOURCES}`);
  process.exit(1);
}

const all = [];
for (const pdf of pdfs) {
  const templates = build(extract(join(SOURCES, pdf)), pdf);
  if (templates.length === 0) throw new Error(`${pdf}: no templates found`);

  for (const template of templates) {
    all.push({
      id: slugify(template.name),
      name: template.name,
      category: categorise(template.name),
      source: pdf,
      subjects: template.subjects,
    });
  }
  console.error(`${pdf}: ${templates.map((t) => t.name).join(', ')}`);
}

const ids = new Set();
for (const template of all) {
  if (ids.has(template.id)) throw new Error(`Duplicate template id "${template.id}"`);
  ids.add(template.id);
}

const counts = (template) => {
  const chapters = template.subjects.flatMap((subject) => subject.chapters);
  return {
    subjects: template.subjects.length,
    chapters: chapters.length,
    topics: chapters.reduce((total, chapter) => total + chapter.topics.length, 0),
  };
};

/** "A, B and C" — the subjects, so the description says something the counts do not. */
function listSubjects(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

const body = all.map((template) => {
  return {
    id: template.id,
    name: template.name,
    // The card already shows the counts underneath; repeating them here wastes
    // the one line that could say what the syllabus actually covers.
    description: `${listSubjects(template.subjects.map((subject) => subject.name))}.`,
    category: template.category,
    source: SOURCE_LABEL[template.source] ?? 'Included with PrepPilot.',
    // These ship as the app's own content: the project owner supplies and
    // vouches for them, so a student choosing one is not being asked to check
    // it first. `verified` still marks anything whose accuracy is not claimed.
    verified: true,
    subjects: template.subjects,
  };
});

writeFileSync(
  OUTPUT,
  `// GENERATED by packages/shared/scripts/build-templates.mjs — do not edit by hand.
// Source PDFs live in docs/syllabus-sources. Re-run: pnpm --filter @preppilot/shared build:templates
import type { SyllabusTemplate } from './template';

export const generatedTemplates: readonly SyllabusTemplate[] = ${JSON.stringify(body, null, 2)};
`,
);

// Formatted here so re-running the generator produces no diff of its own, and
// CI's format check never disagrees with the tool that wrote the file.
execFileSync('npx', ['prettier', '--write', OUTPUT], { stdio: 'ignore' });

const total = body.reduce(
  (sum, template) => sum + counts(template).topics,
  0,
);
console.error(`\nWrote ${body.length} templates, ${total} topics -> ${OUTPUT}`);
