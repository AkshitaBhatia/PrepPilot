import type { SyllabusTemplate } from '../template';
import { cbseTemplates } from './cbse';
import { gateCsIt, neetPg, sscCgl, upscCse } from './competitive';
import { caFinal, caFoundation, caIntermediate } from './professional';
import { devops, mbbs } from './programmes';

/**
 * The curated template library.
 *
 * Hand-written from published syllabi rather than generated from a PDF, because
 * these bodies do not publish one machine-readable syllabus between them. Each
 * carries the source it was transcribed from, which is what the preview shows a
 * student deciding whether to trust it.
 *
 * Ordered roughly by how many students sit them, since the library is a list
 * before it is a search.
 */
export const curatedTemplates: readonly SyllabusTemplate[] = [
  ...cbseTemplates,
  neetPg,
  upscCse,
  sscCgl,
  gateCsIt,
  caFoundation,
  caIntermediate,
  caFinal,
  mbbs,
  devops,
];
