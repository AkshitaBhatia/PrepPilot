import { generatedTemplates } from './bundled.generated';
import { curatedTemplates } from './curated';
import type { SyllabusTemplate } from './template';

/**
 * The bundled template library.
 *
 * Templates are bundled rather than fetched (D25) so importing one works
 * offline.
 *
 * The exam and board syllabi come from the PDFs in `docs/syllabus-sources`,
 * converted by `scripts/build-templates.mjs` into `bundled.generated.ts`. They
 * are content, not code: correcting a chapter means editing a source PDF and
 * re-running the generator, with the diff visible in review.
 *
 * They are marked `verified: false` until someone checks them against the
 * awarding body's own published syllabus. Every entry carries `verified` and
 * `source`, and the library screen shows both, so an unchecked template can
 * never look official to a student planning months of study around it.
 *
 * The curated set in `curated/` is hand-written from each body's published
 * syllabus — CBSE, ICAI, UPSC, SSC, NBEMS, NMC and GATE publish no
 * machine-readable syllabus between them, so there is nothing to generate from.
 * Each carries the source it was transcribed from.
 *
 * The two hand-written entries below are examples, kept separate from both and
 * labelled as such.
 */
export const bundledTemplates: readonly SyllabusTemplate[] = [
  ...generatedTemplates,
  ...curatedTemplates,
  {
    id: 'example-class-10-science',
    name: 'Class 10 Science (example)',
    description:
      'A short example syllabus showing how templates work. Replace or extend it with your own.',
    category: 'school',
    source: 'Example content, not an official syllabus',
    verified: false,
    subjects: [
      {
        name: 'Physics',
        chapters: [
          {
            name: 'Light: Reflection and Refraction',
            topics: [
              { name: 'Laws of reflection' },
              { name: 'Spherical mirrors' },
              { name: 'Refraction through a glass slab' },
            ],
          },
          {
            name: 'Electricity',
            topics: [
              { name: "Ohm's law" },
              { name: 'Resistance and resistivity' },
              { name: 'Heating effect of electric current' },
            ],
          },
        ],
      },
      {
        name: 'Chemistry',
        chapters: [
          {
            name: 'Chemical Reactions and Equations',
            topics: [
              { name: 'Writing chemical equations' },
              { name: 'Types of chemical reactions' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'example-study-skills',
    name: 'Study skills (example)',
    description: 'A small non-subject template, useful for trying the import flow.',
    category: 'custom',
    source: 'Example content',
    verified: false,
    subjects: [
      {
        name: 'Study Skills',
        chapters: [
          {
            name: 'Planning',
            topics: [{ name: 'Setting weekly goals' }, { name: 'Breaking down a syllabus' }],
          },
          {
            name: 'Revision',
            topics: [{ name: 'Spaced repetition' }, { name: 'Practice testing' }],
          },
        ],
      },
    ],
  },
];
