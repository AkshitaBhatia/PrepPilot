/**
 * AI proposals for tracker changes.
 *
 * PRD §14 forbids the assistant changing anything on its own: it may not mark
 * topics complete, delete topics, alter the syllabus or impose schedules. Where
 * it wants to change something, the flow is
 *
 *   AI Proposal → User Review → Confirmation → Apply
 *
 * So a model reply is parsed into an inert *proposal* that describes what would
 * change. Nothing here touches storage; applying is a separate, explicitly
 * confirmed step. That separation is what makes the rule enforceable rather than
 * a promise in a prompt.
 */

import { isValidName } from '../domain/types';

export const PROPOSAL_KINDS = ['addChapters', 'addTopics'] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export interface ProposedChapter {
  readonly name: string;
  readonly topics: readonly string[];
}

export interface AiProposal {
  readonly kind: ProposalKind;
  /** The subject this would be added to, as named by the student. */
  readonly subjectName: string;
  readonly chapters: readonly ProposedChapter[];
}

export interface ParsedReply {
  /** The prose to show the student. Always present. */
  readonly message: string;
  /** Present only when the reply asked to change the tracker. */
  readonly proposal: AiProposal | null;
}

/**
 * Splits a model reply into prose and an optional proposal.
 *
 * The proposal is expected as a fenced ```preppilot-proposal JSON block. Anything
 * unparseable is treated as prose alone: a malformed block must never become a
 * silent no-op that looks like it applied, nor an error a student has to decode.
 */
export function parseReply(raw: string): ParsedReply {
  const fence = /```preppilot-proposal\s*([\s\S]*?)```/;
  const match = fence.exec(raw);

  const message = raw.replace(fence, '').trim();
  if (match === null) return { message: raw.trim(), proposal: null };

  const proposal = safeParseProposal(match[1] ?? '');
  return { message: message.length > 0 ? message : raw.trim(), proposal };
}

function safeParseProposal(json: string): AiProposal | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const candidate = parsed as Record<string, unknown>;
    const kind = candidate.kind;
    const subjectName = candidate.subjectName;
    const chapters = candidate.chapters;

    if (typeof kind !== 'string' || !PROPOSAL_KINDS.includes(kind as ProposalKind)) return null;
    // A name from a model is untrusted input like any other: it never passes
    // through the sheet that bounds what a student can type.
    if (!isValidName(subjectName)) return null;
    if (!Array.isArray(chapters) || chapters.length === 0) return null;

    const cleaned: ProposedChapter[] = [];
    for (const entry of chapters) {
      if (typeof entry !== 'object' || entry === null) return null;
      const chapter = entry as Record<string, unknown>;

      if (!isValidName(chapter.name)) return null;
      const topics = Array.isArray(chapter.topics) ? chapter.topics : [];
      if (!topics.every(isValidName)) {
        return null;
      }

      cleaned.push({
        name: chapter.name.trim(),
        topics: (topics as string[]).map((topic) => topic.trim()),
      });
    }

    return { kind: kind as ProposalKind, subjectName: subjectName.trim(), chapters: cleaned };
  } catch {
    return null;
  }
}

export interface ProposalSummary {
  readonly chapters: number;
  readonly topics: number;
}

/** What the confirmation step shows, so a student knows the size of what they are accepting. */
export function summariseProposal(proposal: AiProposal): ProposalSummary {
  let topics = 0;
  for (const chapter of proposal.chapters) topics += chapter.topics.length;
  return { chapters: proposal.chapters.length, topics };
}

/**
 * Guards against a proposal large enough that a student could not meaningfully
 * review it. Anything bigger is shown but must be applied a subject at a time.
 */
export const MAX_REVIEWABLE_TOPICS = 200;

export function isReviewable(proposal: AiProposal): boolean {
  return summariseProposal(proposal).topics <= MAX_REVIEWABLE_TOPICS;
}
