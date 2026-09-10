import type { SyllabusTemplate, TemplateSubject } from '../template';
import {
  class10English,
  class10Mathematics,
  class10Science,
  class10SocialScience,
  class9English,
  class9Mathematics,
  class9Science,
  class9SocialScience,
} from './cbse-secondary';
import {
  class11Biology,
  class11Chemistry,
  class11English,
  class11Mathematics,
  class11Physics,
  class12Biology,
  class12Chemistry,
  class12English,
  class12Mathematics,
  class12Physics,
} from './cbse-science';
import {
  class11Accountancy,
  class11BusinessStudies,
  class11Economics,
  class11Geography,
  class11History,
  class11PoliticalScience,
  class11Psychology,
  class11Sociology,
  class12Accountancy,
  class12BusinessStudies,
  class12Economics,
  class12Geography,
  class12History,
  class12PoliticalScience,
  class12Psychology,
  class12Sociology,
} from './cbse-humanities';

const SOURCE = 'CBSE / NCERT syllabus, transcribed for PrepPilot.';

function cbse(
  id: string,
  name: string,
  description: string,
  subjects: readonly TemplateSubject[],
): SyllabusTemplate {
  return { id, name, description, category: 'school', source: SOURCE, verified: true, subjects };
}

/**
 * The CBSE school templates.
 *
 * Classes 11 and 12 are offered per stream rather than as one "class 12"
 * template. A student in Commerce has no use for Physics chapters sitting
 * unticked in their tracker all year, and a syllabus that is mostly other
 * people's subjects stops being a measure of their own progress.
 *
 * The streams are built from the shared subject definitions, so a correction to
 * class 12 Economics reaches Commerce and Humanities at once instead of being
 * fixed in one and forgotten in the other.
 */
export const cbseTemplates: readonly SyllabusTemplate[] = [
  cbse('cbse-class-9', 'CBSE Class 9', 'Mathematics, Science, Social Science and English.', [
    class9Mathematics,
    class9Science,
    class9SocialScience,
    class9English,
  ]),
  cbse('cbse-class-10', 'CBSE Class 10', 'Mathematics, Science, Social Science and English.', [
    class10Mathematics,
    class10Science,
    class10SocialScience,
    class10English,
  ]),

  cbse('cbse-class-11-pcm', 'CBSE Class 11 — PCM', 'Physics, Chemistry, Mathematics and English.', [
    class11Physics,
    class11Chemistry,
    class11Mathematics,
    class11English,
  ]),
  cbse(
    'cbse-class-11-pcmb',
    'CBSE Class 11 — PCMB',
    'Physics, Chemistry, Mathematics, Biology and English.',
    [class11Physics, class11Chemistry, class11Mathematics, class11Biology, class11English],
  ),
  cbse(
    'cbse-class-11-commerce',
    'CBSE Class 11 — Commerce',
    'Accountancy, Business Studies, Economics, Mathematics and English.',
    [
      class11Accountancy,
      class11BusinessStudies,
      class11Economics,
      class11Mathematics,
      class11English,
    ],
  ),
  cbse(
    'cbse-class-11-humanities',
    'CBSE Class 11 — Humanities',
    'History, Political Science, Geography, Psychology, Sociology and English.',
    [
      class11History,
      class11PoliticalScience,
      class11Geography,
      class11Psychology,
      class11Sociology,
      class11English,
    ],
  ),

  cbse('cbse-class-12-pcm', 'CBSE Class 12 — PCM', 'Physics, Chemistry, Mathematics and English.', [
    class12Physics,
    class12Chemistry,
    class12Mathematics,
    class12English,
  ]),
  cbse(
    'cbse-class-12-pcmb',
    'CBSE Class 12 — PCMB',
    'Physics, Chemistry, Mathematics, Biology and English.',
    [class12Physics, class12Chemistry, class12Mathematics, class12Biology, class12English],
  ),
  cbse(
    'cbse-class-12-commerce',
    'CBSE Class 12 — Commerce',
    'Accountancy, Business Studies, Economics, Mathematics and English.',
    [
      class12Accountancy,
      class12BusinessStudies,
      class12Economics,
      class12Mathematics,
      class12English,
    ],
  ),
  cbse(
    'cbse-class-12-humanities',
    'CBSE Class 12 — Humanities',
    'History, Political Science, Geography, Psychology, Sociology and English.',
    [
      class12History,
      class12PoliticalScience,
      class12Geography,
      class12Psychology,
      class12Sociology,
      class12English,
    ],
  ),
];
